# Contributing

Thanks for helping make research discovery less noisy.

## Principles

- Keep ranking evidence visible.
- Treat novelty and reputation as uncertain signals, never ground truth.
- Do not add institution prestige as a score.
- Prefer open metadata and narrow permissions.
- Keep the extension usable without a hosted backend or paid API.
- Render external text safely with DOM text nodes.
- Preserve the dependency-free runtime unless a dependency provides clear, reviewed value.

## Local workflow

1. Fork and clone the repository.
2. Run `npm test` and `npm run check`.
3. Load the repository root from `chrome://extensions` using **Load unpacked**.
4. Make a focused change with tests.
5. Confirm the side panel, settings, and arXiv page behavior manually.

## Pull requests

Explain the user problem, the behavior change, any scoring implications, new permissions, and how the change was verified. Ranking changes must update `docs/SCORING.md` and bump `SCORING_VERSION` so stored scores can be identified.

Do not include API keys or copied publisher content in fixtures.
