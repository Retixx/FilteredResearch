# FilteredResearch product specification

Status: alpha MVP
Target: Chrome 116+, Manifest V3
Distribution: open-source, load-unpacked; Chrome Web Store release automation included

## 1. Problem

Research discovery feeds optimize for recency, keyword match, or citation popularity. They do not answer the narrower question: “Which new papers are unusually different from prior work, or are authored by researchers with an established track record?” A person currently has to scan a large stream and make both judgments manually.

## 2. Product promise

FilteredResearch produces a small local feed with two visible, inspectable scores:

1. **Novelty**: difference from older, topic-adjacent work available in the local comparison corpus.
2. **Researcher**: strength of the paper's authorship track record based on OpenAlex evidence.

The product never describes either score as objective quality. It exposes uncertainty and the evidence behind each score.

## 3. Goals

- Work without hosting, a project-owned backend, or an account.
- Cover research across domains rather than target AI research.
- Offer Past day / Past 3 days / Past week / Past 2 weeks / Past month windows.
- Admit a paper when it is strong on either axis.
- Show why a paper received each score.
- Refresh in the background without needing an open tab.
- Complement the user's existing arXiv workflow.
- Keep permissions narrow and keep user interests local to Chrome sync storage.

## 4. Non-goals

- Exhaustively ingest every new scholarly document.
- Decide whether a result is true, reproducible, ethical, or important.
- Replace peer review or subject-matter judgment.
- Read paywalled full text.
- Rank institutions or use institutional prestige as a quality proxy.
- Use citation count on a brand-new paper as a quality signal.
- Run a hosted recommendation service.

## 5. Primary workflows

### First run

1. The user loads the extension and clicks its toolbar action.
2. The side panel opens and begins a bounded recent scan.
3. In parallel, the extension builds an older reference sample.
4. Papers and authors are enriched, scored, and stored locally.
5. The feed displays papers that pass either threshold.

### Configure filters

1. The user opens Settings.
2. They select any number of broad research categories and optionally enter up to five phrases or questions.
3. Categories are OR filters; phrases are OR filters; if both exist, the two groups are joined with AND.
4. English-only metadata is the default, and both ingestion and display enforce the filters.

### Browse

1. The user selects one of five age windows.
2. They sort by Best signal, Novelty, Researcher, or Newest.
3. Each card shows both scores, never just a combined rank.
4. The Evidence control reveals nearest-paper, confidence, and author signals.

### Use arXiv

1. Known papers on arXiv lists receive N/R badges.
2. On an arXiv abstract page, the extension can resolve the title through OpenAlex and score it against the local corpus.
3. Failure is silent; the content script must never block or damage arXiv.

## 6. Ingestion specification

Source for MVP: OpenAlex REST API.

Candidate lanes per refresh:

- category-scoped broad sample: 160 works from the last 30 days, or a cross-disciplinary sample when no filters exist;
- interest lanes: 70 newest/relevant works for each of up to five queries;
- accepted types: article and preprint;
- abstract required;
- deduplication key: OpenAlex Work ID.

Historical lane on bootstrap:

- broad sample: 360 works;
- query history: 100 works per interest;
- period: older than the candidate month and up to three years back;
- history records do not appear in the feed.

Operational limits:

- 100 records per API page;
- batch author lookups, at most 100 IDs per request;
- up to 700 author enrichments per refresh;
- 25 stored authorships per paper;
- exponential retry for HTTP 429 and 5xx;
- 25-second fetch timeout;
- API key optional and stored locally.

## 7. Scoring specification

### 7.1 Novelty

Inputs: title, abstract, publication date, OpenAlex topics, historical local works.

Peer selection:

1. older works in the same subfield if at least 20 exist;
2. otherwise older works in the same domain if at least 20 exist;
3. otherwise all older reference works;
4. maximum 320 comparisons.

Components:

- semantic lexical distance: 78%;
- title phrase rarity: 14%;
- field-pair rarity: 8%;
- incremental marker penalty: up to 14 points.

The implementation uses dependency-free TF–IDF cosine distance. Confidence is `min(1, log(1 + peer_count) / log(251))`. The raw score is shrunk toward 50 in proportion to confidence.

Required evidence:

- peer count;
- nearest older work and similarity;
- novelty confidence;
- component values;
- any incremental markers and penalty;
- scoring version.

### 7.2 Researcher

Inputs per author: h-index, cited-by count, works count, two-year mean citedness, ORCID presence, authorship position.

Each numeric feature is log-scaled against a fixed soft ceiling. Component weights are 45/25/15/10/5. First, last, and corresponding authors receive role weight 1; middle authors receive 0.86. Paper-level score is `0.82 × strongest authorship + 0.18 × enriched-author median`.

Confidence is the fraction of stored paper authorships successfully enriched. The UI must call this “Researcher” or “established track record,” not “paper quality.”

Required evidence:

- top author name and role;
- h-index, citations, works, and recent citedness;
- ORCID presence;
- institution for context only, never scoring;
- enrichment confidence.

### 7.3 Discovery score

`0.72 × max(novelty, researcher) + 0.28 × min(novelty, researcher)`

Default admission: `novelty >= 70 OR researcher >= 70`.

## 8. Storage model

`chrome.storage.sync`:

- queries;
- thresholds;
- date and sort defaults;
- refresh cadence;
- arXiv badge preference.

`chrome.storage.local`:

- OpenAlex API key.

IndexedDB `filteredresearch`:

- `works`: metadata, authorships, scores, and score evidence;
- `authors`: bibliometrics and refresh timestamp;
- `metadata`: last refresh and refresh state.

Candidate retention: 60 days. Visible maximum: 30 days. Removing the extension removes the database.

## 9. Extension architecture

- Manifest V3 module service worker owns API access, refresh, scoring, and IndexedDB.
- `chrome.alarms` wakes the worker at the configured interval; the alarm is checked whenever the worker starts.
- `runtime.onStartup` performs a fresh scan when the Chrome profile opens.
- Chrome Side Panel hosts the primary feed.
- Options page edits local configuration.
- A local notification inbox and native Chrome alerts surface newly published qualifying papers.
- arXiv content script asks the worker for known scores and performs no external requests itself.
- All external metadata is rendered with DOM `textContent`, not unsanitized HTML.
- No remotely hosted JavaScript, fonts, analytics, or trackers.

## 10. Visual language

- white and warm-grey surfaces;
- opal green as the only prominent accent;
- fine system typography;
- sparse brutalist grid and exposed hairlines;
- selected asymmetric rounded corners;
- offset outline strokes that slightly overshoot card edges;
- no gradients except the temporary loading shimmer;
- no decorative research stock imagery.

## 11. Failure behavior

- API failure leaves the previous feed intact.
- 429 and transient server errors retry with backoff.
- a failed arXiv lookup produces no overlay and does not affect the page.
- low peer count reduces novelty confidence and pulls the score toward neutral.
- missing author data reduces researcher confidence rather than inventing a score.
- a running refresh is reused rather than duplicated within the same service-worker lifetime.

## 12. MVP acceptance criteria

- Manifest loads unpacked in Chrome 116+ without manifest errors.
- Clicking the action opens the side panel.
- Manual refresh ingests and locally saves live OpenAlex data.
- Background alarm exists and respects the chosen cadence.
- Chrome startup triggers a scan and qualifying new papers enter the notification inbox.
- All five date ranges filter by publication date.
- Feed results are not capped at 100 and render incrementally.
- All four sort modes return stable ordering.
- Feed threshold is an OR across the two metrics.
- Evidence opens without navigation and includes confidence.
- Settings persist across panel restarts.
- arXiv content script never injects raw external HTML.
- Node unit tests cover OpenAlex normalization and both scoring axes.
- Manifest has no broad browsing-history, tabs, or all-sites permission.

## 13. Roadmap

1. field- and career-stage-normalized author percentiles;
2. optional local embedding scorer, with lexical scoring retained as an explanation layer;
3. additional open sources such as PubMed/Europe PMC and direct arXiv ingestion;
4. relevance feedback and per-interest thresholds;
5. duplicate/version clustering across preprint and journal publication;
6. CSV/JSON export;
7. Firefox sidebar port;
8. signed Chrome Web Store release and reproducible release packaging.
