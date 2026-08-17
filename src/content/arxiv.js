(async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  if (settings?.showArxivBadges === false) return;

  const normalizeId = (value) =>
    String(value || "")
      .replace(/^.*\/abs\//, "")
      .replace(/[?#].*$/, "")
      .replace(/v\d+$/, "")
      .replace(/\.pdf$/, "");

  const links = [...document.querySelectorAll('a[href*="/abs/"]')];
  const ids = [...new Set(links.map((link) => normalizeId(link.getAttribute("href"))).filter(Boolean))];
  if (!ids.length) return;

  const response = await chrome.runtime.sendMessage({ type: "GET_ARXIV_SCORES", payload: { ids } });
  if (!response?.ok) return;
  const scores = response.result || {};

  function makeBadge(work) {
    const badge = document.createElement("span");
    badge.className = "filteredresearch-badge";
    badge.textContent = `N ${Math.round(work.noveltyScore || 0)} · R ${Math.round(work.researcherScore || 0)}`;
    badge.title = `FilteredResearch — novelty ${Math.round(work.noveltyScore || 0)}, researcher ${Math.round(work.researcherScore || 0)}`;
    return badge;
  }

  for (const link of links) {
    const id = normalizeId(link.getAttribute("href"));
    const work = scores[id];
    if (!work || link.parentElement?.querySelector(".filteredresearch-badge")) continue;
    link.insertAdjacentElement("afterend", makeBadge(work));
  }

  if (!location.pathname.startsWith("/abs/")) return;
  const arxivId = normalizeId(location.pathname);
  let work = scores[arxivId];
  const titleElement = document.querySelector("h1.title");
  if (!work && titleElement) {
    const title = titleElement.textContent.replace(/^\s*Title:\s*/i, "").trim();
    const scored = await chrome.runtime.sendMessage({
      type: "SCORE_ARXIV_PAGE",
      payload: { title, arxivId },
    });
    if (scored?.ok) work = scored.result;
  }
  if (!work || !titleElement || document.querySelector(".filteredresearch-abs-score")) return;

  const strip = document.createElement("div");
  strip.className = "filteredresearch-abs-score";
  const label = document.createElement("span");
  label.textContent = "FILTEREDRESEARCH";
  const novelty = document.createElement("div");
  novelty.append("Novelty ");
  const noveltyValue = document.createElement("strong");
  noveltyValue.textContent = Math.round(work.noveltyScore || 0);
  novelty.append(noveltyValue);
  const researcher = document.createElement("div");
  researcher.append("Researcher ");
  const researcherValue = document.createElement("strong");
  researcherValue.textContent = Math.round(work.researcherScore || 0);
  researcher.append(researcherValue);
  strip.append(label, novelty, researcher);
  titleElement.insertAdjacentElement("afterend", strip);
})().catch(() => {
  // Content scripts should never interfere with arXiv if background scoring fails.
});
