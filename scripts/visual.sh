#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Runs the screenshot tests (tests/e2e/visual.spec.ts) inside the pinned Playwright container, the
# same image the CI job `visual` uses, so the baselines match on every machine.
#   pnpm test:visual            compare with the baselines
#   pnpm test:visual:update     write new baselines (review the PNG diff before you commit it)
# Extra arguments go to `playwright test`. Needs Docker. VISUAL_DOCKER_ARGS adds `docker run` options,
# such as a proxy or a CA certificate.
set -euo pipefail

# Keep in sync with the `visual` job in .github/workflows/ci.yml and with @playwright/test in package.json.
IMAGE='mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579'

cd "$(dirname "$0")/.."
PNPM="$(node -p "require('./package.json').packageManager")"

# node_modules and the pnpm store live in Docker volumes, so the host's own (possibly macOS) modules
# are never used. Files the container writes (dist/, baselines, test-results/) are handed back to
# the owner of the checkout.
exec docker run --rm --ipc=host --init \
  -v "$PWD":/work -v dnitapado-visual-node-modules:/work/node_modules \
  -v dnitapado-visual-pnpm-store:/root/.local/share/pnpm -w /work -e VISUAL=1 ${VISUAL_DOCKER_ARGS:-} \
  "$IMAGE" bash -c '
    npm install --global --ignore-scripts --no-fund --no-audit "$0" \
      && pnpm install --frozen-lockfile --reporter=silent && pnpm build --logLevel warn \
      && pnpm exec playwright test "$@"
    status=$?
    chown -R "$(stat -c %u:%g /work)" dist tests/e2e/__screenshots__ test-results 2>/dev/null
    exit $status' "$PNPM" "$@"
