import { DEFAULT_SETTINGS, WINDOWS } from "../shared/defaults.js";

const state = {
  window: DEFAULT_SETTINGS.defaultWindow,
  sort: DEFAULT_SETTINGS.defaultSort,
  includeAll: false,
  loading: false,
  papers: [],
  renderedCount: 0,
  resultCount: 0,
  hasMore: false,
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
  showAll: document.querySelector("#show-all-button"),
  sort: document.querySelector("#sort-select"),
  tabs: [...document.querySelectorAll("[data-window]")],
  template: document.querySelector("#paper-template"),
  loadMore: document.querySelector("#load-more-button"),
  notifications: document.querySelector("#notifications-button"),
  notificationBadge: document.querySelector("#notification-badge"),
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
  fragment.querySelector(".paper-date").textContent = formatDate(work.publicationDate);
  fragment.querySelector(".paper-topic").textContent = work.subfieldName || work.fieldName || "Unclassified";
  const title = fragment.querySelector(".paper-title");
  title.textContent = work.title;
  title.href = safeExternalUrl(work.url || work.doi, `https://openalex.org/${work.id}`);
  fragment.querySelector(".paper-authors").textContent = authorLine(work);
  fragment.querySelector(".paper-why").textContent = whyLine(work);
  fragment.querySelector(".paper-source").textContent = work.sourceName || work.workType || "Research paper";

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

function updateNotificationBadge(count) {
  const unread = Number(count || 0);
  elements.notificationBadge.hidden = unread <= 0;
  elements.notificationBadge.textContent = unread > 99 ? "99+" : String(unread);
}

function updateControls() {
  for (const tab of elements.tabs) {
    const active = tab.dataset.window === state.window;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  elements.sort.value = state.sort;
  elements.showAll.textContent = state.includeAll ? "Apply threshold" : "Show screened";
  elements.summaryCopy.textContent = state.includeAll ? "papers were screened" : "papers cleared your bar";
}

function showNotice(message, tone = "info") {
  elements.notice.hidden = !message;
  elements.notice.className = `notice ${tone}`;
  elements.notice.textContent = message || "";
}

async function loadFeed({ skeleton = true } = {}) {
  if (state.loading) return;
  state.loading = true;
  elements.feed.setAttribute("aria-busy", "true");
  if (skeleton) renderSkeleton();
  elements.empty.hidden = true;
  updateControls();
  try {
    const result = await send("GET_FEED", {
      window: state.window,
      sort: state.sort,
      includeAll: state.includeAll,
      offset: 0,
      limit: PAGE_SIZE,
    });
    elements.feed.replaceChildren();
    state.papers = result.papers;
    state.resultCount = result.resultCount;
    state.hasMore = result.hasMore;
    state.renderedCount = 0;
    renderNextBatch();
    elements.resultCount.textContent = String(result.resultCount);
    updateNotificationBadge(result.stats.unreadNotifications);
    elements.empty.hidden = result.resultCount > 0;
    elements.feed.hidden = result.resultCount === 0;
    const lastRefresh = result.stats.lastRefresh;
    elements.status.textContent = lastRefresh
      ? `Screened ${new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
          Math.round((Date.parse(lastRefresh) - Date.now()) / 3_600_000),
          "hour",
        )}`
      : "Ready for the first screen";
    const refreshState = result.stats.refreshState;
    const coverage = result.coverage;
    if (refreshState?.status === "running") {
      const progress = refreshState.total
        ? ` ${compactNumber(refreshState.fetched)} of ${compactNumber(refreshState.total)} fetched.`
        : "";
      showNotice(`Building ${refreshState.mode} index · ${refreshState.phase || "starting"}.${progress}`);
      setTimeout(() => loadFeed({ skeleton: false }), 2500);
    } else if (refreshState?.status === "error") {
      showNotice(result.stats.refreshState.message, "error");
    } else if (coverage?.needsApiKey) {
      showNotice(
        `Limited preview: ${compactNumber(coverage.limitedRetrieved || 0)} of ${compactNumber(coverage.limitedAvailable || 0)} available papers checked. Add your personal OpenAlex key in settings for complete coverage.`,
      );
    } else if (coverage?.fullCompletedAt) {
      showNotice(
        `30-day index: ${compactNumber(coverage.retrieved)} of ${compactNumber(coverage.available)} papers retrieved (${Math.round(coverage.coveragePercent || 0)}% API coverage).`,
        "success",
      );
    } else if (!lastRefresh) {
      showNotice("First run creates a limited preview. A personal key plus a selected field enables exhaustive indexing.");
    } else {
      showNotice("");
    }
  } catch (error) {
    elements.feed.replaceChildren();
    elements.empty.hidden = false;
    showNotice(error.message, "error");
  } finally {
    state.loading = false;
    elements.feed.setAttribute("aria-busy", "false");
  }
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
      includeAll: state.includeAll,
      offset: state.papers.length,
      limit: PAGE_SIZE,
    });
    state.papers.push(...result.papers);
    state.resultCount = result.resultCount;
    state.hasMore = result.hasMore;
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
  showNotice("Checking the newest papers… complete rebuilds are started from settings.");
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
  tab.addEventListener("click", () => {
    state.window = tab.dataset.window;
    loadFeed();
  });
}
elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value;
  loadFeed();
});
elements.showAll.addEventListener("click", () => {
  state.includeAll = !state.includeAll;
  loadFeed();
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
  updateControls();
  loadFeed();
});
