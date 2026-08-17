# FilteredResearch

FilteredResearch is a local-first Chrome extension that screens recent scholarly work on two separate axes:

- **Novelty** — how different a paper appears from older, topic-adjacent work in the extension's local comparison set.
- **Researcher** — the strength of the authors' established research track record, based on transparent OpenAlex bibliometrics.

It is a discovery aid, not a peer reviewer and not a truth machine. It gives you a smaller, inspectable feed without requiring a hosted service, user account, or AI API.

## What it does

- Opens as a persistent Chrome side panel.
- Filters to **Past day**, **Past 3 days**, **Past week**, **Past 2 weeks**, or **Past month**.
- Hard-filters by selectable research categories and up to five specific interests.
- Sorts by best combined signal, novelty, researcher track record, or newest.
- Screens at Chrome startup and refreshes in the background with `chrome.alarms`.
- Sends native Chrome alerts and keeps a local new-paper inbox for newly qualifying work.
- Stores papers, scores, author metrics, and comparison history locally in IndexedDB.
- Shows compact score badges on arXiv lists and a score strip on arXiv abstract pages.
- Explains every score with the nearest older paper, peer count, confidence, incremental-language flags, and top author evidence.
- Uses only the OpenAlex API; it does not scrape publisher HTML or download papers.

## Install it locally

1. Download and unzip a FilteredResearch release, or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the folder containing `manifest.json`.
5. Pin FilteredResearch, then click its toolbar button to open the side panel.
6. Open Settings, select broad categories, and optionally add up to five narrower interests. The first screen also builds a historical comparison set, so it can take about a minute.

Chrome 116 or later is required. The `notifications` permission is used only for papers that clear your filters and acceptance bar, and alerts can be disabled in Settings.

### Filtering semantics

- Selected categories are joined with **OR**: AI *or* Physics, for example.
- Typed interests are joined with **OR**.
- If both groups are configured, a paper must match a selected category **and** at least one interest.
- English-only filtering is on by default to avoid unreliable translated or malformed metadata.
- Small interest typos are tolerated locally.

### Optional: add a free OpenAlex key

Basic API use works without a key. A free key raises the available OpenAlex budget and is recommended for regular scans.

1. Get a key from [OpenAlex API settings](https://openalex.org/settings/api).
2. Open FilteredResearch Settings.
3. Paste the key under **OpenAlex access** and save.

The key stays in `chrome.storage.local` in your Chrome profile. It is sent only to `api.openalex.org`.

## How ranking works

The scores are deliberately separate. A paper clears the default feed if either score is at least 70.

### Novelty score

Novelty is relative to the extension's own historical sample, not to all human knowledge. The scorer:

1. chooses older papers from the same OpenAlex subfield, then domain, then the wider comparison set;
2. computes TF–IDF cosine distance over titles and abstracts;
3. adds smaller signals for rare title phrases and unusual field combinations;
4. penalizes phrases often associated with explicitly incremental work, such as “enhanced” or “variant of”;
5. shrinks the result toward 50 when too few comparison papers are available.

The evidence drawer reports the nearest older paper and the comparison count. A high score with low confidence is a lead to inspect, not a verdict.

### Researcher score

For each enriched author, the extension combines:

- h-index: 45%
- career citations: 25%
- two-year mean citedness: 15%
- works count: 10%
- ORCID identity signal: 5%

Logarithmic scaling prevents extremely large careers from overwhelming the score. First, last, and corresponding authors receive full role weight; middle authors receive 86%. The paper score is 82% the strongest authorship signal and 18% the team median.

This measures an **established track record**, not intelligence, integrity, or paper quality. Bibliometrics vary by field and career stage, and OpenAlex author disambiguation can be wrong. Institution prestige is intentionally excluded.

### Best-signal ranking

The default combined score is `72% × stronger axis + 28% × weaker axis`. That makes the feed an OR-style discovery system: an unusually novel paper from unknown authors can surface, and a new paper by an established researcher can surface even before novelty evidence is strong.

See [docs/SCORING.md](docs/SCORING.md) for formulas and [SPEC.md](SPEC.md) for the product and architecture specification.

## Coverage and scale

OpenAlex contains a very large cross-disciplinary graph, so a free browser extension cannot exhaustively inspect every new work. FilteredResearch uses bounded lanes:

- a rotating broad sample for serendipity;
- recent search results for each configured interest;
- a rotating three-year historical sample for novelty comparisons.

The default run screens roughly 160 broad papers plus 70 per interest and enriches up to 700 author profiles. Runs are deduplicated locally. Candidate papers are retained for 60 days; the visible feed stops at one month. Results are not capped at 100—the panel renders them in batches of 60 to stay responsive.

For serious use, configure focused interests. “Everything in science” produces a diverse sample, not exhaustive coverage.

## Development

No build step or runtime dependencies are required. The extension is plain Manifest V3 JavaScript, HTML, and CSS.

```bash
npm test
npm run check
npm run package
```

`npm run package` stages a clean load-unpacked folder at `dist/filteredresearch-extension`.

## Releases and automatic updates

GitHub Actions validates and packages every `main` push. Chrome cannot update a developer-mode, unpacked extension directly from GitHub on Windows or macOS. True hands-off browser updates require the Chrome Web Store version; the included publishing workflow can upload and submit each `main` update after the one-time store listing and repository secrets are configured. See [docs/WEB_STORE_RELEASES.md](docs/WEB_STORE_RELEASES.md).

Project layout:

```text
manifest.json                 Chrome permissions and entry points
src/background/              refresh orchestration and message API
src/shared/                  OpenAlex, IndexedDB, settings, and scoring
src/sidepanel/               research feed UI
src/options/                 settings UI
src/notifications/           local new-paper inbox
src/content/                 arXiv score overlays
test/                        dependency-free Node tests
```

## Privacy

FilteredResearch has no analytics, account system, or project-owned server. It requests access only to OpenAlex plus a content script on arXiv. See [PRIVACY.md](PRIVACY.md).

## Contributing

Contributions are welcome. Good first projects include field-aware bibliometric calibration, additional open metadata adapters, stronger novelty baselines, accessible score explanations, and Firefox support. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

Apache-2.0. See [LICENSE](LICENSE).
