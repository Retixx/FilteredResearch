# Privacy policy

Effective: August 17, 2026

FilteredResearch is a local-first Chrome extension with no FilteredResearch-operated server, advertising, analytics, telemetry, accounts, or sale of data.

## Data handled

- Research interests, selected OpenAlex fields/subfields, score selectivity, and display preferences are stored in `chrome.storage.sync` so Chrome may synchronize them under the user's Google/Chrome settings.
- A user-supplied OpenAlex API key is stored only in `chrome.storage.local`. Local storage is restricted to trusted extension pages and the service worker. Chrome extension storage is not an encrypted secret vault, so users should use only a dedicated OpenAlex key and may delete it at any time.
- Public paper metadata, abstracts, author bibliometrics, calculated scores, notification entries, and refresh state are stored in extension-owned IndexedDB on the device.
- The extension reads no web page. Page highlighting was removed in v0.8.0, no content script is injected anywhere, and the extension has no access to the pages a user visits.

## Network requests

The background service worker sends HTTPS requests to `https://api.openalex.org/` for public scholarly metadata and author bibliometrics, and to arXiv's public category-taxonomy page to keep category codes/names aligned with arXiv. If the user entered an OpenAlex key, it is attached only to OpenAlex requests. [OpenAlex's terms](https://openalex.org/OpenAlex_termsofservice.pdf) and [privacy policy](https://openalex.org/OpenAlex_privacy_policy.pdf) apply to its service.

Every OpenAlex request carries a fixed `mailto` parameter identifying FilteredResearch itself, which is how OpenAlex asks tools to identify themselves so it can contact whoever maintains one. It is a project contact address, is the same for every install, and carries nothing about you. Your own OpenAlex key, if you add one, is attached only to these requests and is never sent anywhere else.

Only the background service worker makes network requests, and only to the destinations disclosed above. FilteredResearch does not transmit page URLs, browsing activity, research interests, scores, or locally indexed papers to its developer.

## Retention and deletion

Candidates are retained for up to 400 days. Saved configurations, local API-usage estimates, and a historical field comparison corpus remain until the user clears data. The notification inbox is retained locally until cleared.

Users can:

- clear papers, author metrics, scoring history, and notifications from the extension UI;
- remove their OpenAlex key by saving an empty key;
- remove all extension-owned local data by uninstalling the extension;
- control Chrome Sync separately in Chrome settings.

## Permissions

- `storage`: retain settings, a user-provided key, and the local index.
- `sidePanel`: display the primary interface.
- optional `notifications`: show a native alert only after the user enables notifications.
- `https://api.openalex.org/*`: retrieve OpenAlex scholarly metadata.
- `https://arxiv.org/*`: retrieve arXiv's official public category taxonomy so category codes and names stay aligned.
- `alarms`: wake the service worker so an automatic scan can run on the interval the user chose.

FilteredResearch does not request `tabs`, `history`, `cookies`, `<all_urls>`, precise location, identity, or clipboard access.

## Limited Use statement

Data obtained through Chrome permissions is used only to provide or improve FilteredResearch's single research-discovery purpose. It is not transferred for advertising, sold, used for creditworthiness or lending, or made available for humans to read. No user data is used for personalized, retargeted, or interest-based advertising.

Questions or security reports should be sent through the repository's private security-reporting channel.
