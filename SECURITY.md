# Security policy

Please report vulnerabilities privately to the repository owner rather than opening a public issue. Include reproduction steps, the affected Chrome version, and the extension version.

The extension has no project-owned server. The main security boundaries are extension permissions, local storage, OpenAlex responses, and supported research-site DOM integration. External titles and abstracts must be treated as untrusted text and inserted with `textContent`, never raw HTML.

API keys should never be committed, logged, included in error messages, or placed in synchronized settings. The service worker restricts `chrome.storage.local` to trusted extension contexts so content scripts cannot read the saved key. Users should still create a dedicated, revocable OpenAlex key because Chrome local extension storage is not an operating-system secret manager.
