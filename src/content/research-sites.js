(() => {
  const MAX_CANDIDATES = 120;
  // A container is retired only once it has been screened against an index that
  // was actually able to answer. Retiring it on the first empty answer meant a
  // pass that ran before the index was warm permanently suppressed every later
  // match, which is why highlighting never appeared. Retries are spaced so page
  // churn cannot consume the budget, and stop at a wall-clock deadline so an
  // empty index does not cause endless screening.
  const MIN_RETRY_GAP_MS = 2500;
  const DEADLINE_MS = 60_000;
  const lastAttempt = new WeakMap();
  const startedAt = Date.now();
  let scheduled = false;
  let running = false;
  let pending = false;

  function expired() {
    return Date.now() - startedAt > DEADLINE_MS;
  }

  function eligible(container) {
    if (container.dataset.filteredresearchChecked) return false;
    const last = lastAttempt.get(container);
    return last === undefined || Date.now() - last >= MIN_RETRY_GAP_MS;
  }

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
    if (running) {
      pending = true;
      return;
    }
    if (expired()) return;
    running = true;
    try {
      const candidates = collectCandidates().filter((candidate) => eligible(candidate.container));
      if (!candidates.length) return;
      const items = candidates.map((candidate, index) => ({
        key: String(index),
        title: candidate.title,
        doi: candidate.doi,
        arxivId: candidate.arxivId,
      }));
      const response = await chrome.runtime.sendMessage({ type: "SCREEN_SITE_ITEMS", payload: { items } });
      // A failed round trip says nothing about these papers, so leave every
      // container eligible for the next pass.
      if (!response?.ok) return;
      const payload = response.result || {};
      const matches = payload.matches || {};
      const indexReady = payload.indexReady !== false;
      candidates.forEach((candidate, index) => {
        const match = matches[String(index)];
        lastAttempt.set(candidate.container, Date.now());
        if (match) {
          candidate.container.dataset.filteredresearchChecked = "true";
          addBadge(candidate.container, match);
          return;
        }
        // Only an index that could answer proves this paper does not match.
        if (indexReady) candidate.container.dataset.filteredresearchChecked = "true";
      });
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
    }
  }

  function schedule(delay = 350) {
    if (scheduled || expired()) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      screenVisiblePapers().catch(() => {});
    }, delay);
  }

  schedule();
  // Results that arrive late, or an index that is still warming up, get further
  // chances without waiting for an unrelated DOM change to trigger one.
  // A cold service worker has to rebuild its filtered corpus before it can
  // answer, so the last chance is well after the page settles.
  for (const delay of [3000, 8000, 18000, 35000]) setTimeout(() => schedule(0), delay);

  const observer = new MutationObserver((records) => {
    // Ignore the badges this script inserts, otherwise every render would
    // schedule another pass.
    const external = records.some(
      (record) =>
        record.removedNodes.length > 0 ||
        [...record.addedNodes].some(
          (node) =>
            node.nodeType !== 1 || !node.classList?.contains("filteredresearch-site-badge"),
        ),
    );
    if (external) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
