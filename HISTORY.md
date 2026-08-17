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

## Current state

The installed development build is **v0.5.4**. Automated tests at release: **44 passing**.
