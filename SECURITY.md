# Security policy

Please report vulnerabilities privately to the repository owner rather than opening a public issue. Include reproduction steps, the affected Chrome version, and the extension version.

The current alpha has no project-owned server. The main security boundaries are extension permissions, local storage, OpenAlex responses, and arXiv DOM integration. External titles and abstracts must be treated as untrusted text and inserted with `textContent`, never raw HTML.

API keys should never be committed, logged, included in error messages, or placed in synchronized settings.
