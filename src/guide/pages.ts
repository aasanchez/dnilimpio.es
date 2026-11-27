// SPDX-License-Identifier: AGPL-3.0-or-later
// File name of each document's card guide page (ADR 0040). A module of its own with no runtime import,
// so the start screen can link the pages without loading the guide's text and sources.

import type { DocModel } from '../zones/types.ts'
import type { GuidePage } from '../offline/precache.ts'

/** File name of each document's page, at the root of the site, next to index.html. */
export const GUIDE_PAGE: Readonly<Record<DocModel, GuidePage>> = {
  'dni-4.0': 'guia-dni-4.html',
  'dni-3.0': 'guia-dni-3.html',
  tie: 'guia-tie.html',
}

/** The language the pages are written in. Links from another language say so (hreflang). */
export const GUIDE_PAGE_LANG = 'es'
