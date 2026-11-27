// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { LANGS } from '../../src/i18n/index.ts'
import { appLink, hrefForLang, langFromPath, splitPath, startLang } from '../../src/i18n/url.ts'
import { languageRedirect } from '../../src/offline/precache.ts'
import { redirectFor, redirectsFile } from '../../scripts/headers.ts'

describe('language in the address (ADR 0038)', () => {
  it('reads every supported language from its path, in any case', () => {
    for (const lang of LANGS.filter((l) => l !== 'es')) expect(startLang(`https://x.test/${lang.toLowerCase()}`)).toBe(lang)
    expect(langFromPath('EN')).toBe('en')
    expect(langFromPath('ca-ES-valencia')).toBe('ca-ES-valencia')
  })
  it('starts in Spanish at the site address, an unknown path or a deeper one', () => {
    expect(startLang('https://x.test/')).toBe('es')
    expect(startLang('https://x.test/de')).toBe('es')
    expect(startLang('https://x.test/en/x')).toBe('es')
    expect(startLang('https://x.test/%E0')).toBe('es')
  })
  it('works under a subpath', () => {
    expect(splitPath('https://x.test/sub/en')).toEqual({ base: '/sub/', rest: 'en' })
    expect(startLang('https://x.test/sub/ar')).toBe('ar')
    expect(hrefForLang('https://x.test/sub/ar', 'es')).toBe('https://x.test/sub/')
  })
  it('writes the address of each language, keeping query and fragment', () => {
    expect(hrefForLang('https://x.test/', 'en')).toBe('https://x.test/en')
    expect(hrefForLang('https://x.test/en?a=1#b', 'es')).toBe('https://x.test/?a=1#b')
    expect(hrefForLang('https://x.test/fr', 'ca-ES-valencia')).toBe('https://x.test/ca-es-valencia')
  })
  it('links relatively, with no trailing slash', () => {
    expect(appLink('es')).toBe('./')
    expect(appLink('ar')).toBe('./ar')
  })
  it('round-trips', () => {
    for (const lang of LANGS) expect(startLang(hrefForLang('https://x.test/', lang))).toBe(lang)
  })
})

describe('language redirects (ADR 0038)', () => {
  const scope = 'https://x.test/'
  it('the service worker sends a folder with a slash to the address without it', () => {
    expect(languageRedirect('https://x.test/en/', scope)).toBe('https://x.test/en')
    expect(languageRedirect('https://x.test/en/?a=1', scope)).toBe('https://x.test/en?a=1')
    expect(languageRedirect('https://x.test/es', scope)).toBe('https://x.test/')
    expect(languageRedirect('https://x.test/es/', scope)).toBe('https://x.test/')
    expect(languageRedirect('https://x.test/sub/en/', 'https://x.test/sub/')).toBe('https://x.test/sub/en')
  })
  it('leaves the language addresses, the site address and files alone', () => {
    for (const url of ['https://x.test/', 'https://x.test/en', 'https://x.test/thanks.html', 'https://x.test/assets/a.js', 'https://x.test/en/x/']) {
      expect(languageRedirect(url, scope)).toBeNull()
    }
  })
  it('the host does the same', () => {
    for (const lang of LANGS.filter((l) => l !== 'es')) {
      const seg = lang.toLowerCase()
      expect(redirectFor(`/${seg}/`)).toBe(`/${seg}`)
      expect(languageRedirect(`https://x.test/${seg}/`, scope)).toBe(`https://x.test/${seg}`)
    }
    expect(redirectFor('/es')).toBe('/')
    expect(redirectFor('/es/')).toBe('/')
    expect(redirectFor('/en')).toBeNull()
    expect(redirectsFile()).toMatch(/^(\/\S* \/\S* (301|200)\n)+$/)
  })
})
