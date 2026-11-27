// SPDX-License-Identifier: AGPL-3.0-or-later
// The thanks page's text, in every language, built into the page. The app page loads a language on
// demand, checked through its import map (src/i18n/index.ts). The thanks page has no import map and
// loads nothing on demand (ADR 0029), so the build links every dictionary into it instead: the same
// files the app uses, each checked by its hash like every other script of the page.
import { t, type Key, type Lang } from '../i18n/index.ts'

const DICTIONARIES = import.meta.glob<Readonly<Record<string, string>>>('../i18n/locales/*.json', { eager: true, import: 'default' })

/** One string of the thanks page. A string missing from a translation shows in Spanish, as in the app. */
export function thanksText (lang: Lang, key: Key): string {
  return DICTIONARIES[`../i18n/locales/${lang}.json`]?.[key] ?? t('es', key)
}
