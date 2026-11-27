// SPDX-License-Identifier: AGPL-3.0-or-later
// The supported languages, in a module of their own with no import: the build (src/seo/site.ts,
// scripts/vite-plugins.ts) reads it in Node, where the dictionaries of ./index.ts cannot load.

/** BCP 47 tags. `ca-ES-valencia` is the registered tag for Valencian. */
export const LANGS = ['es', 'ca', 'ca-ES-valencia', 'gl', 'eu', 'en', 'fr', 'nl', 'sv', 'fi', 'uk', 'ro', 'ar'] as const
export type Lang = (typeof LANGS)[number]
