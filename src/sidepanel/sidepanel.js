import { DEFAULT_SETTINGS, WINDOWS } from "../shared/defaults.js";

const state = {
  window: DEFAULT_SETTINGS.defaultWindow,
  sort: DEFAULT_SETTINGS.defaultSort,
  loading: false,
  papers: [],
  renderedCount: 0,
  resultCount: 0,
  hasMore: false,
  maxTimeframeDays: DEFAULT_SETTINGS.maxTimeframeDays,
  bundle: null,
  bundleSort: null,
  availableWindows: null,
};

const BATCH_SIZE = 60;
const PAGE_SIZE = 120;

const elements = {
  feed: document.querySelector("#feed"),
  empty: document.querySelector("#empty-state"),
  notice: document.querySelector("#notice"),
  resultCount: document.querySelector("#result-count"),
  shownCopy: document.querySelector("#shown-copy"),
  summaryCopy: document.querySelector("#summary-copy"),
  status: document.querySelector("#status-line"),
  refresh: document.querySelector("#refresh-button"),
  sort: document.querySelector("#sort-select"),
  tabs: [...document.querySelectorAll("[data-window]")],
  template: document.querySelector("#paper-template"),
  loadMore: document.querySelector("#load-more-button"),
  notifications: document.querySelector("#notifications-button"),
  notificationBadge: document.querySelector("#notification-badge"),
  maxTimeframe: document.querySelector("#max-timeframe"),
  maxWindowTab: document.querySelector("#max-window-tab"),
  depthWarning: document.querySelector("#depth-warning"),
};

async function send(type, payload) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || "The extension did not respond");
  return response.result;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0),
  );
}

function safeExternalUrl(value, fallback) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    // Fall through to the known OpenAlex URL.
  }
  return fallback;
}

function authorLine(work) {
  const names = (work.authorships || []).slice(0, 4).map((item) => item.name);
  if ((work.authorships || []).length > 4) names.push(`+${work.authorships.length - 4}`);
  return names.join(", ") || "Unknown authors";
}

function whyLine(work) {
  const evidence = work.noveltyEvidence || {};
  const researcher = work.researcherEvidence?.[0];
  const pieces = [];
  if (work.nearestTitle) {
    pieces.push(`${Math.round((1 - work.nearestSimilarity) * 100)}% idea-distance from its nearest peer`);
  } else {
    pieces.push("No close peer found in the local reference set");
  }
  if (researcher) pieces.push(`${researcher.name}, h-index ${researcher.hIndex}`);
  if (evidence.incrementalMarkers?.length) {
    pieces.push(`incremental wording: ${evidence.incrementalMarkers.join(", ")}`);
  }
  return pieces.join(" · ");
}

function evidenceText(work) {
  const novelty = work.noveltyEvidence || {};
  const researcher = work.researcherEvidence?.[0];
  const lines = [
    `Compared with ${novelty.peerCount || 0} older, topic-adjacent papers.`,
    work.nearestTitle
      ? `Nearest match (${Math.round(work.nearestSimilarity * 100)}% similar): “${work.nearestTitle}”`
      : "No nearest match was available; treat the novelty score as low-confidence.",
    `Novelty confidence: ${Math.round((work.noveltyConfidence || 0) * 100)}%.`,
  ];
  if (researcher) {
    lines.push(
      `Top authorship signal: ${researcher.name} — ${compactNumber(researcher.citedByCount)} citations, ${researcher.worksCount} works, ${researcher.role} author.`,
    );
  } else {
    lines.push("No enriched author profile was available for this paper.");
  }
  return lines;
}

function renderPaper(work, index) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".paper-card");
  card.dataset.id = work.id;
  fragment.querySelector(".paper-rank").textContent = String(index + 1).padStart(2, "0");
  const released = work.firstReleaseDate || work.publicationDate;
  const dateCell = fragment.querySelector(".paper-date");
  dateCell.textContent = formatDate(released);
  // When a journal re-published an older preprint, show the age that actually
  // matters and name the later date rather than presenting it as new research.
  if (work.publicationDate && released && work.publicationDate.slice(0, 7) > released.slice(0, 7)) {
    dateCell.textContent = `${formatDate(released)} · first posted`;
    dateCell.title = `First public release ${released}; re-published ${work.publicationDate}.`;
  }
  fragment.querySelector(".paper-topic").textContent = work.subfieldName || work.fieldName || "Unclassified";
  const title = fragment.querySelector(".paper-title");
  title.textContent = work.title;
  title.href = safeExternalUrl(work.url || work.doi, `https://openalex.org/${work.id}`);
  fragment.querySelector(".paper-authors").textContent = authorLine(work);
  const badges = fragment.querySelector(".paper-badges");
  for (const marker of work.prominence || []) {
    const badge = document.createElement("span"); badge.className = "prominence-badge";
    badge.style.setProperty("--badge-color", marker.color); badge.textContent = `Prominent · ${marker.label}`;
    badge.title = "Verified prominent organization or exact OpenAlex author identity; clears the authorship gate only."; badges.append(badge);
  }
  fragment.querySelector(".paper-why").textContent = whyLine(work);
  const sources = fragment.querySelector(".paper-sources");
  // The same repository often appears once per indexed location; listing it
  // twice told the reader nothing.
  const rawSources = work.sources?.length ? work.sources : [{ name: work.sourceName || work.workType || "Research paper", url: work.url || work.doi }];
  const sourceList = [...new Map(rawSources.map((source) => [String(source.name || "").trim().toLowerCase(), source])).values()].slice(0, 3);
  sourceList.forEach((source, sourceIndex) => {
    const link = document.createElement("a"); link.className = "source-link"; link.target = "_blank"; link.rel = "noreferrer";
    link.href = safeExternalUrl(source.url, `https://openalex.org/${work.id}`); link.textContent = `${sourceList.length > 1 ? `Source ${sourceIndex + 1} · ` : ""}${source.name || "Journal record"}`; sources.append(link);
  });
  const interest = fragment.querySelector(".paper-interest");
  if (work.interestMatch) { interest.hidden = false; interest.textContent = `Matches “${work.interestMatch.query}” in the ${work.interestMatch.location}.`; }

  for (const [className, score] of [
    [".score-novelty", work.noveltyScore],
    [".score-researcher", work.researcherScore],
  ]) {
    const element = fragment.querySelector(className);
    const rounded = Math.round(score || 0);
    element.querySelector("strong").textContent = rounded;
    element.querySelector(".score-track span").style.width = `${rounded}%`;
  }

  const details = fragment.querySelector(".details-button");
  const evidence = fragment.querySelector(".evidence");
  const list = document.createElement("ul");
  for (const line of evidenceText(work)) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  evidence.append(list);
  details.addEventListener("click", () => {
    evidence.hidden = !evidence.hidden;
    details.textContent = evidence.hidden ? "Evidence" : "Hide";
  });
  return fragment;
}

function renderSkeleton() {
  elements.feed.replaceChildren();
  for (let index = 0; index < 4; index += 1) {
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton-card";
    skeleton.innerHTML = "<span></span><span></span><span></span>";
    elements.feed.append(skeleton);
  }
}

function renderNextBatch() {
  const next = state.papers.slice(state.renderedCount, state.renderedCount + BATCH_SIZE);
  next.forEach((paper, index) =>
    elements.feed.append(renderPaper(paper, state.renderedCount + index)),
  );
  state.renderedCount += next.length;
  const buffered = state.papers.length - state.renderedCount;
  const remaining = Math.max(0, state.resultCount - state.renderedCount);
  elements.loadMore.hidden = remaining <= 0;
  elements.loadMore.textContent = remaining > 0
    ? `Load ${Math.min(BATCH_SIZE, remaining)} more · ${remaining} left`
    : "";
  elements.shownCopy.textContent = remaining > 0 ? ` · showing ${state.renderedCount}` : "";
  return buffered;
}

function widestWindowWithin(days) {
  const fits = Object.entries(WINDOWS).filter(([, config]) => config.days <= days);
  return (fits.at(-1) || Object.entries(WINDOWS)[0])[0];
}

function updateNotificationBadge(count) {
  const unread = Number(count || 0);
  elements.notificationBadge.hidden = unread <= 0;
  elements.notificationBadge.textContent = unread > 99 ? "99+" : String(unread);
}

function updateControls() {
  elements.maxTimeframe.value = String(state.maxTimeframeDays);
  elements.depthWarning.hidden = state.maxTimeframeDays < 30;
  // Views wider than the saved depth cannot show anything the widest allowed
  // view does not already show, so they are disabled rather than silently
  // repeating it.
  const allowed = state.availableWindows;
  for (const tab of elements.tabs) {
    const usable = !allowed || allowed.includes(tab.dataset.window);
    const active = tab.dataset.window === state.window;
    tab.classList.toggle("active", active && usable);
    tab.classList.toggle("out-of-depth", !usable);
    tab.disabled = !usable;
    tab.title = usable ? "" : `Raise Index depth past ${WINDOWS[tab.dataset.window]?.label?.toLowerCase() || "this range"} to search this far back`;
    tab.setAttribute("aria-selected", String(active && usable));
  }
  elements.sort.value = state.sort;
  elements.summaryCopy.textContent = state.resultCount === 1 ? "paper cleared both bars" : "papers cleared both bars";
}

function showNotice(message, tone = "info") {
  elements.notice.hidden = !message;
  elements.notice.className = `notice ${tone}`;
  elements.notice.textContent = message || "";
}

function renderResult(result) {
  elements.feed.replaceChildren();
  state.papers = result.papers;
  state.resultCount = result.resultCount;
  state.hasMore = result.hasMore;
  state.renderedCount = 0;
  renderNextBatch();
  elements.resultCount.textContent = String(result.resultCount);
  updateNotificationBadge(result.stats.unreadNotifications);
  const refreshState = result.stats.refreshState;
  const discoveryRunning = refreshState?.status === "running";
  elements.empty.hidden = result.resultCount > 0 || discoveryRunning;
  elements.feed.hidden = result.resultCount === 0;
  const lastRefresh = result.stats.lastRefresh;
  elements.status.textContent = lastRefresh
    ? `Screened ${new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        Math.round((Date.parse(lastRefresh) - Date.now()) / 3_600_000),
        "hour",
      )}`
    : "Ready for the first screen";
  const coverage = result.coverage;
  if (result.requestedBeyondCoverage) {
    showNotice(`This view is capped at your ${result.indexedHorizonDays}-day index depth. Raise Index depth and refresh to reach further back.`);
  } else if (result.settingsChangedAt && (!lastRefresh || Date.parse(result.settingsChangedAt) > Date.parse(lastRefresh))) {
    showNotice("Filters changed. Saved papers and page highlights were re-screened locally; refresh only to fetch new research.");
  } else if (refreshState?.status === "running") {
    const progress = refreshState.total
      ? ` ${compactNumber(refreshState.fetched)} of ${compactNumber(refreshState.total)} fetched.`
      : "";
    showNotice(`Building ${refreshState.mode} index · ${refreshState.phase || "starting"}.${progress}`);
  } else if (refreshState?.status === "error") {
    showNotice(result.stats.refreshState.message, "error");
  } else if (coverage?.needsApiKey) {
    showNotice(
      `Limited preview: ${compactNumber(coverage.limitedRetrieved || 0)} of ${compactNumber(coverage.limitedAvailable || 0)} available papers checked. Add your personal OpenAlex key in settings for complete coverage.`,
    );
  } else if (coverage?.fullCompletedAt) {
    showNotice(
      `Local index: ${compactNumber(coverage.retrieved)} papers from ${compactNumber(coverage.records ?? coverage.retrieved)} records${
        Math.round(coverage.coveragePercent || 0) >= 99 ? " · complete for this scope" : ` · ${Math.round(coverage.coveragePercent || 0)}% of ${compactNumber(coverage.available)} retrieved`
      }.`,
      "success",
    );
  } else if (!lastRefresh) {
    showNotice("No pass has run yet. Without your own OpenAlex key this stays a small preview; add one in settings for full coverage.");
  } else {
    showNotice("");
  }
}

// One request builds every date view, so switching tabs is a local render with
// no message round trip and no dependency on the service worker staying alive.
async function loadFeed({ skeleton = true } = {}) {
  if (state.loading) return;
  state.loading = true;
  elements.feed.setAttribute("aria-busy", "true");
  if (skeleton) renderSkeleton();
  if (skeleton) elements.empty.hidden = true;
  updateControls();
  try {
    const bundle = await send("GET_FEED_BUNDLE", { sort: state.sort, limit: PAGE_SIZE });
    state.bundle = bundle.windows;
    state.bundleSort = bundle.sort;
    state.availableWindows = bundle.availableWindows || Object.keys(bundle.windows);
    // The worker is the single source of truth for depth. Reading it back here
    // keeps the picker from ever displaying a scope the feed did not apply.
    if (Number.isFinite(Number(bundle.maxTimeframeDays))) {
      state.maxTimeframeDays = Number(bundle.maxTimeframeDays);
    }
    if (!state.availableWindows.includes(state.window)) {
      state.window = state.availableWindows.at(-1) || state.window;
    }
    updateControls();
    renderResult(state.bundle[state.window] || Object.values(state.bundle)[0]);
  } catch (error) {
    state.bundle = null;
    elements.feed.replaceChildren();
    elements.empty.hidden = false;
    showNotice(error.message, "error");
  } finally {
    state.loading = false;
    elements.feed.setAttribute("aria-busy", "false");
  }
  // Started only once the load has fully settled, otherwise its own reload
  // would be rejected by the in-progress guard at the top of this function.
  fillGap();
}

// Retrieval is hybrid: the render above is already on screen from the local
// index, and this tops up the current window from OpenAlex afterwards. It never
// blocks a render, and the worker rate-limits it per scope.
let gapFillInFlight = false;
async function fillGap() {
  if (gapFillInFlight) return;
  gapFillInFlight = true;
  try {
    const result = await send("FILL_FEED_GAP", { window: state.window });
    if (!result?.added) return;
    state.bundle = null;
    await loadFeed({ skeleton: false });
    showNotice(`Added ${result.added} paper${result.added === 1 ? "" : "s"} the last pass had not retrieved.`, "success");
  } catch {
    // A gap fill is an enhancement; the local feed already rendered.
  } finally {
    gapFillInFlight = false;
  }
}

function showWindow(window) {
  if (state.availableWindows && !state.availableWindows.includes(window)) return;
  state.window = window;
  updateControls();
  const cached = state.bundle?.[window];
  if (cached && state.bundleSort === state.sort) {
    renderResult(cached);
    return;
  }
  loadFeed({ skeleton: false });
}

async function loadMore() {
  if (state.loading) return;
  if (state.renderedCount < state.papers.length) {
    renderNextBatch();
    return;
  }
  if (!state.hasMore) return;
  state.loading = true;
  elements.loadMore.disabled = true;
  elements.loadMore.textContent = "Loading…";
  try {
    const result = await send("GET_FEED", {
      window: state.window,
      sort: state.sort,
      offset: state.papers.length,
      limit: PAGE_SIZE,
    });
    state.papers.push(...result.papers);
    state.resultCount = result.resultCount;
    state.hasMore = result.hasMore;
    // Keep the cached window in step so returning to this tab still shows the
    // pages that were already loaded.
    const cached = state.bundle?.[state.window];
    if (cached && cached.papers === state.papers) {
      cached.resultCount = result.resultCount;
      cached.hasMore = result.hasMore;
    }
    renderNextBatch();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    state.loading = false;
    elements.loadMore.disabled = false;
  }
}

async function refresh() {
  if (state.loading) return;
  elements.refresh.classList.add("spinning");
  elements.refresh.disabled = true;
  showNotice(`Running one-time ${elements.maxTimeframe.selectedOptions[0]?.textContent || "index"} discovery… the saved feed will update only when it finishes.`);
  try {
    const result = await send("REFRESH");
    showNotice(
      `Screened ${result.candidatesFetched} papers and enriched ${result.authorsFetched} researchers.`,
      "success",
    );
    await loadFeed({ skeleton: false });
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    elements.refresh.classList.remove("spinning");
    elements.refresh.disabled = false;
  }
}

for (const tab of elements.tabs) {
  tab.addEventListener("click", () => showWindow(tab.dataset.window));
}
elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value;
  loadFeed({ skeleton: false });
});
elements.maxTimeframe.addEventListener("change", async () => {
  const days = Number(elements.maxTimeframe.value);
  elements.maxTimeframe.disabled = true;
  try {
    const result = await send("SET_MAX_TIMEFRAME", { days });
    state.maxTimeframeDays = result.maxTimeframeDays;
    // Depth bounds every window, so the cached bundle no longer describes the feed.
    state.bundle = null;
    if ((WINDOWS[state.window]?.days || 7) > state.maxTimeframeDays) {
      state.window = widestWindowWithin(state.maxTimeframeDays);
    }
    await loadFeed({ skeleton: false });
    showNotice("Index depth saved locally. Press refresh when you want to run discovery; no API request was made.", "success");
  } catch (error) { showNotice(error.message, "error"); }
  finally { elements.maxTimeframe.disabled = false; }
});
elements.refresh.addEventListener("click", refresh);
elements.loadMore.addEventListener("click", loadMore);
elements.notifications.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/notifications/notifications.html") });
});
document.querySelector("#empty-refresh").addEventListener("click", refresh);
for (const button of [document.querySelector("#settings-button"), document.querySelector("#empty-settings")]) {
  button.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

chrome.storage.sync.get("settings").then(({ settings }) => {
  state.window = settings?.defaultWindow || state.window;
  state.sort = settings?.defaultSort || state.sort;
  state.maxTimeframeDays = Number(settings?.maxTimeframeDays || state.maxTimeframeDays);
  if ((WINDOWS[state.window]?.days || 7) > state.maxTimeframeDays) {
    state.window = widestWindowWithin(state.maxTimeframeDays);
  }
  updateControls();
  loadFeed();
});
