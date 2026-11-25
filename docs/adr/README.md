# Architecture decision records

One file per decision that is costly to reverse. Format: context, decision, alternatives, consequences.
Status is `accepted`, `superseded by NNNN` or `deviates from spec §N` (when a decision overrides the
project specification on purpose).

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-pdf-library.md) | PDF export with `@cantoo/pdf-lib` | accepted |
| [0002](0002-no-standalone-release.md) | No standalone offline release | accepted, deviates from spec §25 |
| [0003](0003-svelte-vite-pnpm.md) | Svelte 5 + Vite; Node.js and pnpm pinned to latest stable | accepted |
| [0004](0004-offline-service-worker.md) | Offline mode with a verified service worker; one Trusted Types policy for its URL | accepted |
| [0005](0005-guided-flow-and-visual-style.md) | Guided phone-first flow; openaggregator.io-style visuals with self-hosted fonts | accepted |
| [0008](0008-capture-coach.md) | Capture coach: live tips and automatic shot from classical image metrics, no model | accepted |
