# FilteredResearch Release History

## v0.2.0 — Initial extension

- Built the first Manifest V3 Chrome extension with the sidebar, settings page, notification inbox, local IndexedDB, packaging, CI, Web Store workflow, privacy/security documentation, and Apache-2.0 license.
- Added OpenAlex discovery, author enrichment, novelty/authorship scoring, field filters, English-only filtering, arXiv integration, and the white/grey/opal minimal-brutalist interface.
- Added title cleanup for HTML entities, markup, unusual Unicode, and joined-word metadata errors.

## v0.3.0 — Exhaustive discovery and logarithmic screening

- Reworked discovery around cursor pagination, personal OpenAlex keys, broader local indexing, progress/coverage reporting, and daily cost estimates.
- Replaced simple score thresholds with logarithmic percentile selectivity and enforced novelty **and** authorship together.
- Added hierarchical category selection, stricter interest relevance, local notifications, saved configurations, and highlighting across major research sites.
- Added compliance tests, scoring documentation, and Chrome Web Store listing guidance.

## v0.4.0 — Relevance, deduplication, and source signals

- Tightened category evidence so unrelated physics or engineering papers were not mislabeled as AI.
- Grouped duplicate papers from different repositories or journals into one result with multiple sources.
- Added local configuration/result reuse and stronger topic-query matching.
- Introduced a curated 50-entry prominence seed catalog for major organizations and researchers, with discreet source markers and authorship-only overrides.
- Simplified the settings interface and fixed production OpenAlex taxonomy-ID mismatches.

## v0.5.0 — Bounded discovery and live page screening

- Added 1-month, 3-month, 6-month, and 1-year index depths with longer-search warnings.
- Adopted arXiv's complete official group/category taxonomy and exact on-page category evidence.
- Added live background scoring for visible arXiv and other supported-site papers missing from the local index.
- Improved duplicate merging, multiple-source presentation, topic evidence text, API-usage display, and local coverage reporting.

## v0.5.1 — Manual-discovery hotfix

- Removed scheduled, startup, settings-save, and depth-change discovery; discovery became explicitly user-triggered.
- Preserved the old feed until a one-time pass completed and removed the sidebar progress-polling flash.
- Accepted both legacy timeframe message spellings and migrated old coverage metadata safely.
- Raised the retrieval ceiling to one million works and the full-pass guard to `$0.95`; topic queries were pushed into scoped discovery to avoid downloading an entire field unnecessarily.
- Fixed arXiv fallback author IDs being incorrectly sent to OpenAlex, restored matching indicators, and changed site highlighting to a restrained opal underline.
- Temporarily expanded dynamic prominence candidates while collecting stronger evidence.

## v0.5.2 — Instant local views and stricter prominence

- Cached the locally filtered corpus so switching among 1D, 3D, 1W, 2W, 1M, 3M, 6M, and 1Y is immediate and performs no discovery.
- Added a clear prompt when the chosen date window exceeds the completed index depth; results remain bounded to the saved index.
- Settings changes now re-filter saved papers and browser highlights without gathering new research.
- Replaced the arbitrary 500-person prominence target with strict, field-neutral evidence: exact OpenAlex author identity, h-index at least 50, and at least 10,000 citations.
- Removed generated name-only prominence matches, preventing common-name collisions such as a zero-evidence author receiving another researcher's badge.
- Enlarged prominence badges and added a visible seal.
- Restored general OpenAlex fields outside arXiv, simplified displayed arXiv names, and made subfield disclosure controls explicit.

## v0.5.4 — Fast views, shallower depths, working highlights

- Retired the 6-month and 1-year index depths. Those passes retrieved far more works than the scoring stage could keep up with, which was the direct cause of slow discovery; three months is now the ceiling and a saved deeper value migrates onto the nearest supported depth.
- Rebuilt index depth as six options in three tiers: 1 day and 3 days (Light), 1 week and 2 weeks (Moderate), 1 month and 3 months (Intensive).
- Fixed the real cause of slow tab switching. The v0.5.2 corpus cache never covered `databaseStats`, which read every stored work **and** every author record on each render purely to produce counts the sidebar does not display; a module-level cache in a service worker Chrome terminates after roughly thirty seconds idle was also cold for most switches.
- One request now builds every date view from a single corpus scan, and the sidebar serves tab switches from that response, so changing tabs issues no message and cannot be delayed by a terminated worker.
- Added a corpus-count-free stats path for the feed, batched metadata reads into one transaction instead of one database connection per key, and shared a single filtered corpus between the feed and page highlighting.
- Fixed "highlight relevant research papers on other websites", which had never worked. Highlighting screened only papers published within the last thirty days, so the older work that dominates search-result pages could never match; it now screens the whole local index.
- Live screening no longer runs under the small incremental-refresh budget, which had been tripping on the first page of results and silently returning nothing.
- A visible paper is no longer permanently retired by a failed or empty pass, and late-rendering results get further screening attempts instead of waiting for an unrelated page change.
- Redesigned the subfield disclosure rows: pill-style counts with hover and open states, native disclosure markers removed, responsive subfield columns, and a styled scroll area.

## v0.6.0 — Working highlights, true recency, hybrid retrieval

- Fixed page highlighting, which v0.5.4 had broken on arXiv: that release changed the screening response to `{ matches, indexReady }` but only updated the research-site script, so `arxiv.js` read the envelope as a flat map and produced no badges at all. A test now covers every content script against the worker's envelope.
- Extended highlighting to roughly 38 named research publishers, repositories and indexes, finding paper rows by the links they must contain instead of per-site selectors.
- Kept the cost of that at zero elsewhere: scripts are injected only on the named hosts, and on those hosts screening exits before any work unless the page carries citation metadata or a paper-shaped link.
- Recency is now first public release rather than journal publication date. arXiv identifiers encode the submission month, so a preprint from 2025 re-published by a journal days ago keeps its real age; a genuinely new preprint keeps its precise date.
- Cards show the first-release date, name the later re-publication date instead of hiding it, and list each repository once rather than repeating it per indexed location.
- The saved index depth is now a hard ceiling on every date view. Wider views are disabled rather than silently repeating the widest allowed one, and the worker reports the depth it applied so the picker cannot show a scope the feed did not use.
- Retrieval is hybrid. The feed still renders instantly from the local index, then a bounded gap fill retrieves what the last pass missed for the current window under its own budget, rate-limited per scope, started only after the render settles.
- The notification page no longer claims to screen at Chrome startup or on an interval, which had not been true since v0.5.1. It reports what a pass found, and a first pass seeds the inbox so a new user can see the feature at all.
- Reworked side-panel and notification copy to describe what each control does.

## v0.6.1 — Screening scope, coverage honesty, crash fixes

- Fixed the search returning single-digit results. Interest phrases were a hard filter requiring the exact wording in the title or abstract, so a ~6,900-paper index was cut to roughly eighty papers *before* selectivity ran, leaving 8. The chosen categories now decide what is screened and interests rank the results instead of excluding them; a new "Show only papers that state an interest phrase" setting restores the old behaviour.
- Interest matching also reads the paper's own topic, subfield and field labels, so a paper filed under a topic counts without repeating the phrase verbatim.
- Fixed discovery itself being keyword-scoped. Each category lane attached the interest phrase as an OpenAlex `search` term, so the local index only ever contained papers repeating that phrase and the rest of the subfield was never retrieved. Category lanes now index the whole scope.
- Fixed the misleading coverage figure. It compared unique papers *after* duplicate merging against the sum of per-lane record counts, which double-counts overlapping lanes and can never reach 100%; a complete pass reported as low as 70%. Coverage is now measured on records actually downloaded, and the side panel reports unique papers and records separately.
- Fixed "Cannot set properties of null" on the notification page. `event.currentTarget` is null once an async handler resumes; the same latent fault on the settings page's discovery button is fixed too.
- Fixed index depth reverting to 1 month. The settings page held a snapshot taken at page load and wrote it back wholesale on save, reverting any depth the side panel had chosen while it was open. It now re-reads the live depth before saving.
- Corrected settings copy that still claimed a paper must match both a category and an interest phrase.

## v0.6.2 — Visible highlights and predictable index depth

- Made page highlights considerably more visible: the badge is now a filled pill at 11px bold with a border and shadow instead of 9px borderless text, and a matched row carries an accent bar and tinted background.
- Fixed a selected index depth still showing its date views struck through. Availability was derived from how far the last pass happened to reach rather than from the depth the user chose, so picking 1 month left the 1M view disabled until a refresh.
- Views inside the chosen depth that the last pass has not reached yet are now selectable and carry a small marker, distinct from views genuinely beyond the depth, which remain struck through.
- Narrowing index depth no longer discards the cache. It re-filters the bundle already held and issues no request; only widening needs a fetch, because the bundle does not yet contain the wider views.
- Stopped the depth control changing height as its hint appears and disappears.

## v0.7.0 — Field-calibrated novelty and defensive hardening

- Reworked the novelty score so it uses the full 1-100 range. Raw cosine distance is not a meaningful scale on its own: with a wide field vocabulary almost every pair of papers sits at 0.05-0.20 similarity, so "idea-distance" read 80-95% for derivative and groundbreaking work alike and the scores bunched into a narrow band. Measured on identical synthetic papers, the old formula placed every ordinary paper between 79 and 82 with a genuine outlier at 94 — a 12-point spread across the entire field.
- Novelty is now measured against how crowded the field itself is. A paper's nearest peer and the density of its neighbourhood are compared with the same statistic computed across the field's own papers, then mapped through a logistic curve. On the same test set the quartiles moved from 79/80/81 to 26/53/67, with roughly 45% of papers below 50, derivative work near 0 and genuinely new work near 100.
- Added a fixed fallback curve for cases with too few peers to describe a field, so small corpora do not invent a distribution.
- Bumped the scoring version. Scores from the previous scale are not comparable, so a refresh now rescores saved papers in the same batch, which also keeps one consistent calibration across the whole feed.
- Fixed two latent crash classes found by auditing rather than by reports: `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` throw `RangeError` on an invalid date, so a single paper with missing or malformed date metadata could take down an entire render. Both are now guarded.
- Every async click handler catches, and fire-and-forget extension calls (`chrome.tabs.create`, `chrome.runtime.openOptionsPage`, the settings read at startup) no longer become unhandled rejections. Verified by driving all three pages with every backend call failing and every stored record malformed: no uncaught errors, and failures surface as visible messages.

## v0.7.1 — Passes that outlive the worker, and a book mark

- Fixed "a listener indicated an asynchronous response by returning true, but the message channel closed before a response was received". A discovery pass was awaited inside the message listener, but it runs far longer than a Manifest V3 service worker is guaranteed to live, so the worker was torn down mid-pass and the channel closed before a reply. v0.7.0 made this much more likely by adding exhaustive scope indexing and rescoring of saved papers.
- A pass is now started as fire-and-forget and watched through the progress state the worker already persists. The side panel, notification page and settings page all show live progress — phase, lane and counts — instead of sitting on one long request, and each poll also keeps the worker alive.
- A dropped poll no longer aborts the watch, a pass that stops advancing is reported rather than hanging forever, and a failed pass surfaces its reason.
- Reported the pass result after the feed reload rather than before it, so the summary is no longer immediately overwritten.
- Redrew the icon as a book: a front cover carrying the FR monogram, a page block and back cover offset behind it, and a spine fold with binding bands. Regenerated at 16, 32, 48 and 128 pixels.

## v0.7.2 — Relevance, novelty separation, and a working icon

Five separate defects, each confirmed before it was changed.

- **The icon never rendered.** `icon-48.png` was written with a corrupt IDAT CRC, so Chrome discarded the set and drew its grey letter placeholder. Icons are now generated by `scripts/make-icons.mjs`, which rasterises and encodes the PNG locally and verifies every chunk CRC before writing; no image is transferred as text any more.
- **Short queries matched inside unrelated words.** Interest matching had a raw substring fast path, so "RAG" matched storage, average, fragment, paragraph and diaphragm, and "AI" matched chain and plain. Matching is now whole-token phrase matching.
- **Abbreviations did not resolve.** Searching "RAG" could not find a paper that only writes "retrieval-augmented generation", which is most of that literature, so a month of results collapsed to a handful. A curated glossary now resolves common research abbreviations in both directions, and an unrecognised abbreviation falls back to initial matching. A known abbreviation deliberately does not match a coincidental expansion: "RAG" no longer matches "robust adaptive gradient".
- **The survey and benchmark penalty never ran.** A shell heredoc had turned every `` in those regular expressions into a literal backspace byte, so none of them could match anything. A test now fails if any source file carries a control character.
- **Novelty saturated at the top.** Standing was a z-score divided by a median absolute deviation, which collapses toward zero on a homogeneous corpus; standings reached 20 and even 170 and the logistic pinned every interesting paper to the same value. Standing is now a rank within the field, which cannot collapse, and candidates are ranked against each other as well as against past work. A second signal, lexical distinctiveness, separates work that introduces new vocabulary from work that reuses the field's own.

Also hardened after a fuzz sweep of every exported function: a record with no abstract crashed scoring outright, `undefined` was entering the term table and skewing IDF, one malformed stored record could abort an entire feed render, and scores could reach the interface as NaN.

## v0.8.0 — Automatic scanning, no page access

- Added automatic scanning, off by default, with intervals of 3 hours, 6 hours, 24 hours and 3 days. A pass runs when Chrome starts and the interval has elapsed, and an alarm checks periodically while Chrome stays open. It requires a user-owned key and a selected category, never runs alongside another pass, and stamps its attempt before starting so a failure cannot retry in a loop. A future timestamp from a clock change does not make every wake-up look due.
- The toolbar icon now carries a red unread count whenever the inbox holds new papers, so a background pass is visible without opening anything. It follows every path that changes the count and clears when the inbox is read or emptied.
- Removed page highlighting entirely, along with both content scripts, their styles, the settings toggle, four message handlers and the `export.arxiv.org` host permission. The extension now declares no content script at all, so ordinary browsing never runs extension code and there are no interruptions while scrolling. Privacy and compliance documents were updated to match.
- Replaced the "FR" lettering in the side panel, settings and inbox headers with the book mark.

## v0.8.1 — A first run that works without a key

- Reframed the keyless experience. The empty state demanded an OpenAlex key before the extension did anything, and a completed keyless pass reported itself as a "Limited preview". Both now lead with what the pass found and mention a free key as an upgrade rather than a prerequisite.
- Doubled the keyless sample from 500 to 1,000 works. That is ten requests per pass instead of five, a trivial load, and it makes a first run read as a real result.
- Presented the key as optional and free in Settings, with an "optional · free" tag beside the field.
- Stopped reporting usage in dollars. OpenAlex's standard API is free, so a "$0.000 of $1 free daily allowance" figure implied a bill that does not exist and discouraged installs. Usage now reads as a request count; the internal guard that stops a runaway pass is unchanged.
- Added a test asserting no developer API key can ever be bundled: a key is attached to a request only when the user supplied one, so the publisher can never pay for another person's usage.

## Current state

The installed development build is **v0.8.1**. Automated tests at release: **88 passing**.
