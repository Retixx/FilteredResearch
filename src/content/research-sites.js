(() => {
  const MAX_CANDIDATES = 120;
  let scheduled = false;
  let running = false;

  function cleanTitle(value) {
    return String(value || "")
      .replace(/^\s*\[(?:PDF|HTML|BOOK|CITATION)\]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function doiFrom(container) {
    const meta = container.querySelector?.('meta[name="citation_doi"], meta[name="dc.identifier"]');
    const metaValue = meta?.content || "";
    const link = [...(container.querySelectorAll?.('a[href*="doi.org/"]') || [])][0];
    const raw = metaValue || link?.href || "";
    const match = raw.match(/10\.\d{4,9}\/[^\s"<>]+/i);
    return match?.[0]?.replace(/[),.;]+$/, "") || "";
  }

  function arxivFrom(container) {
    const link = [...(container.querySelectorAll?.('a[href*="arxiv.org/abs/"]') || [])][0];
    return link?.href.match(/\/abs\/([^?#]+)/)?.[1]?.replace(/v\d+$/i, "") || "";
  }

  function candidateSelectors() {
    if (location.hostname === "scholar.google.com") return [".gs_r"];
    if (location.hostname === "pubmed.ncbi.nlm.nih.gov") {
      return [".docsum-content", ".results-articles article", "main article"];
    }
    if (location.hostname.endsWith("semanticscholar.org")) {
      return ['[data-test-id="paper-row"]', ".cl-paper-row", "article"];
    }
    if (location.hostname === "openalex.org") {
      return ['a[href*="/works/"]'];
    }
    return [];
  }

  function titleFrom(container) {
    const meta = container.querySelector?.('meta[name="citation_title"], meta[property="og:title"]');
    if (meta?.content) return cleanTitle(meta.content);
    const element = container.matches?.("h1, h2, h3, a")
      ? container
      : container.querySelector?.(
          'h1, h2, h3, .docsum-title, .gs_rt, [data-selenium-selector="title-link"], a[href*="/paper/"], a[href*="/works/"]',
        );
    return cleanTitle(element?.textContent);
  }

  function collectCandidates() {
    const candidates = [];
    const seenContainers = new Set();
    const pageTitle = document.querySelector('meta[name="citation_title"]')?.content;
    if (pageTitle) {
      const container = document.querySelector("main article, article, main") || document.body;
      candidates.push({ container, title: cleanTitle(pageTitle), doi: doiFrom(document), arxivId: arxivFrom(document) });
      seenContainers.add(container);
    }
    for (const selector of candidateSelectors()) {
      for (const found of document.querySelectorAll(selector)) {
        const container = location.hostname === "openalex.org"
          ? found.closest("article, li, [role='listitem'], div[class*='card']") || found.parentElement
          : found;
        if (!container || seenContainers.has(container) || container.dataset.filteredresearchChecked) continue;
        const title = titleFrom(container);
        if (title.length < 12) continue;
        candidates.push({ container, title, doi: doiFrom(container), arxivId: arxivFrom(container) });
        seenContainers.add(container);
        if (candidates.length >= MAX_CANDIDATES) return candidates;
      }
    }
    return candidates;
  }

  function addBadge(container, work) {
    if (container.querySelector?.(".filteredresearch-site-badge")) return;
    container.classList.add("filteredresearch-site-match");
    const badge = document.createElement("span");
    badge.className = "filteredresearch-site-badge";
    badge.textContent = `FILTEREDRESEARCH · N ${Math.round(work.noveltyScore || 0)} · A ${Math.round(work.researcherScore || 0)}`;
    badge.title = "This paper clears your current local novelty and authorship filters.";
    if (work.prominence?.length) {
      badge.textContent += ` · ${work.prominence.map((marker) => marker.label).join(" / ")}`;
      badge.style.setProperty("--fr-accent", work.prominence[0].color);
      badge.classList.add("filteredresearch-site-prominent");
      container.style.setProperty("--fr-accent", work.prominence[0].color);
    }
    container.prepend(badge);
  }

  async function screenVisiblePapers() {
    if (running) return;
    running = true;
    try {
      const candidates = collectCandidates();
      if (!candidates.length) return;
      const items = candidates.map((candidate, index) => ({
        key: String(index),
        title: candidate.title,
        doi: candidate.doi,
        arxivId: candidate.arxivId,
      }));
      const response = await chrome.runtime.sendMessage({ type: "SCREEN_SITE_ITEMS", payload: { items } });
      if (!response?.ok) return;
      const matches = response.result || {};
      candidates.forEach((candidate, index) => {
        candidate.container.dataset.filteredresearchChecked = "true";
        if (matches[String(index)]) addBadge(candidate.container, matches[String(index)]);
      });
    } finally {
      running = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      screenVisiblePapers().catch(() => {});
    }, 350);
  }

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
