// SPDX-License-Identifier: AGPL-3.0-or-later
// Plain interface: no fake terminal lines ("$ dt.es export", "→ … · ok") and no fake window chrome
// (title bars with traffic-light dots, file names such as "front.jpg"). Users read them as commands
// to type or as a desktop program, which misleads them about how the app works.
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import es from '../../src/i18n/locales/es.json'
import en from '../../src/i18n/locales/en.json'

const dir = new URL('../../src/components/', import.meta.url)
const components = readdirSync(dir).filter((f) => f.endsWith('.svelte'))
const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8')

describe('plain interface', () => {
  it.each(components)('%s has no terminal lines or window chrome', (file) => {
    const src = readFileSync(new URL(file, dir), 'utf8')
    expect(src).not.toMatch(/class="(?:[^"]*\s)?(?:winbar|winbody|term|dialog-win)(?:\s[^"]*)?"/)
    expect(src).not.toMatch(/<i><\/i><i><\/i><i><\/i>/)
    expect(src).not.toMatch(/\$<\/span>|dt\.es (--|export)/)
    expect(src).not.toMatch(/\.(jpg|log|preview|prompt|guide)<\/span>/)
    expect(src).not.toMatch(/ · ok\b/)
  })
  it('styles.css defines no window or terminal pieces', () => {
    expect(css).not.toMatch(/\.(?:winbar|winbody|term|dialog-win)[\s{,.>:]/)
  })
  it.each([['es', es], ['en', en]] as const)('%s text has no command-line styling', (_lang, dict) => {
    for (const value of Object.values(dict)) {
      expect(value).not.toMatch(/^\$ |^→|\bdt\.es --/)
    }
  })
})
