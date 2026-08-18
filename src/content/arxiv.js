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

  const entries = links.map((link) => {
    const dt = link.closest("dt");
    const dd = dt?.nextElementSibling?.tagName === "DD" ? dt.nextElementSibling : link.closest("li, article, .arxiv-result") || link.parentElement;
    const titleElement = dd?.querySelector?.(".list-title, .title, h1, h2, h3") || null;
    const title = String(titleElement?.textContent || "").replace(/^\s*Title:\s*/i, "").replace(/\s+/g, " ").trim();
    const linkedCategories = [...(dd?.querySelectorAll?.('a[href*="/list/"]') || [])].map((item) => item.getAttribute("href")?.match(/\/list\/([^/?#]+)/)?.[1]).filter(Boolean);
    const textCategories = [...String(dd?.textContent || "").matchAll(/\(([a-z-]+(?:\.[A-Za-z-]+)?)\)/g)].map((match) => match[1]);
    const categories = [...new Set([...linkedCategories, ...textCategories])];
    return { key: normalizeId(link.getAttribute("href")), title, arxivId: normalizeId(link.getAttribute("href")), categories };
  }).filter((entry, index, all) => entry.title && all.findIndex((item) => item.key === entry.key) === index);
  // SCREEN_SITE_ITEMS answers { matches, indexReady }; reading the envelope as a
  // flat map silently produced no badges at all.
  const readMatches = (response) => (response?.ok ? response.result?.matches || {} : {});
  const scores = readMatches(
    await chrome.runtime.sendMessage({ type: "SCREEN_SITE_ITEMS", payload: { items: entries } }),
  );

  function makeBadge(work) {
    const badge = document.createElement("span");
    badge.className = "filteredresearch-badge";
    badge.textContent = `N ${Math.round(work.noveltyScore || 0)} · A ${Math.round(work.researcherScore || 0)}`;
    badge.title = `FilteredResearch — novelty ${Math.round(work.noveltyScore || 0)}, authorship ${Math.round(work.researcherScore || 0)}`;
    if (work.prominence?.length) {
      badge.textContent += ` · ${work.prominence.map((marker) => marker.label).join(" / ")}`;
      badge.style.setProperty("--fr-accent", work.prominence[0].color);
      badge.classList.add("filteredresearch-prominent");
    }
    return badge;
  }

  for (const link of links) {
    const id = normalizeId(link.getAttribute("href"));
    const work = scores[id];
    if (!work || link.parentElement?.querySelector(".filteredresearch-badge")) continue;
    link.insertAdjacentElement("afterend", makeBadge(work));
    const dt = link.closest("dt");
    const dd = dt?.nextElementSibling?.tagName === "DD" ? dt.nextElementSibling : null;
    dt?.classList.add("filteredresearch-list-match");
    dd?.classList.add("filteredresearch-list-match-body");
    if (work.prominence?.length) {
      dt?.style.setProperty("--fr-accent", work.prominence[0].color);
      dd?.style.setProperty("--fr-accent", work.prominence[0].color);
    }
  }

  if (!location.pathname.startsWith("/abs/")) return;
  const arxivId = normalizeId(location.pathname);
  let work = scores[arxivId];
  const titleElement = document.querySelector("h1.title");
  if (!work && titleElement) {
    const title = titleElement.textContent.replace(/^\s*Title:\s*/i, "").trim();
    const linkedCategories = [...document.querySelectorAll('a[href*="/list/"]')].map((item) => item.getAttribute("href")?.match(/\/list\/([^/?#]+)/)?.[1]).filter(Boolean);
    const textCategories = [...String(document.querySelector(".subheader, .subjects")?.textContent || "").matchAll(/\(([a-z-]+(?:\.[A-Za-z-]+)?)\)/g)].map((match) => match[1]);
    const screened = await chrome.runtime.sendMessage({ type: "SCREEN_SITE_ITEMS", payload: { items: [{ key: arxivId, title, arxivId, categories: [...new Set([...linkedCategories, ...textCategories])] }] } });
    work = readMatches(screened)[arxivId];
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
  researcher.append("Authorship ");
  const researcherValue = document.createElement("strong");
  researcherValue.textContent = Math.round(work.researcherScore || 0);
  researcher.append(researcherValue);
  strip.append(label, novelty, researcher);
  titleElement.insertAdjacentElement("afterend", strip);
})().catch(() => {
  // Content scripts should never interfere with arXiv if background scoring fails.
});
