# Chrome Web Store listing

Accurate for **v0.8.0**. The listing must match the manifest: since v0.8.0 the
extension declares no content script and reads no web page, so any wording about
highlighting or on-page reading is not just outdated but a false disclosure.

## Single purpose

Find recent research papers in a chosen field and rank them on two transparent
signals — lexical novelty against older field-adjacent work, and author track
record — using public OpenAlex metadata, entirely on the user's own machine.

## Short description (132 characters max)

Find unusually novel recent research in your field, ranked on transparent novelty and authorship signals. Local-first, no account.

## Full description

FilteredResearch helps you find recent papers that are unusual relative to older
work in the same field and associated with an established authorship record.

Choose an OpenAlex field, subfield, or arXiv category, then pick how far back to
index: 1 day, 3 days, 1 week, 2 weeks, 1 month, or 3 months. The side panel shows
matching papers for each date range, with two scores you control:

- Novelty measures how crowded a paper's neighbourhood is compared with the
  field's own distribution, and how much vocabulary it introduces that the field
  does not already use. Surveys, benchmarks and empirical comparisons are scored
  down explicitly.
- Authorship uses public OpenAlex bibliometrics: h-index, citations, recent
  citedness, publication count, ORCID presence, and author position.

Both acceptance bars apply together. Duplicate records from different journals
and repositories are merged into one paper with separate source links, and a
paper first posted as a preprint keeps its original date rather than resurfacing
as new when a journal republishes it.

Optional automatic scanning checks for new research every 3 hours, 6 hours,
24 hours, or 3 days. Papers that clear both bars collect in a local inbox and the
toolbar icon shows an unread count. Automatic scanning is off by default.

FilteredResearch reads no web page. It has no content script, no server, no
account, no advertising, no analytics, and no telemetry. Your settings, your
OpenAlex key, and your paper index stay in Chrome extension storage on your
machine. No developer key is bundled; each user supplies their own free OpenAlex
key for full coverage, and the extension runs as a smaller preview without one.

Novelty and authorship scores are fallible screening heuristics. They are not
peer review, not verified novelty, not a measure of paper quality or scientific
significance, and not a judgment about any researcher. Evidence and limitations
are shown inside the extension and in the open-source documentation.

Data source: OpenAlex public scholarly metadata (CC0). FilteredResearch is
independent and is not endorsed by OpenAlex, arXiv, or OpenAI. Open source under
Apache-2.0. Developed with assistance from OpenAI Codex.

## Permission justifications

Keep these short and tied to a user-visible feature.

- **storage** — saves your settings, your own OpenAlex API key, the local paper
  index, computed scores, and the new-paper inbox. Nothing leaves the device.
- **alarms** — wakes the extension so an automatic scan can run on the interval
  you selected. Without it a scheduled scan cannot fire once Chrome suspends the
  service worker.
- **sidePanel** — the side panel is the extension's main interface.
- **host: `https://api.openalex.org/*`** — retrieves public paper, topic and
  author metadata. Your own API key is attached only to these requests.
- **host: `https://arxiv.org/*`** — retrieves arXiv's public category taxonomy so
  category codes and names stay accurate.
- **notifications (optional)** — requested only if you switch on desktop alerts
  for new papers; the extension works fully without granting it.

## Privacy tab

**Privacy policy URL:** `https://github.com/Retixx/FilteredResearch/blob/main/PRIVACY.md`

Data handling, category by category:

| Category | Declare | Why |
| --- | --- | --- |
| Personally identifiable information | No | No account, no name, no email. |
| Health information | No | — |
| Financial and payment information | No | Nothing is sold or charged. |
| Authentication information | **Yes** | The user's own OpenAlex API key is stored locally and attached to OpenAlex requests to authenticate the user's own calls. It is never sent to the developer. |
| Personal communications | No | — |
| Location | No | — |
| Web history | No | The extension cannot see visited pages. |
| User activity | No | No analytics, no clicks or interaction are recorded or transmitted. |
| Website content | **No** | Removed in v0.8.0. No content script is declared, so no page content is ever read. Earlier versions did read supported research pages; that is gone. |

Then certify all three: data is not sold to third parties, is not used or
transferred for purposes unrelated to the single purpose above, and is not used
or transferred to determine creditworthiness or for lending.

## Store assets still required

These cannot be generated from the repository and must be produced from a real
install:

- **Icon 128×128** — `assets/icon-128.png` already satisfies this.
- **Screenshots**, 1280×800 or 640×400, at least one, up to five. Worth showing:
  the side panel with results, the settings scope picker, the acceptance-bar
  sliders, and the new-paper inbox.
- **Small promo tile**, 440×280, if you want placement in store surfaces.

Avoid screenshots containing a real API key or personal data.

## Before each submission

1. Increase `version` in both `manifest.json` and `package.json`. The store
   rejects a package whose version was not raised.
2. `npm test`, `npm run check`, then `npm run zip`.
3. Upload `FilteredResearch-web-store.zip`.

Automated uploads run from `.github/workflows/chrome-web-store.yml` once the
`CWS_*` secrets exist; see `WEB_STORE_RELEASES.md`. The first submission must be
made by hand.
