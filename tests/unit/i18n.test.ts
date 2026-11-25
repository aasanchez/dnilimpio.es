// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { AUTONYMS, LANGS, diffKeys, dir, pickLang, t } from '../../src/i18n/index.ts'

describe('i18n', () => {
  it.each(LANGS)('%s has exactly the keys of es.json', (lang) => {
    expect(diffKeys(lang)).toEqual({ missing: [], extra: [] })
  })
  it('has an autonym for every language', () => {
    for (const l of LANGS) expect(AUTONYMS[l]).toBeTruthy()
  })
  it('matches browser language tags', () => {
    expect(pickLang(['de-DE', 'en-GB', 'es'])).toBe('en')
    expect(pickLang(['es-ES'])).toBe('es')
    expect(pickLang(['ca-ES'])).toBe('ca')
    expect(pickLang(['ca-ES-valencia'])).toBe('ca-ES-valencia')
    expect(pickLang(['ca-valencia'])).toBe('ca-ES-valencia')
    expect(pickLang(['gl-ES'])).toBe('gl')
    expect(pickLang(['eu'])).toBe('eu')
    expect(pickLang(['ar-MA'])).toBe('ar')
    expect(pickLang(['uk-UA'])).toBe('uk')
    expect(pickLang(['nl-BE', 'fr'])).toBe('nl')
    expect(pickLang(['de'])).toBe('es')
    expect(pickLang([])).toBe('es')
  })
  it('returns the translated string', () => {
    expect(t('eu', 'sourceCode')).toBe('Iturburu-kodea')
    expect(t('es', 'sourceCode')).toBe('Código fuente')
  })
  it('marks only Arabic as right to left', () => {
    expect(LANGS.filter((l) => dir(l) === 'rtl')).toEqual(['ar'])
  })
})
