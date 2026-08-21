# Filtered Research

Filtered Research v1.0.1 is a local-first Chrome extension that builds a user-bounded research index for a chosen field, then ranks papers on two transparent signals:

- **Novelty**: lexical distance from up to 320 older, field-adjacent OpenAlex papers, adjusted for evidence completeness, rare title phrases, cross-field combinations, and incremental wording.
- **Authorship**: an established-track-record signal using author h-index, citations, recent citedness, works count, ORCID presence, and authorship role.

Neither score proves scientific novelty, quality, correctness, reputation, or significance. They are screening heuristics for deciding what to inspect next.

## What changed in v1.0.0

- First public release.
- Scoring is about twice as fast: peers are indexed by term, so a candidate is compared only with peers that share vocabulary with it. Verified to produce identical scores.
- Fixed the date-view tabs overflowing a narrow side panel, and a result label that rendered one state behind.

## Earlier, in v0.8.2

- Requests identify the extension to OpenAlex so they are served from the polite pool, which is faster and throttled later. This mainly helps people who have not added a key of their own.

## Earlier, in v0.8.1

- Works properly on a first run with no API key: a keyless pass now samples 1,000 recent works and is presented as a result rather than a limitation.
- The OpenAlex key is shown as optional and free, with the upgrade offered after you have seen results.
- Usage is reported as a request count instead of a dollar figure, because OpenAlex's standard API is free.

## Earlier, in v0.8.0

- Automatic scanning, off by default, on a 3-hour, 6-hour, 24-hour or 3-day interval. A pass runs when Chrome starts if the interval has elapsed, and periodically while Chrome stays open. It needs your own OpenAlex key and a selected category.
- The toolbar icon shows a red unread count when a background pass finds papers that clear both bars.
- Page highlighting is gone. No content script is declared, so the extension reads no web page and nothing appears while you browse.
- The side panel, settings and inbox headers now show the book mark instead of the "FR" lettering.

## Earlier, in v0.7.2

- Searching "RAG" now finds retrieval-augmented generation papers. Interest matching was a substring test, so short queries matched inside unrelated words, and an abbreviation could not find its own expansion. Matching is whole-token, and a glossary resolves common research abbreviations both ways.
- Novelty separates consolidation work from new work. Standing was a z-score whose scale collapsed on a uniform corpus, pinning every interesting paper to the same value; it is now a rank within the field, with a second signal for vocabulary the field does not already use, and an explicit penalty for surveys, benchmarks and empirical studies.
- The extension icon renders. One PNG was written with a corrupt CRC, so Chrome fell back to a grey placeholder; icons are now generated and CRC-verified locally.

## Earlier, in v0.7.1

- Fixed the "message channel closed before a response was received" error during a discovery pass. A pass outlives the service worker's guaranteed lifetime, so it is now started without holding the channel open and watched through persisted progress state, with live phase and counts shown while it runs.
- The icon is now a book: front cover with the FR monogram, page block and back cover behind it, and a spine fold.

## Earlier, in v0.7.0

- Novelty now uses the full 1-100 range. It is measured against how crowded the field itself is rather than against raw cosine distance, which in a wide vocabulary reads 80-95% "distant" for derivative and groundbreaking work alike. On identical test papers the old formula put every ordinary paper between 79 and 82; the new one spreads them across 26/53/67 at the quartiles with derivative work near 0 and genuinely new work near 100.
- A refresh rescores saved papers, because scores from the previous scale are not comparable with the new one.
- Guarded two latent crash classes: invalid date metadata could throw out of `Intl` and abort a render, and several async handlers could reject unhandled.

## Earlier, in v0.6.2

- Page highlights are much easier to see: a filled pill badge with a border, plus an accent bar and tint on the matched row.
- Selecting an index depth now enables those date views immediately. Availability followed how far the last pass reached, so choosing 1 month left the 1M view struck through until a refresh.
- Views inside the depth that a pass has not reached yet are selectable and marked, rather than looking unavailable.
- Narrowing index depth re-filters the cache locally instead of refetching.

## Earlier, in v0.6.1

- Search returns real result counts again. Interest phrases were a hard filter demanding the exact wording, which cut a ~6,900-paper index to about eighty before selectivity even ran. Categories now decide what is screened; interests rank the results. Strict phrase filtering is available as a setting.
- Discovery indexes the whole chosen category. It previously attached your interest phrase as a search term, so the index only ever held papers repeating that phrase.
- The coverage figure is honest. It had compared unique papers after duplicate merging against summed per-lane record counts, so a complete pass could report 70%.
- Fixed the notification-page crash, and index depth reverting to 1 month whenever the settings page was saved.

## Earlier, in v0.6.0

- Page highlighting works again and covers far more sites. A v0.5.4 change to the screening response shape was never applied to the arXiv script, so every arXiv badge silently disappeared; the shape is now shared and tested. Coverage extends to ~38 named publishers, repositories and indexes, located by the links a paper row must contain rather than per-site selectors.
- Highlighting costs nothing anywhere else. Scripts load only on those named hosts, and even there a page with no citation metadata and no paper-shaped link is left completely untouched.
- Recency now means first public release. An arXiv id encodes its submission month, so a 2025 preprint re-published by a journal last week is no longer presented as days-old research.
- Index depth is a hard ceiling on every date view. Views wider than the depth are disabled instead of quietly showing the same papers, and the worker reports the depth it actually applied.
- Retrieval is hybrid: the feed renders instantly from the local index, then a bounded, rate-limited gap fill pulls what the last pass missed for the current window.
- The notification page no longer claims to screen at startup or on an interval, reports what a pass found, and a first pass seeds the inbox so the page is reachable.

## Earlier, in v0.5.4

- Index depth offers six options in three tiers — 1 day and 3 days (Light), 1 week and 2 weeks (Moderate), 1 month and 3 months (Intensive). The 6-month and 1-year depths are gone: they retrieved far more works than the scoring stage could keep up with, which was the direct cause of slow discovery. Changing depth never starts discovery.
- Switching date views is immediate again. One request builds every view from a single corpus scan and the sidebar renders tab switches from that response, so no switch waits on the service worker.
- On-page highlighting works. It had screened only the last thirty days of papers, so the older work that fills search-result pages could never match; it now screens the whole local index under its own request budget.
- Subfield disclosure rows were redesigned with pill-style counts, hover and open states, and responsive columns.

## Earlier, in v0.5.2
- Category labels and codes are loaded from arXiv's official eight-group, 155-category taxonomy and cached locally for 30 days.
- Discovery runs only when the user presses refresh (or the explicit one-time discovery button), can retrieve up to 1,000,000 works, and leaves the saved feed unchanged until the pass completes.
- AI-labeled records require AI evidence in the title or abstract, and user interests match title/abstract phrases within a bounded window.
- DOI, arXiv, and normalized title/author duplicates are grouped into one paper with multiple source links.
- Both sliders apply with AND and as visible score floors. Dynamic prominence is field-neutral and requires an exact OpenAlex author ID, h-index of at least 50, and at least 10,000 citations; a marker may bypass authorship only, never novelty or relevance.
- Prior configurations and results remain local and reusable; changing only interests or thresholds does not trigger a full scope rebuild.
- Settings show this extension's recorded daily OpenAlex request cost against the $1 free allowance.
- OpenAlex field and subfield filters use the current hierarchy; selecting a parent includes every subfield.
- Fixed the production URL-ID mismatch that caused valid AI papers to be rejected by category filtering.
- Selectivity is logarithmic and percentile-based. `1` retains nearly every field-matched paper; `80` targets the top 5% on each signal; `100` targets the top 0.02%.
- A paper must clear both the novelty and authorship bars.
- Titles are normalized for escaped HTML and common joined-word failures such as `EfficientTwo` and `FromFilamentary`.
- Saving settings, changing depth, startup, and install make no discovery calls. Refresh is the only normal discovery trigger.
- Matching indexed papers are highlighted locally on arXiv, PubMed, Semantic Scholar, OpenAlex, Google Scholar, and DOI resolver pages.
- Visible papers missing from the local index are batch-resolved by the background worker under the incremental API budget, then scored with the same thresholds and prominence overrides as the sidebar.
- Notifications are optional, and every user supplies their own OpenAlex key.

## Install for development

1. Clone this repository.
2. Run `npm test`, `npm run check`, and `npm run package`.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/filteredresearch-extension`.
4. Open the extension settings, select **Computer Science → Artificial Intelligence** (or another scope), add a dedicated free OpenAlex API key, and save.
5. Choose an **Index depth** in the sidebar, then press refresh and keep Chrome open until the one-time pass finishes.
6. Click the toolbar icon whenever you want to reopen the saved local feed.

An unpacked extension does not update itself from GitHub. Chrome Web Store installations update automatically after each submitted version is approved; see [docs/WEB_STORE_RELEASES.md](docs/WEB_STORE_RELEASES.md).

## Coverage, time, and API use

Measured on August 17, 2026, an English AI 30-day query returned 9,554 article/preprint records across 96 cursor pages with no duplicate IDs. Enriching 10,409 priority authors took 105 author pages. The production-shape run took roughly two minutes locally, used about 63 MiB of work-response data, peaked near 350 MiB of process memory, and was estimated around **$0.021** under the then-current OpenAlex per-call prices. Computer Science was approximately 20,920 works and should take roughly 3–5 minutes and about $0.05 on a comparable connection.

These are observations, not guarantees. OpenAlex coverage, pricing, limits, counts, and response times can change. A personal key prevents one publisher key from becoming a scaling bottleneck. A manually started full pass has a `$0.95` estimated-cost guard; there are no scheduled, startup, settings-save, or depth-change discovery calls.

On that measured AI corpus, setting both sliders equally retained 9,554 papers at `1`, 3,201 at `40`, 213 at `60`, 8 at `80`, and 0 at `90` or `100`. The exact intersection changes with the field, month, ties, and correlation between the signals.

Without a key, the extension clearly labels a limited preview and retrieves at most 500 selected papers. With no field selected, it intentionally uses a rotating cross-disciplinary preview because indexing every field for every user would be expensive and unfocused.

## How scoring and selectivity work

See [docs/SCORING.md](docs/SCORING.md) for formulas and limitations.

The slider is not a raw-score cutoff. It maps to a percentile within the filtered time window:

| Selectivity | Approximate fraction retained per signal |
| ---: | ---: |
| 1 | nearly all |
| 20 | top 75% |
| 40 | top 50% |
| 60 | top 20% |
| 80 | top 5% |
| 90 | top 1% |
| 100 | top 0.02% |

Because both bars must be cleared, the final set is usually smaller than either percentage alone. Small corpora always retain at least the highest paper on a signal, so exact counts depend on ties and score correlation.

## Privacy and permissions

There is no Filtered Research backend, analytics, advertising, or telemetry. Public scholarly metadata and scores stay in extension-owned IndexedDB. The personal API key stays in local Chrome extension storage and is hidden from content scripts. Supported pages are inspected for highlighting; unresolved scholarly titles/IDs may be resolved through OpenAlex or arXiv by the background worker, but nothing is sent to the developer.

Read [PRIVACY.md](PRIVACY.md) and the engineering release gate in [COMPLIANCE.md](COMPLIANCE.md). The extension requests no tabs, history, cookies, identity, clipboard, or all-sites access. Notifications are optional.

## Data source and licenses

Filtered Research uses [OpenAlex](https://openalex.org/) scholarly metadata. OpenAlex states that [its data is released under CC0](https://help.openalex.org/hc/en-us/articles/24396686889751-About-us); API use remains subject to its [current Terms](https://openalex.org/OpenAlex_termsofservice.pdf) and service limits. Filtered Research is not affiliated with or endorsed by OpenAlex or any highlighted research site.

Project source code is licensed under Apache-2.0. Development was assisted by OpenAI Codex; this project is not affiliated with or endorsed by OpenAI. Contributors must verify the license of any new dependencies, copied code, fonts, or assets.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
