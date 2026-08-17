# Compliance and release checklist

This document is an engineering risk review, not legal advice or a legal certification. Applicable law and platform policy can change, and the publisher remains responsible for the final Chrome Web Store disclosures and operation of the product.

## Release posture

| Area | v0.3 control | Status |
| --- | --- | --- |
| Single purpose | Research discovery, ranking, alerts, and on-page marking are one coherent purpose. | Implemented |
| Minimum permissions | No `tabs`, `history`, `cookies`, scripting, identity, or all-sites permission. Site access is a fixed research-domain list. | Tested |
| Notifications | Optional permission requested only when the user enables the feature. | Implemented |
| Website content | Visible titles/IDs are inspected locally for the visible highlighting feature and never transmitted or retained as browsing history. | Disclosed |
| API credentials | No developer key is bundled. Every user supplies a dedicated OpenAlex key, stored locally and hidden from content scripts. | Implemented |
| Network destinations | Background requests are restricted to HTTPS OpenAlex API access. Content scripts perform no external fetches. | Tested |
| Remote code | No remote scripts, `eval`, WebAssembly, or downloaded executable logic. | Tested |
| Deletion | In-product database clearing, removable key, clearable inbox, and uninstall deletion are documented. | Implemented |
| Scoring claims | Scores are explicitly described as fallible discovery heuristics, not peer review, truth, importance, reputation, or scientific merit. | Disclosed |
| Open data | OpenAlex metadata is CC0; OpenAlex is identified as the data source and its Terms still govern API use. | Documented |
| AI assistance | README and settings acknowledge development assistance from OpenAI Codex. | Disclosed |
| Open source | Project code is Apache-2.0; dependencies and copied assets must remain license-compatible. | Implemented |

## Publisher actions before public release

1. Publish `PRIVACY.md` at a stable public HTTPS URL and add it to the Chrome Web Store Privacy tab.
2. Complete the Web Store data-use questionnaire consistently: website content is handled locally; authentication information is the user-entered API key; neither is sold or transmitted to the developer.
3. Put the local page-inspection/highlighting behavior prominently in the store description, not only in the privacy policy.
4. Link the OpenAlex source and terms. Do not imply endorsement by OpenAlex, arXiv, PubMed/NCBI, Semantic Scholar, Google Scholar, Crossref/DOI Foundation, or publishers.
5. Provide accurate support/security contact details. Do not publish until those channels are monitored.
6. Run `npm test`, `npm run check`, and `npm run package`; manually inspect the permissions shown by the exact uploaded ZIP.
7. Re-review Chrome Web Store and OpenAlex terms before each material release. Site DOM changes can also break highlighting without notice.

## Known residual risks

- Chrome local extension storage is not an operating-system secret manager. A dedicated, revocable OpenAlex key limits impact.
- OpenAlex metadata, language labels, citations, author identity resolution, topics, and publication dates can be incomplete or wrong.
- A low similarity score does not prove conceptual novelty; high author bibliometrics do not prove paper quality.
- Website highlighting reads visible page content, which Chrome classifies as user data even though processing is local. The disclosure must remain prominent.
- A Chrome Web Store review, passing automated tests, or this checklist does not guarantee compliance with every jurisdiction, publisher term, or future policy update.
