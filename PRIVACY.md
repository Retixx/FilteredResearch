# Privacy policy

Effective: August 17, 2026

FilteredResearch is a local-first Chrome extension with no FilteredResearch-operated server, advertising, analytics, telemetry, accounts, or sale of data.

## Data handled

- Research interests, selected OpenAlex fields/subfields, score selectivity, and display preferences are stored in `chrome.storage.sync` so Chrome may synchronize them under the user's Google/Chrome settings.
- A user-supplied OpenAlex API key is stored only in `chrome.storage.local`. Local storage is restricted to trusted extension pages and the service worker; content scripts cannot read it. Chrome extension storage is not an encrypted secret vault, so users should use only a dedicated OpenAlex key and may delete it at any time.
- Public paper metadata, abstracts, author bibliometrics, calculated scores, notification entries, and refresh state are stored in extension-owned IndexedDB on the device.
- On supported research sites, the extension reads visible paper titles and scholarly identifiers from the current page solely to mark papers that already clear the user's local filters. These values are compared locally and are not saved as browsing history or sent to FilteredResearch, OpenAlex, or another third party.

## Network requests

The background service worker sends HTTPS requests only to `https://api.openalex.org/` to retrieve public scholarly metadata, topic taxonomy, and author bibliometrics. If the user entered an OpenAlex key, it is attached to those OpenAlex requests. [OpenAlex's terms](https://openalex.org/OpenAlex_termsofservice.pdf) and [privacy policy](https://openalex.org/OpenAlex_privacy_policy.pdf) apply to its service.

Content scripts do not make external network requests. FilteredResearch does not transmit page URLs, browsing activity, research interests, scores, or locally indexed papers to its developer.

## Retention and deletion

Candidates are retained for up to 400 days. Saved configurations, local API-usage estimates, and a historical field comparison corpus remain until the user clears data. The notification inbox is retained locally until cleared.

Users can:

- clear papers, author metrics, scoring history, and notifications from the extension UI;
- remove their OpenAlex key by saving an empty key;
- remove all extension-owned local data by uninstalling the extension;
- control Chrome Sync separately in Chrome settings.

## Permissions

- `storage`: retain settings, a user-provided key, and the local index.
- `alarms`: check only the recent publication window on a schedule.
- `sidePanel`: display the primary interface.
- optional `notifications`: show a native alert only after the user enables notifications.
- `https://api.openalex.org/*`: retrieve OpenAlex scholarly metadata.
- scoped content-script access to arXiv, PubMed, Semantic Scholar, OpenAlex, Google Scholar, and DOI resolver pages: locally highlight matching papers.

FilteredResearch does not request `tabs`, `history`, `cookies`, `<all_urls>`, precise location, identity, or clipboard access.

## Limited Use statement

Data obtained through Chrome permissions is used only to provide or improve FilteredResearch's single research-discovery purpose. It is not transferred for advertising, sold, used for creditworthiness or lending, or made available for humans to read. No user data is used for personalized, retargeted, or interest-based advertising.

Questions or security reports should be sent through the repository's private security-reporting channel.
