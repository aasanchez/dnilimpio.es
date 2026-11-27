<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0013. CI pipeline: small single-purpose jobs in logical stages, one required check

- Status: accepted; a `release` job added by [ADR 0032](0032-semver-releases.md)
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
- End-to-end tests run in four Playwright shards (two until 2026-11-27).
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
- Supply chain (added after the security audit of 2026-11-25): the build sets `SOURCE_DATE_EPOCH`
  to the commit time, and the `reproducible` job builds the commit a second time and compares every
  file with the tested artifact. The build uploads a CycloneDX SBOM (`pnpm sbom`). On `master`, the
  `attest` job signs build provenance for every deployed file with GitHub artifact attestations
  (the only job besides `deploy` with `id-token: write`).
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

### Amendment (2026-11-25): weekly dependency check

- A separate workflow, `deps-check.yml`, runs `pnpm audit` and `pnpm outdated` every Wednesday at
  16:00 Europe/Madrid (the `timezone` key of `on.schedule`, so the time holds across daylight saving),
  and on `workflow_dispatch`. It does not block pull requests; the `audit` job in `ci.yml` stays the
  pull-request gate.
- Scope. `--prod` does not mean "direct dependencies": it leaves out `devDependencies`. `pnpm
  outdated` lists direct dependencies only by default. `pnpm audit` always checks the whole tree,
  because a vulnerable transitive package ships or runs just like a direct one; the report names the
  direct dependency that brings each advisory in, which is the one to update.
- Dev dependencies are included in both jobs. They run on developer machines and on the CI runner that
  builds, signs and deploys the site, so a vulnerable build tool can change what ships.
- The audit fails at high or critical, so GitHub's failed-run notification is the alert. `outdated`
  only reports. Neither job installs `node_modules` (both read `pnpm-lock.yaml`), so there is no cache.

### Amendment (2026-11-27): Rebase and merge by default

- Decided by Alexis. Pull requests are merged with **Rebase and merge**, so `master` keeps each
  logical step as its own commit and stays linear. Squash and merge remains for a branch whose
  commits cannot be made clean, or that contains a merge commit.
- The safety argument of the amendment of 2026-11-25 still holds: branch protection requires an
  up-to-date branch, so the tree of the last rebased commit is the tested tree. GitHub rewrites the
  commits on merge, so `reproducible` still builds the release commit again.
- CI tests only the last commit of a push. The commits before it land on `master` untested, so each
  commit must build and pass `pnpm typecheck` and `pnpm test` on its own
  (`git rebase --exec … origin/master`). This keeps `git bisect` and `git revert` usable.
- `master` deploys once per push, not once per commit, so a pull request of several commits still
  makes one release.
- Settings on GitHub: allow Rebase and merge (keep Squash and merge allowed for the fallback).
