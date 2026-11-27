<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0032. Automatic patch releases on deploy, with the version in the footer

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis

## Context

Every commit on `master` deploys, but a deploy had no name people can use. The footer showed only
the short commit SHA and the deploy time ([PR #21](https://github.com/aasanchez/dnilimpio.es/pull/21)).
There were no git tags and no GitHub Releases, so there was no list of what changed between two
deploys, and no lasting place for each deploy's release evidence (the `release-evidence` artifact
expires after 90 days).

Alexis asked for semantic versions: each new commit on `master` raises the patch number, starting
from the latest tag on `master`. Major and minor change by hand only. After a successful deploy, CI
creates the release. The start screen shows the deployed version.

The build is reproducible, and CI rebuilds the release commit and compares every file before it
deploys ([ADR 0013](0013-ci-pipeline.md)). The version must therefore be part of the build input,
fixed before the build, and the same for both builds.

## Decision

- **Version rule** ([`scripts/release-version.ts`](../../scripts/release-version.ts)). The base is the
  highest tag of the form `vMAJOR.MINOR.PATCH` reachable from the commit. Other tags, including
  pre-releases such as `v1.0.0-rc.1`, are ignored.
  - The commit already carries that tag: the version is that tag. This covers a manual run on a
    commit that is already released, and a version set by hand on that commit.
  - Otherwise: the patch goes up by one. `v1.4.7` gives `1.4.8`.
  - No version tag at all: the first version is `1.0.0`.
- **Major and minor by hand.** Alexis pushes a tag such as `v1.5.0` on a commit of `master`. Either
  run CI on `master` by hand (workflow_dispatch) to deploy that commit as `1.5.0`, or wait: the next
  merge deploys as `1.5.1`. To start somewhere other than `1.0.0`, push a tag (for example `v0.1.0`)
  before the first release run.
- **Computed once, before the build.** The `changes` job checks out the whole history with its tags,
  computes the version and passes it as `RELEASE_VERSION` to `build`, `reproducible` and `e2e`. Vite
  writes it into the bundle (`__BUILD_VERSION__`); only `MAJOR.MINOR.PATCH` is accepted. Both builds
  get the same value, so the rebuild check still compares like with like. The release evidence gains
  `version.txt`.
- **Pull requests** compute the version too: the one the change would get if it merged now. The PR
  build shows it, so the e2e test checks the footer with a real value. It is never tagged.
- **Tag after the deploy.** A new `release` job runs only when `deploy` succeeded. It creates the tag
  on the deployed commit and a GitHub Release with notes generated from the merged pull requests, and
  attaches the release evidence (file hashes, commit, version, SBOM). The tag therefore means "this
  build was deployed". The job is safe to run again: a tag already on this commit is kept, and an
  existing release is left as it is. A tag with the same name on another commit fails the job.
  It needs `contents: write`, for that job only.
- **Concurrent pushes.** Runs on `master` share one concurrency group and are never cancelled, so they
  run one after another. Each run computes its version after the run before it has tagged. When
  several pushes arrive during a run, GitHub keeps only the newest waiting run; it contains the
  skipped commits, so they deploy together under one version. A failed deploy creates no tag, so the
  next run gets the same version number again: numbers are used only by successful deploys.
- **Footer.** `Versión 1.4.8 · 2a07023 · desplegado hace 5 minutos`. The version links to its GitHub
  Release in a new tab; the SHA still links to the commit. A build without a version (local) shows
  the footer as before. No new text to translate.

## Consequences

- Every deploy has a name, a tag and a release page with the changes and the evidence. The release
  assets do not expire like workflow artifacts do.
- A rebuild for checking needs the version too: `RELEASE_VERSION=<version>` from the footer or the
  release's `version.txt` (README, "Rebuild"). Without it, the footer bytes differ.
- If `release` fails after a successful deploy, the live site shows a version that has no tag yet.
  Re-run the failed job before the next merge; otherwise the next commit deploys with the same
  number. The job's error shows on the run.
- The `changes` job now fetches the full history (small for this repository) and sets up Node.js, a
  few seconds more per run.
- The GitHub Release link in a pull request build points at a release that does not exist yet. Pull
  request builds are never deployed.
