// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { AUTONYMS, LANGS, diffKeys, dir, pickLang, placeholders, t, tf, type Key } from '../../src/i18n/index.ts'
import es from '../../src/i18n/locales/es.json'

describe('i18n', () => {
  it.each(LANGS)('%s has exactly the keys of es.json', (lang) => {
    expect(diffKeys(lang)).toEqual({ missing: [], extra: [] })
  })
  it.each(LANGS)('%s uses the same placeholders as es.json and has no empty strings', (lang) => {
    for (const key of Object.keys(es) as Key[]) {
      expect(t(lang, key).trim()).not.toBe('')
      expect(placeholders(t(lang, key))).toEqual(placeholders(es[key]))
    }
  })
  // Audit item 8: the public wording states only what is exactly true. These absolute claims were
  // replaced ("the app does not upload your document", "your browser keeps the app's files...").
  it.each(['es', 'en'] as const)('%s makes no absolute privacy claim', (lang) => {
    const all = (Object.keys(es) as Key[]).map((k) => t(lang, k)).join('\n')
    for (const claim of [/never leave/i, /no salen/i, /nothing (is )?stored/i, /no se guarda nada/i, /^0 bytes sent$/m, /^0 bytes enviados$/m, /^no server$/im, /^sin servidor$/im]) {
      expect(all).not.toMatch(claim)
    }
  })
  it('fills placeholders', () => {
    expect(tf('es', 'hiddenCount', { hidden: 3, total: 7 })).toBe('3 de 7')
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
