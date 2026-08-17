import {
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
  matchesResearchFilters,
  discoveryScopeSignature,
  interestMatchEvidence,
  researchFilterSignature,
  selectionFromSettings,
} from "../shared/filters.js";
import { OpenAlexClient, cleanWorkForDisplay } from "../shared/openalex.js";
import { applySelectivity } from "../shared/ranking.js";
import { groupDuplicatePapers } from "../shared/papers.js";
import { annotateProminence, buildProminentResearcherRoster } from "../shared/prominence.js";
import { SCORING_VERSION, scoreBatch } from "../shared/scoring.js";

const FALLBACK_TAXONOMY = Object.freeze([
  {
    id: "17",
    name: "Computer Science",
    domainName: "Physical Sciences",
    subfields: [
      ["1702", "Artificial Intelligence"],
      ["1703", "Computational Theory and Mathematics"],
      ["1704", "Computer Graphics and Computer-Aided Design"],
      ["1705", "Computer Networks and Communications"],
      ["1706", "Computer Science Applications"],
      ["1707", "Computer Vision and Pattern Recognition"],
      ["1708", "Hardware and Architecture"],
      ["1709", "Human-Computer Interaction"],
      ["1710", "Information Systems"],
      ["1711", "Signal Processing"],
      ["1712", "Software"],
    ].map(([id, name]) => ({ id, name })),
  },
]);

const ARXIV_GROUP_FIELDS = Object.freeze({
  cs: ["17"], econ: ["20"], eess: ["21", "22"], math: ["26"], physics: ["31"],
  "q-bio": ["11", "13", "24", "34"], "q-fin": ["14", "20"], stat: ["18"],
});
const ARXIV_CS_SUBFIELDS = Object.freeze({
  "cs.AI":["1702"],"cs.AR":["1708"],"cs.CC":["1703"],"cs.CE":["1706"],"cs.CG":["1704"],"cs.CL":["1702"],"cs.CR":["1710"],"cs.CV":["1707"],"cs.CY":["1709"],"cs.DB":["1710"],"cs.DC":["1705"],"cs.DL":["1710"],"cs.DM":["1703"],"cs.DS":["1703"],"cs.ET":["1708"],"cs.FL":["1703"],"cs.GL":["17"],"cs.GR":["1704"],"cs.GT":["1703"],"cs.HC":["1709"],"cs.IR":["1710"],"cs.IT":["1711"],"cs.LG":["1702"],"cs.LO":["1703"],"cs.MA":["1702"],"cs.MM":["1704"],"cs.MS":["1706"],"cs.NA":["1706"],"cs.NE":["1702"],"cs.NI":["1705"],"cs.OH":["17"],"cs.OS":["1712"],"cs.PF":["1705"],"cs.PL":["1712"],"cs.RO":["1702"],"cs.SC":["1706"],"cs.SD":["1711"],"cs.SE":["1712"],"cs.SI":["1710"],"cs.SY":["1706"],
});

let refreshPromise = null;
let pendingRefreshReason = null;
let usageAccumulator = null;
let usageFlushTimer = null;

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

async function recordApiUsage(event) {
  const date = isoDate();
  const current = usageAccumulator || (await getMetadata("apiUsageDaily")) || {};
  const base = current.date === date ? current : { date, requests: 0, costUsd: 0 };
  usageAccumulator = {
    ...base, requests: base.requests + 1, costUsd: base.costUsd + Number(event.costUsd || 0),
    hasEstimatedCalls: Boolean(base.hasEstimatedCalls || event.estimated),
    providerRemaining: Number.isFinite(event.remaining) ? event.remaining : base.providerRemaining,
    providerLimit: Number.isFinite(event.limit) ? event.limit : base.providerLimit,
    resetAt: Number.isFinite(event.resetSeconds) ? new Date(Date.now() + event.resetSeconds * 1000).toISOString() : base.resetAt,
    updatedAt: new Date().toISOString(),
  };
  clearTimeout(usageFlushTimer);
  usageFlushTimer = setTimeout(() => {
    setMetadata("apiUsageDaily", usageAccumulator).catch(console.error);
  }, 500);
}

function openAlexClient(options) { return new OpenAlexClient({ ...options, onUsage: recordApiUsage }); }

function deduplicateAuthors(authors) {
  return [...new Map(authors.map((author) => [author.id, author])).values()];
}

async function getProminenceRoster(authors = null) {
  if (authors) {
    const roster = buildProminentResearcherRoster(authors);
    await setMetadata("prominentResearcherRoster", roster);
    return roster;
  }
  const cached = await getMetadata("prominentResearcherRoster");
  if (Array.isArray(cached) && cached.length) return cached;
  return getProminenceRoster(await getAll("authors"));
}

function migratedCoverage(coverage) {
  if (!coverage?.fullCompletedAt || Number(coverage.horizonDays) > 0) return coverage;
  // v0.4 always built a one-year index but did not persist the horizon. Preserve
  // that expensive work instead of interpreting the missing field as zero days.
  return { ...coverage, horizonDays: 365, migratedLegacyHorizon: true };
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
  return [...new Set([...priority, ...remainder])]
    .filter((id) => /^A\d+$/.test(String(id || "")))
    .slice(0, limit);
}

async function ensureDefaults() {
  if (chrome.storage.local.setAccessLevel) {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
  const stored = await chrome.storage.sync.get("settings");
  const normalized = normalizeSettings(stored.settings || {});
  if (JSON.stringify(stored.settings || null) !== JSON.stringify(normalized)) {
    await chrome.storage.sync.set({ settings: normalized });
  }
}

async function getOpenAlexTaxonomy({ force = false } = {}) {
  const cached = await getMetadata("openAlexTaxonomy");
  const fresh = Date.parse(cached?.fetchedAt || 0) >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  if (!force && fresh && cached?.fields?.length) return cached.fields;
  try {
    const settings = await loadSettings();
    const client = openAlexClient({
      apiKey: settings.apiKey,
      maxEstimatedCostUsd: 0.005,
    });
    const fields = await client.fetchTaxonomy();
    if (fields.length) {
      await setMetadata("openAlexTaxonomy", { fields, fetchedAt: new Date().toISOString() });
      return fields;
    }
  } catch (error) {
    console.warn("Taxonomy refresh failed", error);
  }
  return cached?.fields?.length ? cached.fields : FALLBACK_TAXONOMY;
}

function parseArxivTaxonomy(html) {
  const headingPattern = /<h2 class="accordion-head"[^>]*id="accordion-head-grp_([^"]+)"[\s\S]*?<button[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?<\/span>\s*([^<]+?)\s*<\/button>[\s\S]*?<\/h2>/gi;
  const headings = [...html.matchAll(headingPattern)];
  return headings.map((heading, index) => {
    const groupId = heading[1];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index || html.length;
    const body = html.slice(start, end);
    const categories = [...body.matchAll(/<h4>([^ <]+)\s*<span>\(([^<]+)\)<\/span><\/h4>/gi)].map((match) => {
      const code = match[1].trim();
      const mapped = ARXIV_CS_SUBFIELDS[code] || [];
      const mappedFields = mapped.filter((id) => id.length <= 2);
      const mappedSubfields = mapped.filter((id) => id.length > 2);
      return { id: code, name: `${code} — ${match[2].trim()}`, arxivCode: code,
        openAlexFieldIds: mappedFields.length ? mappedFields : mappedSubfields.length ? [] : ARXIV_GROUP_FIELDS[groupId] || [],
        openAlexSubfieldIds: mappedSubfields };
    });
    return { id: groupId, name: heading[2].trim(), domainName: "arXiv", openAlexFieldIds: ARXIV_GROUP_FIELDS[groupId] || [], subfields: categories };
  }).filter((group) => group.subfields.length);
}

async function getArxivTaxonomy({ force = false } = {}) {
  const cached = await getMetadata("arxivTaxonomy");
  const fresh = Date.parse(cached?.fetchedAt || 0) >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  if (!force && fresh && cached?.fields?.length) return cached.fields;
  try {
    const response = await fetch("https://arxiv.org/category_taxonomy", { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(`arXiv taxonomy returned ${response.status}`);
    const fields = parseArxivTaxonomy(await response.text());
    if (fields.length === 8 && fields.reduce((sum, field) => sum + field.subfields.length, 0) >= 150) {
      await setMetadata("arxivTaxonomy", { fields, fetchedAt: new Date().toISOString(), source: "https://arxiv.org/category_taxonomy" });
      return fields;
    }
    throw new Error("arXiv taxonomy response was incomplete");
  } catch (error) {
    console.warn("arXiv taxonomy refresh failed", error);
    if (cached?.fields?.length) return cached.fields;
    return [{ id: "cs", name: "Computer Science", domainName: "arXiv", openAlexFieldIds: ["17"], subfields: Object.entries(ARXIV_CS_SUBFIELDS).map(([id, mapped]) => ({ id, name: id, arxivCode: id, openAlexFieldIds: [], openAlexSubfieldIds: mapped.filter((value) => value.length > 2) })) }];
  }
}

function expandedSubfieldIds(selection, taxonomy) {
  const result = new Set(selection.subfieldIds);
  for (const fieldId of selection.fieldIds) {
    const field = taxonomy.find((item) => item.id === fieldId);
    for (const subfield of field?.subfields || []) result.add(subfield.id);
  }
  return [...result];
}

function progressWriter(baseState) {
  let lastWrite = 0;
  return async (progress) => {
    const now = Date.now();
    if (now - lastWrite < 750 && progress.fetched < progress.total) return;
    lastWrite = now;
    await setMetadata("refreshState", {
      ...baseState,
      status: "running",
      ...progress,
      updatedAt: new Date().toISOString(),
    });
  };
}

async function fetchDiscovery(client, settings, taxonomy, since, until, mode, writeProgress) {
  const selection = selectionFromSettings(settings);
  const hasTaxonomySelection = selection.fieldIds.length || selection.subfieldIds.length;
  const laneLimit = mode === "limited" ? settings.broadSample : settings.maxDiscoveryWorks;
  const lanes = [];
  if (selection.fieldIds.length) {
    for (const query of settings.queries.length ? settings.queries : [""]) {
      lanes.push({ label: query || "selected fields", fieldIds: selection.fieldIds, subfieldIds: [], query });
    }
  }
  if (selection.subfieldIds.length) {
    for (const query of settings.queries.length ? settings.queries : [""]) {
      lanes.push({ label: query || "selected subfields", fieldIds: [], subfieldIds: selection.subfieldIds, query });
    }
  }
  if (!hasTaxonomySelection && settings.queries.length) {
    for (const query of settings.queries) {
      lanes.push({ label: query, fieldIds: [], subfieldIds: [], query });
    }
  }

  if (!lanes.length && !settings.queries.length) {
    const works = await client.fetchWorks({
      since,
      until,
      limit: settings.broadSample,
      seed: Number(isoDate().replaceAll("-", "")),
      englishOnly: settings.englishOnly,
      requireAbstract: false,
    });
    await writeProgress({
      phase: "discovery",
      lane: "cross-disciplinary preview",
      fetched: works.length,
      total: works.length,
      pages: Math.ceil(works.length / 100),
    });
    return {
      works,
      total: works.length,
      retrieved: works.length,
      pages: Math.ceil(works.length / 100),
      truncated: true,
      mode: "preview",
    };
  }

  const allWorks = [];
  let total = 0;
  let pages = 0;
  let truncated = false;
  for (const lane of lanes) {
    const result = await client.fetchWorksCursor({
      since,
      until,
      limit: lane.query ? Math.min(settings.perQuery, laneLimit) : laneLimit,
      query: lane.query || "",
      fieldIds: lane.fieldIds,
      subfieldIds: lane.subfieldIds,
      englishOnly: settings.englishOnly,
      requireAbstract: false,
      onProgress: (progress) =>
        writeProgress({ phase: "discovery", lane: lane.label, ...progress }),
    });
    allWorks.push(...result.works);
    total += result.total;
    pages += result.pages;
    truncated ||= result.truncated;
  }
  const retrieved = groupDuplicatePapers(deduplicate(allWorks));
  const matched = retrieved.filter((work) => matchesResearchFilters(work, settings));
  return {
    works: matched,
    total,
    retrieved: retrieved.length,
    pages,
    truncated,
    mode,
    taxonomySubfields: expandedSubfieldIds(selection, taxonomy).length,
  };
}

async function maybeFetchBaseline(client, settings, taxonomy, candidateSince, writeProgress) {
  const signature = `${discoveryScopeSignature(settings)}:${SCORING_VERSION}`;
  const previousSignature = await getMetadata("baselineSignature");
  if (previousSignature !== signature) await deleteBaselineWorks();

  const selection = selectionFromSettings(settings);
  const targetSubfields = expandedSubfieldIds(selection, taxonomy);
  const existing = (await getAll("works")).filter((work) => work.isBaseline);
  const minimumExpected = targetSubfields.length
    ? targetSubfields.length * Math.min(100, settings.baselinePerSubfield)
    : Math.min(100, settings.baselinePerSubfield);
  if (previousSignature === signature && existing.length >= minimumExpected) return [];

  const until = daysAgo(1, new Date(`${candidateSince}T00:00:00Z`));
  const since = yearsAgo(settings.historyYears, until);
  const baseline = [];
  if (targetSubfields.length) {
    for (let index = 0; index < targetSubfields.length; index += 1) {
      const subfieldId = targetSubfields[index];
      const works = await client.fetchWorks({
        since,
        until,
        limit: settings.baselinePerSubfield,
        seed: 3103 + Number(subfieldId),
        baseline: true,
        subfieldIds: [subfieldId],
        englishOnly: settings.englishOnly,
        requireAbstract: true,
      });
      baseline.push(...works);
      await writeProgress({
        phase: "reference corpus",
        lane: `subfield ${index + 1} of ${targetSubfields.length}`,
        fetched: baseline.length,
        total: targetSubfields.length * settings.baselinePerSubfield,
        pages: Math.ceil(baseline.length / 100),
      });
    }
  } else {
    baseline.push(
      ...(await client.fetchWorks({
        since,
        until,
        limit: settings.baselinePerSubfield,
        seed: 3103,
        baseline: true,
        englishOnly: settings.englishOnly,
        requireAbstract: true,
      })),
    );
  }
  const result = deduplicate(baseline).map((work) => ({ ...work, isBaseline: true }));
  await setMetadata("baselineSignature", signature);
  return result;
}

function selectReferences(works, limit) {
  const baseline = works.filter((work) => work.isBaseline);
  const recent = works
    .filter((work) => !work.isBaseline)
    .sort((left, right) => right.publicationDate.localeCompare(left.publicationDate));
  return [...baseline, ...recent].slice(0, limit);
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

async function qualifiedMonth(settings, allWorks = null) {
  const roster = await getProminenceRoster();
  const relevant = groupDuplicatePapers(allWorks || (await getAll("works"))).map((work) => annotateProminence(work, roster)).filter(
    (work) =>
      !work.isBaseline &&
      work.scoringVersion &&
      work.publicationDate >= daysAgo(30) &&
      matchesResearchFilters(work, settings),
  );
  return applySelectivity(relevant, settings);
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
  const qualified = await qualifiedMonth(settings);
  const qualifiedIds = new Set(qualified.works.map((work) => work.id));
  const newWorks = scored.filter(
    (work) =>
      !existingCandidateIds.has(work.id) &&
      work.publicationDate >= previousDate &&
      qualifiedIds.has(work.id),
  );
  if (!newWorks.length) return 0;

  const oldInbox = (await getMetadata("notificationInbox")) || [];
  const known = new Set(oldInbox.map((item) => item.workId));
  const createdAt = new Date().toISOString();
  const entries = newWorks
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

  const notificationsAllowed =
    settings.notificationsEnabled &&
    (await chrome.permissions.contains({ permissions: ["notifications"] }));
  if (!notificationsAllowed || !chrome.notifications) return entries.length;
  for (const entry of entries.slice(0, 3)) {
    await chrome.notifications.create(`paper:${entry.workId}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: "New paper cleared both filters",
      message: `${entry.title}\nNovelty ${entry.noveltyScore} · Authorship ${entry.researcherScore}`,
      contextMessage: entry.topic,
      priority: 1,
    });
  }
  if (entries.length > 3) {
    await chrome.notifications.create(`summary:${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon-128.png"),
      title: `${entries.length} new papers cleared both filters`,
      message: "Open the FilteredResearch inbox to review the full batch.",
      priority: 1,
    });
  }
  return entries.length;
}

async function performRefresh(reason = "manual") {
  const settings = await loadSettings();
  const taxonomy = await getOpenAlexTaxonomy();
  const signature = discoveryScopeSignature(settings);
  const coverageByScope = (await getMetadata("coverageByScope")) || {};
  const legacyCoverage = await getMetadata("discoveryCoverage");
  const previousCoverage = migratedCoverage(coverageByScope[signature] || (legacyCoverage?.signature === signature ? legacyCoverage : null));
  const selection = selectionFromSettings(settings);
  const hasFocusedScope = selection.fieldIds.length || selection.subfieldIds.length;
  const fullScan =
    Boolean(settings.apiKey) &&
    hasFocusedScope &&
    (["manual", "rebuild"].includes(reason) || !previousCoverage?.fullCompletedAt);
  const mode = fullScan ? "full" : settings.apiKey && hasFocusedScope ? "incremental" : "limited";
  const startedAt = new Date().toISOString();
  const baseState = { reason, startedAt, mode, signature };
  const writeProgress = progressWriter(baseState);
  await writeProgress({ phase: "starting", fetched: 0, total: null, pages: 0 });

  const client = openAlexClient({
    apiKey: settings.apiKey,
    maxEstimatedCostUsd: fullScan ? settings.fullScanBudgetUsd : settings.incrementalScanBudgetUsd,
  });
  const until = isoDate();
  const since = fullScan ? daysAgo(settings.maxTimeframeDays) : mode === "limited" ? daysAgo(Math.min(30, settings.maxTimeframeDays)) : daysAgo(settings.incrementalLookbackDays);

  try {
    const [previousLastRefresh, previouslyStoredWorks] = await Promise.all([
      getMetadata("lastRefresh"),
      getAll("works"),
    ]);
    const existingCandidateIds = new Set(
      previouslyStoredWorks.filter((work) => !work.isBaseline).map((work) => work.id),
    );
    const discovery = await fetchDiscovery(
      client,
      settings,
      taxonomy,
      since,
      until,
      mode,
      writeProgress,
    );
    const candidates = discovery.works.map((work) => ({ ...work, isBaseline: false }));

    const baseline = await maybeFetchBaseline(client, settings, taxonomy, daysAgo(settings.maxTimeframeDays), writeProgress);
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
    const fetchedAuthors = await client.fetchAuthors(missingAuthorIds, {
      onProgress: (progress) => writeProgress({ phase: "authorship", lane: "authors", ...progress }),
    });
    if (fetchedAuthors.length) await bulkPut("authors", fetchedAuthors);

    await writeProgress({
      phase: "scoring",
      lane: "local cosine comparison",
      fetched: 0,
      total: candidates.length,
      pages: 0,
    });
    const allAuthors = deduplicateAuthors([...existingAuthors, ...fetchedAuthors]);
    await getProminenceRoster(allAuthors);
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
    await pruneCandidates(daysAgo(400));

    const completedAt = new Date().toISOString();
    if (usageAccumulator) await setMetadata("apiUsageDaily", usageAccumulator);
    const coverage = fullScan
      ? {
          signature, filterSignature: researchFilterSignature(settings),
          horizonDays: settings.maxTimeframeDays,
          mode,
          available: discovery.total,
          retrieved: discovery.retrieved,
          matched: candidates.length,
          coveragePercent: discovery.total
            ? Math.min(100, (100 * discovery.retrieved) / discovery.total)
            : 100,
          truncated: discovery.truncated,
          fullCompletedAt: completedAt,
          lastIncrementalAt: completedAt,
        }
      : {
          ...(previousCoverage || {}), filterSignature: researchFilterSignature(settings), horizonDays: Math.max(Number(previousCoverage?.horizonDays || 0), settings.maxTimeframeDays),
          signature,
          mode,
          limitedAvailable: discovery.total,
          limitedRetrieved: discovery.retrieved,
          limitedMatched: candidates.length,
          lastIncrementalAt: completedAt,
          needsApiKey: !settings.apiKey && hasFocusedScope,
        };
    const state = {
      status: "ready",
      reason,
      mode,
      startedAt,
      completedAt,
      candidatesFetched: candidates.length,
      indexedRetrieved: discovery.retrieved,
      indexedAvailable: discovery.total,
      baselineFetched: baseline.length,
      authorsFetched: fetchedAuthors.length,
      apiCostUsd: client.costUsd,
      estimatedApiCostUsd: client.estimatedCostUsd,
      keyPresent: Boolean(settings.apiKey),
      notificationsGenerated,
    };
    const history = (await getMetadata("searchHistory")) || [];
    const currentFilterSignature = researchFilterSignature(settings);
    const historyEntry = { id: `${completedAt}:${Math.random().toString(36).slice(2)}`, filterSignature: currentFilterSignature, savedAt: completedAt,
      settings: { queries: settings.queries, selectedFields: settings.selectedFields, selectedSubfields: settings.selectedSubfields, selectedArxivGroups: settings.selectedArxivGroups, selectedArxivCategories: settings.selectedArxivCategories, englishOnly: settings.englishOnly,
        noveltySelectivity: settings.noveltySelectivity, authorshipSelectivity: settings.authorshipSelectivity, defaultWindow: settings.defaultWindow, defaultSort: settings.defaultSort },
      resultCount: (await qualifiedMonth(settings)).works.length, mode };
    await Promise.all([
      setMetadata("lastRefresh", completedAt),
      setMetadata("refreshState", state),
      setMetadata("discoveryCoverage", coverage),
      setMetadata("coverageByScope", { ...coverageByScope, [signature]: coverage }),
      setMetadata("searchHistory", [historyEntry, ...history.filter((item) => item.filterSignature !== currentFilterSignature)].slice(0, 12)),
    ]);
    return state;
  } catch (error) {
    const state = {
      status: "error",
      reason,
      mode,
      startedAt,
      completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      estimatedApiCostUsd: client.estimatedCostUsd,
    };
    await setMetadata("refreshState", state);
    throw error;
  }
}

function refresh(reason) {
  if (refreshPromise) {
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

async function getFeed({
  window = "week",
  sort = "balanced",
  includeAll = false,
  offset = 0,
  limit = 120,
} = {}) {
  const settings = await loadSettings();
  const roster = await getProminenceRoster();
  const windowConfig = WINDOWS[window] || WINDOWS.week;
  const cutoff = daysAgo(windowConfig.days);
  const relevant = groupDuplicatePapers(await getAll("works")).map((work) => annotateProminence(work, roster)).filter(
    (work) =>
      !work.isBaseline &&
      work.scoringVersion &&
      work.publicationDate >= cutoff &&
      matchesResearchFilters(work, settings),
  );
  const selected = applySelectivity(relevant, settings, { includeAll });
  const sorters = {
    balanced: (left, right) => right.discoveryScore - left.discoveryScore,
    novelty: (left, right) => right.noveltyScore - left.noveltyScore,
    researcher: (left, right) => right.researcherScore - left.researcherScore,
    newest: (left, right) => right.publicationDate.localeCompare(left.publicationDate),
  };
  selected.works.sort(sorters[sort] || sorters.balanced);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(250, Math.max(1, Number(limit) || 120));
  const page = selected.works.slice(safeOffset, safeOffset + safeLimit).map((work) => ({
    ...work,
    interestMatch: interestMatchEvidence(work, settings.queries || []),
  }));
  return {
    papers: page.map(cleanWorkForDisplay),
    resultCount: selected.works.length,
    offset: safeOffset,
    hasMore: safeOffset + page.length < selected.works.length,
    screenedCount: relevant.length,
    window,
    sort,
    thresholds: {
      noveltySelectivity: settings.noveltySelectivity,
      authorshipSelectivity: settings.authorshipSelectivity,
      cutoffs: selected.cutoffs,
      topFractions: selected.topFractions,
    },
    coverage: ((await getMetadata("coverageByScope")) || {})[discoveryScopeSignature(settings)] || (await getMetadata("discoveryCoverage")) || null,
    stats: await databaseStats(),
  };
}

async function getQualifiedArxivScores(ids) {
  const settings = await loadSettings();
  const qualified = await qualifiedMonth(settings);
  const allowed = new Set(qualified.works.map((work) => work.id));
  const found = await getWorksByArxivIds(ids);
  return Object.fromEntries(
    Object.entries(found)
      .filter(([, work]) => allowed.has(work.id))
      .map(([id, work]) => [id, cleanWorkForDisplay(work)]),
  );
}

function normalizeDoi(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .trim();
}

function normalizedTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function getSiteMatches(items = []) {
  const settings = await loadSettings();
  if (!settings.showArxivBadges) return {};
  const qualified = await qualifiedMonth(settings);
  const byDoi = new Map();
  const byArxiv = new Map();
  const byTitle = new Map();
  for (const work of qualified.works) {
    if (work.doi) byDoi.set(normalizeDoi(work.doi), work);
    if (work.arxivId) byArxiv.set(work.arxivId, work);
    byTitle.set(normalizedTitle(work.title), work);
  }
  return Object.fromEntries(
    items.flatMap((item) => {
      const work =
        byDoi.get(normalizeDoi(item.doi)) ||
        byArxiv.get(String(item.arxivId || "").replace(/v\d+$/i, "")) ||
        byTitle.get(normalizedTitle(item.title));
      return work
        ? [[
            item.key,
            {
              id: work.id,
              title: cleanWorkForDisplay(work).title,
              noveltyScore: work.noveltyScore,
              researcherScore: work.researcherScore,
              prominence: work.prominence || [],
              authorshipOverride: Boolean(work.authorshipOverride),
            },
          ]]
        : [];
    }),
  );
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return cleanWorkForDisplay({ title: match?.[1] || "" }).title;
}

async function fetchArxivFallback(items) {
  const byId = new Map(items.filter((item) => item.arxivId).map((item) => [String(item.arxivId).replace(/v\d+$/i, ""), item]));
  if (!byId.size) return [];
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("id_list", [...byId.keys()].join(","));
  url.searchParams.set("max_results", String(byId.size));
  const response = await fetch(url, { headers: { Accept: "application/atom+xml" } });
  if (!response.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].flatMap((match) => {
    const entry = match[1];
    const arxivId = xmlValue(entry, "id").split("/").at(-1)?.replace(/v\d+$/i, "");
    const item = byId.get(arxivId);
    if (!item) return [];
    const authorships = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)].map((author, index) => {
      const name = cleanWorkForDisplay({ title: author[1] }).title;
      return { authorId: `ARXIV-A-${normalizedTitle(name)}`, name, position: index === 0 ? "first" : "middle", isCorresponding: false, institutions: [], rawAffiliations: [] };
    });
    const categories = [...entry.matchAll(/<category[^>]*term=["']([^"']+)["']/gi)].map((category) => category[1]);
    return [{ id: `ARXIV-${arxivId}`, arxivId, title: xmlValue(entry, "title"), abstract: xmlValue(entry, "summary"), language: "en",
      publicationDate: xmlValue(entry, "published").slice(0, 10) || isoDate(), doi: null, url: `https://arxiv.org/abs/${arxivId}`,
      sourceName: "arXiv", sources: [{ name: "arXiv", url: `https://arxiv.org/abs/${arxivId}`, doi: null }], workType: "preprint", authorships,
      topics: [], arxivCategories: categories.length ? categories : item.categories || [], isBaseline: false, fetchedAt: new Date().toISOString() }];
  });
}

async function screenSiteItems(items = []) {
  const local = await getSiteMatches(items);
  const unresolved = items.filter((item) => !local[item.key] && item.title).slice(0, 100);
  if (!unresolved.length) return local;
  const settings = await loadSettings();
  const client = openAlexClient({ apiKey: settings.apiKey, maxEstimatedCostUsd: settings.incrementalScanBudgetUsd });
  let resolved = [];
  try { resolved = await client.findWorksByTitles(unresolved.map((item) => item.title)); }
  catch (error) { console.warn("OpenAlex visible-paper lookup failed", error); }
  const itemByTitle = new Map(unresolved.map((item) => [normalizedTitle(item.title), item]));
  const resolvedTitles = new Set(resolved.map((work) => normalizedTitle(work.title)));
  const arxivFallback = await fetchArxivFallback(unresolved.filter((item) => !resolvedTitles.has(normalizedTitle(item.title))));
  const candidates = [...resolved.map((work) => {
    const item = itemByTitle.get(normalizedTitle(work.title));
    return { ...work, arxivId: work.arxivId || item?.arxivId || null, arxivCategories: item?.categories || [], isBaseline: false };
  }), ...arxivFallback].filter((work) => matchesResearchFilters(work, settings));
  if (!candidates.length) return local;
  const authorIds = chooseAuthorIds(candidates, Math.min(settings.maxAuthors, 2_000));
  const fetchedAuthors = await client.fetchAuthors(authorIds);
  if (fetchedAuthors.length) await bulkPut("authors", fetchedAuthors);
  const allAuthors = deduplicateAuthors([...(await getAll("authors")), ...fetchedAuthors]);
  await getProminenceRoster(allAuthors);
  const references = selectReferences(await getAll("works"), settings.maxReferenceWorks);
  const scored = scoreBatch(candidates, references, allAuthors, { maxPeerComparisons: settings.maxPeerComparisons });
  await bulkPut("works", scored);
  return getSiteMatches(items);
}

async function scoreArxivPage({ title, arxivId }) {
  const existing = await getWorksByArxivIds([arxivId]);
  if (existing[arxivId]?.scoringVersion === SCORING_VERSION) return existing[arxivId];
  const settings = await loadSettings();
  const client = openAlexClient({
    apiKey: settings.apiKey,
    maxEstimatedCostUsd: settings.incrementalScanBudgetUsd,
  });
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
    case "GET_TAXONOMY":
      return getArxivTaxonomy(message.payload || {});
    case "GET_API_USAGE":
      return (await getMetadata("apiUsageDaily")) || { date: isoDate(), requests: 0, costUsd: 0 };
    case "GET_SEARCH_HISTORY":
      return (await getMetadata("searchHistory")) || [];
    case "SET_MAX_TIME_FRAME":
    case "SET_MAX_TIMEFRAME": {
      const stored = await chrome.storage.sync.get("settings");
      const next = normalizeSettings({ ...(stored.settings || {}), maxTimeframeDays: message.payload?.days });
      await chrome.storage.sync.set({ settings: next });
      return { maxTimeframeDays: next.maxTimeframeDays, discoveryStarted: false };
    }
    case "REFRESH":
      return refresh("manual");
    case "REBUILD":
      return refresh("rebuild");
    case "SETTINGS_CHANGED":
      return { ok: true, discoveryStarted: false };
    case "CLEAR_DATA":
      await clearDatabase();
      return { ok: true };
    case "GET_ARXIV_SCORES":
      return getQualifiedArxivScores(message.payload?.ids || []);
    case "GET_SITE_MATCHES":
      return getSiteMatches(message.payload?.items || []);
    case "SCREEN_SITE_ITEMS":
      return screenSiteItems(message.payload?.items || []);
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
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
  ]).catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults().catch(console.error);
});

if (chrome.notifications?.onClicked) {
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
}

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

ensureDefaults().catch(console.error);
