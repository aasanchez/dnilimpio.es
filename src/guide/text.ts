// SPDX-License-Identifier: AGPL-3.0-or-later
// Guide text, one JSON file per language in ./locales, loaded only when the guide opens. Each file
// is its own chunk of this build, precached by the service worker like the rest of the app, so the
// guide works offline. Spanish (es.json) defines the keys; a key missing from a translation falls
// back to Spanish. An empty string means "no official source": the guide says so instead.

import type { Lang } from '../i18n/index.ts'

export type GuideText = Readonly<Record<string, string>>

const files = import.meta.glob<GuideText>('./locales/*.json', { import: 'default' })

async function load (lang: string): Promise<GuideText> {
  const file = files[`./locales/${lang}.json`]
  return file ? await file() : {}
}

/** Returns a lookup for `lang`, falling back to Spanish for missing keys. */
export async function loadGuideText (lang: Lang): Promise<(key: string) => string> {
  const [own, es] = await Promise.all([load(lang), load('es')])
  return (key) => own[key] ?? es[key] ?? ''
}
