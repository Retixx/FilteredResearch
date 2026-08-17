# FilteredResearch

FilteredResearch v0.4 is a local-first Chrome extension that builds a rolling research index for a chosen field, then ranks papers on two transparent signals:

- **Novelty**: lexical distance from up to 320 older, field-adjacent OpenAlex papers, adjusted for evidence completeness, rare title phrases, cross-field combinations, and incremental wording.
- **Authorship**: an established-track-record signal using author h-index, citations, recent citedness, works count, ORCID presence, and authorship role.

Neither score proves scientific novelty, quality, correctness, reputation, or significance. They are screening heuristics for deciding what to inspect next.

## What changed in v0.4

- Cursor-based discovery can retrieve up to 200,000 works across a selected one-year scope; scheduled checks request only a recent overlap.
- AI-labeled records require AI evidence in the title or abstract, and user interests match title/abstract phrases within a bounded window.
- DOI, arXiv, and normalized title/author duplicates are grouped into one paper with multiple source links.
- Both sliders apply with AND and as visible score floors. A curated 50-entry prominent-source marker may bypass authorship only, never novelty or relevance.
- Prior configurations and results remain local and reusable; changing only interests or thresholds does not trigger a full scope rebuild.
- Settings show this extension's recorded daily OpenAlex request cost against the $1 free allowance.
- OpenAlex field and subfield filters use the current hierarchy; selecting a parent includes every subfield.
- Fixed the production URL-ID mismatch that caused valid AI papers to be rejected by category filtering.
- Selectivity is logarithmic and percentile-based. `1` retains nearly every field-matched paper; `80` targets the top 5% on each signal; `100` targets the top 0.02%.
- A paper must clear both the novelty and authorship bars.
- Titles are normalized for escaped HTML and common joined-word failures such as `EfficientTwo` and `FromFilamentary`.
- Scheduled checks query only the newest two-day overlap; full one-year rebuilds happen for a new scope or explicit rebuild.
- Matching indexed papers are highlighted locally on arXiv, PubMed, Semantic Scholar, OpenAlex, Google Scholar, and DOI resolver pages.
- Notifications are optional, and every user supplies their own OpenAlex key.

## Install for development

1. Clone this repository.
2. Run `npm test`, `npm run check`, and `npm run package`.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/filteredresearch-extension`.
4. Open the extension settings, select **Computer Science → Artificial Intelligence** (or another scope), add a dedicated free OpenAlex API key, and save.
5. Choose **Rebuild rolling 1-year index**. Keep Chrome open while the initial index is built.
6. Click the toolbar icon to open the side panel.

An unpacked extension does not update itself from GitHub. Chrome Web Store installations update automatically after each submitted version is approved; see [docs/WEB_STORE_RELEASES.md](docs/WEB_STORE_RELEASES.md).

## Coverage, time, and API use

Measured on August 17, 2026, an English AI 30-day query returned 9,554 article/preprint records across 96 cursor pages with no duplicate IDs. Enriching 10,409 priority authors took 105 author pages. The production-shape run took roughly two minutes locally, used about 63 MiB of work-response data, peaked near 350 MiB of process memory, and was estimated around **$0.021** under the then-current OpenAlex per-call prices. Computer Science was approximately 20,920 works and should take roughly 3–5 minutes and about $0.05 on a comparable connection.

These are observations, not guarantees. OpenAlex coverage, pricing, limits, counts, and response times can change. A personal key prevents one publisher key from becoming a scaling bottleneck. The extension enforces `$0.75` for a full run and `$0.02` for a recent-only run; a stopped run reports the budget guard rather than continuing silently.

At the default six-hour schedule, four recent-only checks have a combined worst-case guard of `$0.08/day`; normal cached AI checks should be much lower. Manual refreshes/rebuilds are additional and always use the installing user's allowance.

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

There is no FilteredResearch backend, analytics, advertising, or telemetry. Public scholarly metadata and scores stay in extension-owned IndexedDB. The personal API key stays in local Chrome extension storage and is hidden from content scripts. Supported research pages are inspected locally only for visible highlighting; those page values are not sent to OpenAlex or the developer.

Read [PRIVACY.md](PRIVACY.md) and the engineering release gate in [COMPLIANCE.md](COMPLIANCE.md). The extension requests no tabs, history, cookies, identity, clipboard, or all-sites access. Notifications are optional.

## Data source and licenses

FilteredResearch uses [OpenAlex](https://openalex.org/) scholarly metadata. OpenAlex states that [its data is released under CC0](https://help.openalex.org/hc/en-us/articles/24396686889751-About-us); API use remains subject to its [current Terms](https://openalex.org/OpenAlex_termsofservice.pdf) and service limits. FilteredResearch is not affiliated with or endorsed by OpenAlex or any highlighted research site.

Project source code is licensed under Apache-2.0. Development was assisted by OpenAI Codex; this project is not affiliated with or endorsed by OpenAI. Contributors must verify the license of any new dependencies, copied code, fonts, or assets.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
