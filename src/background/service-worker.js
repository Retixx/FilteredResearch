import {
  REFRESH_ALARM,
  WINDOWS,
  loadSettings,
  normalizeSettings,
} from "../shared/defaults.js";
import {
  bulkPut,
  clearDatabase,
  databaseStats,
  deleteBaselineWorks,
  getAll,
  getById,
  getMetadata,
  getWorksByArxivIds,
  pruneCandidates,
  setMetadata,
} from "../shared/db.js";
import {
  fieldIdsForCategories,
  matchesResearchFilters,
  researchFilterSignature,
} from "../shared/filters.js";
import { OpenAlexClient, cleanWorkForDisplay } from "../shared/openalex.js";
import { scoreBatch } from "../shared/scoring.js";

let refreshPromise = null;
let pendingRefreshReason = null;

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days, from = new Date()) {
  const value = new Date(from);
  value.setUTCDate(value.getUTCDate() - days);
  return isoDate(value);
}

function yearsAgo(years, fromIso) {
  const value = new Date(`${fromIso}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() - years);
  return isoDate(value);
}

function deduplicate(works) {
  return [...new Map(works.map((work) => [work.id, work])).values()];
}

function chooseAuthorIds(works, limit) {
  const priority = [];
  const remainder = [];
  for (const work of works) {
    for (const authorship of work.authorships || []) {
      if (
        authorship.isCorresponding ||
        authorship.position === "first" ||
        authorship.position === "last"
      ) {
        priority.push(authorship.authorId);
      } else {
        remainder.push(authorship.authorId);
      }
    }
  }
  return [...new Set([...priority, ...remainder])].slice(0, limit);
}

async function ensureDefaults() {
  const stored = await chrome.storage.sync.get("settings");
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: normalizeSettings() });
  }
}

async function ensureAlarm() {
  const settings = await loadSettings();
  const alarm = await chrome.alarms.get(REFRESH_ALARM);
  const periodInMinutes = settings.refreshHours * 60;
  if (!alarm || Math.abs((alarm.periodInMinutes || 0) - periodInMinutes) > 0.01) {
    await chrome.alarms.create(REFRESH_ALARM, {
      delayInMinutes: 1,
      periodInMinutes,
    });
  }
}

async function fetchCandidateLanes(client, settings, since, until, seed) {
  const fieldIds = fieldIdsForCategories(settings.selectedCategories);
  const common = { since, until, seed, fieldIds, englishOnly: settings.englishOnly };
  const lanes = [];
  if (settings.selectedCategories.length || !settings.queries.length) {
    lanes.push(client.fetchWorks({ ...common, limit: settings.broadSample }));
  }
  for (const query of settings.queries) {
    lanes.push(
      client.fetchWorks({
        ...common,
        limit: settings.perQuery,
        query,
      }),
    );
  }
  return deduplicate((await Promise.all(lanes)).flat())
    .filter((work) => matchesResearchFilters(work, settings))
    .map((work) => ({ ...work, isBaseline: false }));
}

async function maybeFetchBaseline(client, settings, candidateSince, seed) {
  const signature = researchFilterSignature(settings);
  const previousSignature = await getMetadata("baselineSignature");
  if (previousSignature !== signature) await deleteBaselineWorks();

  const existingWorks = await getAll("works");
  const existingBaseline = existingWorks.filter((work) => work.isBaseline);
  if (
    previousSignature === signature &&
    existingBaseline.length >= Math.min(100, settings.historySample)
  ) {
    return [];
  }

  const baselineUntil = daysAgo(1, new Date(`${candidateSince}T00:00:00Z`));
  const baselineSince = yearsAgo(settings.historyYears, baselineUntil);
  const fieldIds = fieldIdsForCategories(settings.selectedCategories);
  const common = {
    since: baselineSince,
    until: baselineUntil,
    seed: seed + 17,
    baseline: true,
    fieldIds,
    englishOnly: settings.englishOnly,
  };
  const lanes = [];
  if (settings.selectedCategories.length || !settings.queries.length) {
    lanes.push(client.fetchWorks({ ...common, limit: settings.historySample }));
  }
  for (const query of settings.queries) {
    lanes.push(
      client.fetchWorks({
        ...common,
        limit: settings.historyPerQuery,
        query,
        seed: seed + 31,
      }),
    );
  }
  const baseline = deduplicate((await Promise.all(lanes)).flat())
    .filter((work) => matchesResearchFilters(work, settings))
    .map((work) => ({ ...work, isBaseline: true }));
  await setMetadata("baselineSignature", signature);
  return baseline;
}

function safePaperUrl(work) {
  try {
    const url = new URL(work.url || work.doi || `https://openalex.org/${work.id}`);
    if (["https:", "http:"].includes(url.protocol)) return url.href;
  } catch {
    // Use OpenAlex as a known-safe fallback.
  }
  return `https://openalex.org/${work.id}`;
}

async function recordNewPaperNotifications(
  scored,
  settings,
  existingCandidateIds,
  previousLastRefresh,
  reason,
) {
  if (!previousLastRefresh || reason === "install") return 0;
  const previousDate = previousLastRefresh.slice(0, 10);
  const qualifying = scored.filter(
    (work) =>
      !existingCandidateIds.has(work.id) &&
      work.publicationDate >= previousDate &&
      matchesResearchFilters(work, settings) &&
      (work.noveltyScore >= settings.minNovelty ||
        work.researcherScore >= settings.minResearcher),
  );
  if (!qualifying.length) return 0;

  const oldInbox = (await getMetadata("notificationInbox")) || [];
  const known = new Set(oldInbox.map((item) => item.workId));
  const createdAt = new Date().toISOString();
  const entries = qualifying
    .filter((work) => !known.has(work.id))
    .map((work) => ({
      id: `${work.id}:${createdAt}`,
      workId: work.id,
      title: cleanWorkForDisplay(work).title,
      url: safePaperUrl(work),
      publicationDate: work.publicationDate,
      topic: work.subfieldName || work.fieldName || "Research",
      noveltyScore: Math.round(work.noveltyScore || 0),
      researcherScore: Math.round(work.researcherScore || 0),
      createdAt,
      unread: true,
    }));
  if (!entries.length) return 0;
  await setMetadata("notificationInbox", [...entries, ...oldInbox].slice(0, 250));

  if (!settings.notificationsEnabled) return entries.length;
  const permission = await chrome.notifications.getPermissionLevel();
  if (permission !== "granted") return entries.length;
  for (const entry of entries.slice(0, 3)) {
    await chrome.notifications.create(`paper:${entry.workId}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: "New paper cleared your filters",
      message: `${entry.title}\nNovelty ${entry.noveltyScore} · Researcher ${entry.researcherScore}`,
      contextMessage: entry.topic,
      priority: 1,
    });
  }
  if (entries.length > 3) {
    await chrome.notifications.create(`summary:${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: `${entries.length} new papers cleared your filters`,
      message: "Open the FilteredResearch inbox to review the full batch.",
      priority: 1,
    });
  }
  return entries.length;
}

function selectReferences(works, limit) {
  const baseline = works
    .filter((work) => work.isBaseline)
    .sort((left, right) => right.publicationDate.localeCompare(left.publicationDate));
  const recent = works
    .filter((work) => !work.isBaseline)
    .sort((left, right) => right.publicationDate.localeCompare(left.publicationDate));
  const baselineLimit = Math.min(baseline.length, Math.floor(limit * 0.7));
  return [...baseline.slice(0, baselineLimit), ...recent.slice(0, limit - baselineLimit)];
}

async function performRefresh(reason = "manual") {
  const settings = await loadSettings();
  const startedAt = new Date().toISOString();
  await setMetadata("refreshState", { status: "running", reason, startedAt });

  const client = new OpenAlexClient({ apiKey: settings.apiKey });
  const until = isoDate();
  const since = daysAgo(30);
  const bucketMs = settings.refreshHours * 60 * 60 * 1000;
  const seed = Math.floor(Date.now() / bucketMs) % 2_000_000_000;

  try {
    const [previousLastRefresh, previouslyStoredWorks] = await Promise.all([
      getMetadata("lastRefresh"),
      getAll("works"),
    ]);
    const existingCandidateIds = new Set(
      previouslyStoredWorks.filter((work) => !work.isBaseline).map((work) => work.id),
    );
    const [candidates, baseline] = await Promise.all([
      fetchCandidateLanes(client, settings, since, until, seed),
      maybeFetchBaseline(client, settings, since, seed),
    ]);
    if (baseline.length) await bulkPut("works", baseline);

    const existingAuthors = await getAll("authors");
    const freshCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const freshAuthorIds = new Set(
      existingAuthors
        .filter((author) => Date.parse(author.fetchedAt || 0) >= freshCutoff)
        .map((author) => author.id),
    );
    const requestedAuthorIds = chooseAuthorIds(candidates, settings.maxAuthors);
    const missingAuthorIds = requestedAuthorIds.filter((id) => !freshAuthorIds.has(id));
    const fetchedAuthors = await client.fetchAuthors(missingAuthorIds);
    if (fetchedAuthors.length) await bulkPut("authors", fetchedAuthors);

    const allAuthors = deduplicateAuthors([...existingAuthors, ...fetchedAuthors]);
    const existingWorks = await getAll("works");
    const candidateIds = new Set(candidates.map((work) => work.id));
    const references = selectReferences(
      deduplicate([...existingWorks, ...baseline]).filter((work) => !candidateIds.has(work.id)),
      settings.maxReferenceWorks,
    );
    const scored = scoreBatch(candidates, references, allAuthors, {
      maxPeerComparisons: settings.maxPeerComparisons,
    });
    await bulkPut("works", scored);
    const notificationsGenerated = await recordNewPaperNotifications(
      scored,
      settings,
      existingCandidateIds,
      previousLastRefresh,
      reason,
    );

    await pruneCandidates(daysAgo(60));
    const completedAt = new Date().toISOString();
    const state = {
      status: "ready",
      reason,
      startedAt,
      completedAt,
      candidatesFetched: candidates.length,
      baselineFetched: baseline.length,
      authorsFetched: fetchedAuthors.length,
      apiCostUsd: client.costUsd,
      keyPresent: Boolean(settings.apiKey),
      notificationsGenerated,
    };
    await Promise.all([
      setMetadata("lastRefresh", completedAt),
      setMetadata("refreshState", state),
    ]);
    return state;
  } catch (error) {
    const state = {
      status: "error",
      reason,
      startedAt,
      completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
    await setMetadata("refreshState", state);
    throw error;
  }
}

function deduplicateAuthors(authors) {
  return [...new Map(authors.map((author) => [author.id, author])).values()];
}

function refresh(reason) {
  if (refreshPromise) {
    if (reason === "settings") pendingRefreshReason = reason;
    return refreshPromise;
  }
  refreshPromise = performRefresh(reason).finally(() => {
    refreshPromise = null;
    if (pendingRefreshReason) {
      const nextReason = pendingRefreshReason;
      pendingRefreshReason = null;
      refresh(nextReason).catch(console.error);
    }
  });
  return refreshPromise;
}

async function getFeed({ window = "week", sort = "balanced", includeAll = false } = {}) {
  const settings = await loadSettings();
  const windowConfig = WINDOWS[window] || WINDOWS.week;
  const cutoff = daysAgo(windowConfig.days);
  const candidates = (await getAll("works")).filter(
    (work) =>
      !work.isBaseline &&
      work.scoringVersion &&
      work.publicationDate >= cutoff &&
      matchesResearchFilters(work, settings) &&
      (includeAll ||
        work.noveltyScore >= settings.minNovelty ||
        work.researcherScore >= settings.minResearcher),
  );
  const sorters = {
    balanced: (left, right) => right.discoveryScore - left.discoveryScore,
    novelty: (left, right) => right.noveltyScore - left.noveltyScore,
    researcher: (left, right) => right.researcherScore - left.researcherScore,
    newest: (left, right) => right.publicationDate.localeCompare(left.publicationDate),
  };
  candidates.sort(sorters[sort] || sorters.balanced);
  return {
    papers: candidates.map(cleanWorkForDisplay),
    window,
    sort,
    thresholds: {
      novelty: settings.minNovelty,
      researcher: settings.minResearcher,
    },
    stats: await databaseStats(),
  };
}

async function scoreArxivPage({ title, arxivId }) {
  const existing = await getWorksByArxivIds([arxivId]);
  if (existing[arxivId]?.scoringVersion) return existing[arxivId];

  const settings = await loadSettings();
  const client = new OpenAlexClient({ apiKey: settings.apiKey });
  const work = await client.findWorkByTitle(title);
  if (!work) return null;
  work.arxivId ||= arxivId;
  const authorIds = chooseAuthorIds([work], 100);
  const fetchedAuthors = await client.fetchAuthors(authorIds);
  if (fetchedAuthors.length) await bulkPut("authors", fetchedAuthors);
  const allAuthors = deduplicateAuthors([...(await getAll("authors")), ...fetchedAuthors]);
  const references = selectReferences(await getAll("works"), settings.maxReferenceWorks);
  const [scored] = scoreBatch([work], references, allAuthors, {
    maxPeerComparisons: settings.maxPeerComparisons,
  });
  await bulkPut("works", [scored]);
  return scored;
}

async function getNotifications() {
  return (await getMetadata("notificationInbox")) || [];
}

async function markNotificationsRead(ids = []) {
  const selected = new Set(ids.map(String));
  const inbox = await getNotifications();
  const updated = inbox.map((item) => ({
    ...item,
    unread: selected.size ? item.unread && !selected.has(item.id) : false,
  }));
  await setMetadata("notificationInbox", updated);
  return updated.filter((item) => item.unread).length;
}

async function handleMessage(message) {
  switch (message?.type) {
    case "GET_FEED":
      return getFeed(message.payload);
    case "GET_STATUS":
      return databaseStats();
    case "REFRESH":
      return refresh("manual");
    case "SETTINGS_CHANGED":
      await ensureAlarm();
      refresh("settings").catch(console.error);
      return { ok: true };
    case "CLEAR_DATA":
      await clearDatabase();
      return { ok: true };
    case "GET_ARXIV_SCORES":
      return getWorksByArxivIds(message.payload?.ids || []);
    case "SCORE_ARXIV_PAGE":
      return scoreArxivPage(message.payload || {});
    case "GET_NOTIFICATIONS":
      return getNotifications();
    case "MARK_NOTIFICATIONS_READ":
      return markNotificationsRead(message.payload?.ids || []);
    case "CLEAR_NOTIFICATIONS":
      await setMetadata("notificationInbox", []);
      return { ok: true };
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  Promise.all([
    ensureDefaults(),
    ensureAlarm(),
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
  ])
    .then(() => refresh(details.reason === "install" ? "install" : "update"))
    .catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm()
    .then(() => refresh("startup"))
    .catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) refresh("scheduled").catch(console.error);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("paper:")) {
    const workId = notificationId.slice("paper:".length);
    getById("works", workId)
      .then((work) => chrome.tabs.create({ url: safePaperUrl(work || { id: workId }) }))
      .catch(console.error);
  } else {
    chrome.tabs
      .create({ url: chrome.runtime.getURL("src/notifications/notifications.html") })
      .catch(console.error);
  }
  chrome.notifications.clear(notificationId).catch(console.error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
});

ensureDefaults().then(ensureAlarm).catch(console.error);
