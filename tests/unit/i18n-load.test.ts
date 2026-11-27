// SPDX-License-Identifier: AGPL-3.0-or-later
// Languages on demand (src/i18n/index.ts): Spanish until a language's dictionary is loaded.
import { describe, expect, it } from 'vitest'
import { isLoaded, loadLang, t } from '../../src/i18n/index.ts'

describe('loadLang', () => {
  it('has Spanish from the start, and shows Spanish for a language not loaded yet', () => {
    expect(isLoaded('es')).toBe(true)
    expect(isLoaded('eu')).toBe(false)
    expect(t('eu', 'sourceCode')).toBe('Código fuente')
  })
  it('loads a language once', async () => {
    await loadLang('eu')
    expect(isLoaded('eu')).toBe(true)
    expect(t('eu', 'sourceCode')).toBe('Iturburu-kodea')
    await loadLang('eu')
    expect(t('eu', 'sourceCode')).toBe('Iturburu-kodea')
  })
})
