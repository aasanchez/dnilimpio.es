<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0013. CI pipeline: small single-purpose jobs in logical stages, one required check

- Status: accepted
- Date: 2026-11-25

## Context

CI was one job, `check`, that ran `pnpm verify` (type check, lint, unit tests, build, end-to-end
tests) in sequence, followed by `deploy` on `master`. A failure showed only "check failed"; finding
which step failed meant reading the log. Nothing checked licences, known vulnerabilities, the bundle
size, Lighthouse scores, the workflows themselves, or that the live site really serves the build that
was just deployed.

The owner asked for a pipeline with "very specific, very atomic, very smart" jobs, inspired by the
to-be-continuous GitLab templates (sample `svelte-on-s3`: Node, Sonar and S3 templates), whose jobs
sit in fixed stages: build, test, code analysis, package, deploy, acceptance.

## Decision

- One job per check, grouped in logical stages that follow to-be-continuous: changes, setup, build,
  test, code analysis, acceptance, gate, deploy, post-deploy. GitHub Actions has no stages, so the
  order comes from `needs:`. Jobs that need no build (REUSE, audit, dependency review, workflow lint)
  start at once.
- Build once. `build` uploads `dist/`; end-to-end tests, bundle size, Lighthouse and the deploy all
  use that artifact.
- One `install` job saves the pnpm store cache; the other jobs only restore it. A shared composite
  action (`.github/actions/setup`) sets up Node, pnpm, dependencies and, when asked, Playwright
  Chromium (cached by version).
- End-to-end tests run in two Playwright shards.
- `ci-ok` is the only check branch protection requires. It fails when any job failed or was
  cancelled, and passes when jobs were skipped on purpose (a documentation-only pull request skips
  the code jobs; `dependency-review` runs on pull requests only).
- New checks: REUSE lint, `pnpm audit --prod` (high and critical), GitHub dependency review,
  actionlint and zizmor, bundle-size budgets (`scripts/bundle-size.ts`), Lighthouse, CodeQL
  (separate workflow, also weekly), and a post-deploy smoke test (`scripts/smoke.ts`) that checks
  the live site serves this commit's build with a matching SRI hash. Since the security audit of
  2026-11-25 (finding SEC-004) it checks every file: the exact CSP and referrer policy, every file of
  the service worker's manifest against its SHA-384, and every file of the `dist` artifact that the
  same run deployed, byte for byte.
- Bundle size and Lighthouse start as warnings until there is a baseline from real runs. Unit
  coverage is reported with no threshold.
- No second secret scanner: GitGuardian already scans pull requests.
- Not adopted from to-be-continuous: SonarQube (CodeQL and the linters cover it without an external
  service and token) and review environments per branch (GitHub Pages has one site per repository).

### Amendment (2026-11-25): validate on pull requests, release on master

- Pull requests run every check and never deploy. `master` (push or manual run) does not run the
  checks again: it builds, deploys, runs `smoke` and Lighthouse on the live site. Pull requests are
  squash-merged from a branch that must be up to date with `master`, so the merged tree is the tested
  tree. Branch protection must require a pull request, the `ci-ok` check and an up-to-date branch.
- `deploy` and `smoke` check the results of their direct `needs`. An `if:` without a status function
  means `success()` of every upstream job, and a job skipped on purpose (for example
  `dependency-review` on a push) then skipped the deploy.
- Faster setup: `node_modules` is cached as a whole (a hit skips `pnpm install`); the pnpm store is
  the fallback. Playwright installs only Chromium's headless shell.

## Consequences

- A failure names the exact check. Independent checks run in parallel.
- More jobs means more runner start-ups; caching keeps each one short.
- Branch protection needs one change: require `ci-ok` instead of the old `check`.
- To make bundle size or Lighthouse blocking, change one line each (`--strict`, `"error"`).
- The repository is now REUSE compliant: a default annotation in `REUSE.toml` gives every file a
  copyright line, and the AGPL text is also in `LICENSES/`.
