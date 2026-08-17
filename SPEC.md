# FilteredResearch v0.3 specification

## Product contract

FilteredResearch is an open-source, local-first Chrome extension for finding recent papers that are both lexically unusual within their field and associated with an established authorship track record. It is not a publisher crawler, paper archive, citation recommender, peer-review substitute, or AI research product.

The primary user chooses an OpenAlex field/subfield, builds a 30-day index, adjusts logarithmic novelty and authorship selectivity, and browses day/3-day/week/2-week/month views. Matching papers can be marked on supported scholarly sites and can generate optional notifications.

## Functional requirements

### Discovery

- Use OpenAlex article/preprint metadata over HTTPS.
- A focused initial scan uses cursor paging until the API result is exhausted or 50,000 unique works are retrieved.
- Report API total, retrieved count, truncation, coverage percentage, estimated cost, and progress.
- Require a user-owned OpenAlex key for exhaustive indexing. Never ship a shared key.
- Without a key, label the result as a limited preview and retrieve no more than 500 works.
- If no taxonomy field is selected, use a rotating cross-disciplinary preview rather than claiming exhaustive global coverage.
- Scheduled/startup checks use a two-day overlap, deduplicate by OpenAlex ID, and preserve the last complete 30-day index.
- Full rebuild runs only for a new focused scope, a first keyed run, or explicit user action.
- Enforce per-run guards of $0.25 full and $0.02 incremental by estimated OpenAlex request costs.

### Filters

- Fetch and cache the OpenAlex field/subfield taxonomy for 30 days, with a Computer Science fallback.
- A parent field checkbox means every child subfield. Individual subfields may be selected instead.
- Normalize taxonomy identifiers from both bare numeric IDs and current OpenAlex URL-shaped IDs.
- Category and interest-query groups combine with AND; queries inside the interest group combine with OR.
- English-only is enabled by default. Missing/non-English metadata is rejected when enabled.

### Ranking

- Score novelty against up to 320 older, subfield-adjacent references using the documented TF–IDF/cosine heuristic.
- Score authorship from transparent OpenAlex author metrics and role.
- Convert selectivity 1–100 into logarithmic target top-fractions using the documented anchors.
- Apply novelty and authorship percentile cutoffs with AND.
- Show both raw scores and evidence. Never label either as truth, quality, reputation, peer review, or proven novelty.

### Interface

- Side panel uses past day, 3 days, week, 2 weeks, and month tabs.
- Feed responses are paginated (maximum 250 serialized works) so a 20,000-paper low-selectivity result does not produce a giant Chrome message.
- Settings use the existing white/grey/opal minimal-brutalist visual system, fine type, overlapping edge lines, and restrained rounded corners.
- Settings explain the selectivity anchors, own-key requirement, expected first-run cost/time, local page inspection, and scoring limitations.
- Text normalization decodes entities, strips markup/control characters, applies NFKC, and repairs conservative lowercase-to-uppercase word joins.

### Notifications and page highlighting

- Native notifications are an optional Chrome permission requested only after the user enables them.
- Notify only for newly indexed works that clear both current bars; keep a local inbox.
- Supported page access is limited to arXiv, PubMed, Semantic Scholar, OpenAlex, Google Scholar, and DOI resolver URLs.
- Content scripts inspect visible titles/DOIs/arXiv IDs, send them only to the extension service worker, and compare against the qualifying local index.
- Content scripts make no external network request and never persist browsing history.
- arXiv may request one title lookup for a paper page missing locally, but the background worker performs that OpenAlex request under the incremental budget.

## Storage

- `chrome.storage.sync`: non-secret settings.
- `chrome.storage.local`: user OpenAlex key only, restricted to trusted extension contexts.
- IndexedDB: works, baseline references, author profiles, refresh metadata, and notification inbox.
- Non-baseline candidates older than 60 days are pruned.
- Scope/scoring-version changes invalidate the baseline comparison set.
- A clear-data action deletes IndexedDB state; saving an empty key removes the key value.

## Security and compliance requirements

- MV3 only; no remote executable code, eval, telemetry, ads, accounts, or project-owned backend.
- No tabs, history, cookies, identity, clipboard, scripting, or all-sites permission.
- Insert all scholarly text with `textContent`, never `innerHTML` except fixed developer-authored skeleton markup.
- Treat API data and page DOM as untrusted.
- Publish the privacy policy, accurate Chrome Web Store disclosures, OpenAlex source/terms notice, no-endorsement language, and heuristic limitations.
- Credit development assistance from OpenAI Codex without implying OpenAI endorsement.

## Acceptance tests

- A production work with `fieldId=https://openalex.org/fields/17` matches selected field `17`.
- AI with selectivity 1/1 retains every locally indexed AI paper regardless of low authorship score.
- 80/80 targets the top 5% on each signal and requires both; exceptional performance on only one axis is excluded.
- 100 targets top 0.02% per axis and ordinarily yields 0–2 papers for a ~10,000-paper month.
- Cursor paging has no duplicate IDs and reports truncation honestly.
- Joined text examples `EfficientTwo`, `PlatformAdvanced`, and `FromFilamentary` are repaired; escaped HTML is decoded.
- The manifest contains only named host patterns and optional notifications, and contains no all-URL/history/tabs permission.
- The exact packaged directory passes static checks, automated tests, and manual Chrome rendering/highlighting checks.
