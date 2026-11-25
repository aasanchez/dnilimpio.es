# 0002. No standalone offline release

- Status: accepted, deviates from spec §25
- Date: 2026-11-25 (first decided 2026-11-24)
- Decided by: Alexis

## Context

Spec §25 asks for a downloadable release with the full build, checksums and a loopback-only launcher,
so the tool can run without the website.

## Decision

Do not build it. One build is published, on GitHub Pages. For offline use, open the site once so it can
prepare its resources, then disconnect from the Internet (spec §18 offline mode, delivered with the
service worker in phase 2).

## Reasons

- Keep the project simple: no launcher to write, sign, test and support per operating system.
- Browsers restrict `file://` pages (service workers, workers, module scripts), so a zip alone does not
  work; it would need the launcher.
- Users can already check what runs: the source is public, every deployed script and stylesheet carries
  Subresource Integrity, and the e2e tests check that the page makes no requests outside its origin.

## Consequences

- Offline use depends on the browser keeping the cached resources (phase 2 shows the real readiness state).
- Anyone who wants to self-host can build from source (`dist/` works on any static server, at the root
  or under a subpath).
- `pnpm release:offline` from spec §28 is not provided.
