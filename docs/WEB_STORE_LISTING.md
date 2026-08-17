# Chrome Web Store listing draft

## Short description

Build a local, field-filtered research index ranked by transparent novelty and authorship signals.

## Full description

FilteredResearch helps you find recent papers that are both unusual relative to older work in the same field and associated with a strong authorship track record.

Choose an OpenAlex field or subfield, supply your own free OpenAlex API key, and build a local rolling one-year index. Browse the past day, 3 days, week, 2 weeks, month, 3 months, 6 months, or year. Both novelty and authorship controls must pass; duplicates appear as one paper with multiple sources.

FilteredResearch also reads visible paper titles and scholarly identifiers when you visit supported arXiv, PubMed, Semantic Scholar, OpenAlex, Google Scholar, and DOI resolver pages. It does this solely to highlight papers that already clear your filters. Page content is compared locally, is not saved as browsing history, and is not sent to the developer or to a third party.

There is no FilteredResearch server, account, advertising, analytics, or telemetry. Your API key and research index stay in Chrome extension storage. Each user uses their own key; no shared developer key is bundled. Native paper alerts are optional.

Novelty and authorship scores are fallible screening heuristics, not peer review, verified novelty, paper quality, scientific significance, or a judgment about any researcher. Evidence and limitations are shown in the extension and open-source documentation.

Data source: OpenAlex public scholarly metadata (CC0). FilteredResearch is independent and is not endorsed by OpenAlex, OpenAI, or any supported research site. Developed with assistance from OpenAI Codex.

## Permission justifications

- **Storage**: saves user settings, user-supplied OpenAlex key, local paper index, scores, and inbox.
- **Alarms**: checks a two-day recent publication overlap at the selected interval.
- **Side panel**: provides the core feed interface.
- **OpenAlex host access**: retrieves public paper/topic/author metadata using the user's own key.
- **Named research-site access**: locally reads visible scholarly titles/identifiers and adds a qualifying-match badge. It does not transmit or retain browsing activity.
- **Optional notifications**: requested only when the user enables native new-paper alerts.

## Privacy questionnaire consistency notes

Declare website content and authentication information as handled. State that processing/storage is local except the key sent over HTTPS to OpenAlex as necessary for the user-requested API service. State that data is not sold, used for advertising, used for creditworthiness, or transferred to the developer. Link the public `PRIVACY.md` URL.
