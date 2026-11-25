// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared by the Vite plugin, svelte-check and eslint-plugin-svelte.
/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  compilerOptions: {
    runes: true,
    // Build DOM with createElement instead of parsing HTML templates through innerHTML:
    // no HTML strings at runtime, so Trusted Types needs no policy (spec §20).
    fragments: 'tree',
  },
}
