# 0003. Svelte 5 + Vite; Node.js and pnpm pinned to latest stable

- Status: accepted
- Date: 2026-11-25
- Decided by: Alexis (spec §3, §4; "migrate now in one PR")

## Context

The interface was written in vanilla TypeScript with hand-built DOM. Phase 1 adds a field checklist that
stays in sync with the canvas, a mask editor with undo and redo, a live watermark, a review panel and a
reset. That much shared state is easier to keep correct with a reactive UI layer. The spec names
Svelte 5 with runes, Vite, Node.js latest stable managed with nvm, and pnpm.

## Decision

- **UI:** Svelte 5.59.1 with runes, through `@sveltejs/vite-plugin-svelte`. No SvelteKit, no router,
  no state library.
- **Logic stays framework-free:** `src/capture`, `src/geometry`, `src/zones`, `src/redact` and
  `src/engine` are plain TypeScript and do not import Svelte. The corner editor stays an imperative
  canvas widget; a Svelte attachment mounts it.
- **No HTML strings at runtime:** compiler option `fragments: 'tree'` makes Svelte build DOM with
  `createElement` instead of parsing templates through `innerHTML`. The CSP now adds
  `trusted-types 'none'` on top of `require-trusted-types-for 'script'`, so no code (ours or a
  dependency's) can create a policy to get around it. `{@html}` is a lint error.
- **Node.js 26.13.1** in `.nvmrc`: the newest release on nodejs.org on 2026-11-25 that is not an
  alpha, beta, RC or nightly (27.0.0 is still alpha). `engines.node` is `>=26.13.1`.
- **pnpm 12.23.0** in `packageManager` (npm `latest` tag on 2026-11-25). `pnpm-lock.yaml` is
  committed and CI runs `pnpm install --frozen-lockfile`. `pnpm-workspace.yaml` sets exact saves and
  allows no dependency to run install scripts (`strictDepBuilds`, empty `onlyBuiltDependencies`).
- **CI** installs that exact pnpm with the npm that ships with Node. This avoids adding a third-party
  setup action.

## Alternatives

- Keep vanilla TypeScript: no new dependency, but every new control would need hand-written DOM
  syncing. Rejected by Alexis.
- React, Vue, SvelteKit: excluded by the spec.

## Consequences

- New dev dependencies: `svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`, `eslint-plugin-svelte`.
  The Svelte runtime (MIT) ships in the bundle.
- `pnpm typecheck` runs `svelte-check`, which checks `.ts` and `.svelte` files.
- Versions are upgraded on purpose, in their own PR, never automatically during a build.
- Type-aware ESLint rules cannot see the prop types of `.svelte` files imported into other `.svelte`
  files. Shared types live in `.ts` files (for example `src/ui/capture-state.ts`), and callback
  parameters are typed explicitly.
