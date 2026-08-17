# Privacy policy

FilteredResearch is designed without a project-owned backend.

## Data the extension stores

- research interests and display preferences in `chrome.storage.sync`;
- an optional OpenAlex API key in `chrome.storage.local`;
- paper metadata, abstracts, author metrics, scores, and score evidence in local IndexedDB.

The extension does not collect names, email addresses, browsing history, analytics, advertising identifiers, or telemetry.

## Network requests

The extension sends requests only to `https://api.openalex.org/` to retrieve public scholarly metadata and author metrics. If configured, the OpenAlex key is attached to those requests. OpenAlex's own terms and privacy practices apply to that service.

The arXiv content script reads arXiv IDs and visible titles only to match or score the page. It does not transmit general browsing activity, and it makes no network request itself.

## Retention and deletion

Candidate papers are pruned after 60 days. The historical comparison sample is retained to support novelty scoring. Use **Clear research database** in Settings to delete papers, authors, and refresh history. Removing the extension deletes all extension-owned local data.

The new-paper notification inbox is also stored locally in IndexedDB. Native Chrome notifications contain only a qualifying paper's title, category, and two scores. Notifications can be disabled in Settings, and the inbox can be cleared from its page.

## Permissions

- `storage`: persist preferences and local data.
- `alarms`: perform periodic refreshes.
- `sidePanel`: display the main interface.
- `https://api.openalex.org/*`: retrieve scholarly metadata.
- arXiv content script match: show scores on arXiv pages.

FilteredResearch does not request tabs, history, cookies, or access to all websites.
