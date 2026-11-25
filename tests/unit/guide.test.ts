// SPDX-License-Identifier: AGPL-3.0-or-later
// Card guide: no claim without a source, every text in every language, links that stay safe.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LANGS } from '../../src/i18n/index.ts'
import { DOCUMENTS, documentOf } from '../../src/zones/documents.ts'
import { GENERAL_RISK, GUIDE, UNSOURCED_WHAT, textOf } from '../../src/guide/entries.ts'
import { SOURCES, type SourceId } from '../../src/guide/sources.ts'
import { appState, entryForField, sourceOrder } from '../../src/guide/view.ts'

const dir = new URL('../../src/guide/locales/', import.meta.url)
const read = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`${lang}.json`, dir), 'utf8')) as Record<string, string>
const es = read('es')
const all = Object.values(GUIDE).flat()

describe('card guide', () => {
  it('covers every supported document', () => {
    expect(Object.keys(GUIDE).sort()).toEqual(DOCUMENTS.map((d) => d.model).sort())
  })

  it('cites a source for what every element is, except the listed unsourced ones', () => {
    const missing = [...new Set(all.filter((e) => e.what.length === 0).map((e) => e.id))]
    expect(missing.sort()).toEqual([...UNSOURCED_WHAT].sort())
  })

  it('cites only known sources, with a pinpoint', () => {
    for (const c of [...GENERAL_RISK, ...all.flatMap((e) => [...e.what, ...e.risk])]) {
      expect(SOURCES[c.src]).toBeDefined()
      expect(c.at.trim()).not.toBe('')
    }
  })

  it('has well-formed sources: https links, checked dates, titles', () => {
    for (const s of Object.values(SOURCES)) {
      expect(new URL(s.url).protocol).toBe('https:')
      expect(s.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(s.title.length).toBeGreaterThan(5)
    }
  })

  it('uses every source it lists', () => {
    const used = new Set<SourceId>([...GENERAL_RISK, ...all.flatMap((e) => [...e.what, ...e.risk])].map((c) => c.src))
    expect(Object.keys(SOURCES).filter((s) => !used.has(s as SourceId))).toEqual([])
  })

  it('has Spanish text for each sourced statement, and none for unsourced ones', () => {
    for (const e of all) {
      const k = textOf(e)
      expect(es[`${k}_title`]?.trim(), `${k}_title`).toBeTruthy()
      if (e.what.length > 0) expect(es[`${k}_what`]?.trim(), `${k}_what`).toBeTruthy()
      else expect(es[`${k}_what`], `${k}_what`).toBe('')
      if (e.risk.length > 0) expect(es[`${k}_risk`]?.trim(), `${k}_risk`).toBeTruthy()
      else expect(es[`${k}_risk`], `${k}_risk has no citation`).toBeUndefined()
    }
  })

  it('has no Spanish text that no entry uses', () => {
    const keys = new Set(all.flatMap((e) => ['_title', '_what', '_risk'].map((s) => textOf(e) + s)))
    const ui = Object.keys(es).filter((k) => !/_(title|what|risk)$/.test(k))
    expect(Object.keys(es).filter((k) => !keys.has(k) && !ui.includes(k))).toEqual([])
  })

  it('has a guide file for every language, with exactly the Spanish keys and placeholders', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    expect(files.sort()).toEqual([...LANGS].sort())
    const holes = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const lang of LANGS) {
      const tr = read(lang)
      expect(Object.keys(tr).sort(), lang).toEqual(Object.keys(es).sort())
      for (const [k, v] of Object.entries(es)) {
        expect(holes(tr[k] ?? ''), `${lang} ${k}`).toEqual(holes(v))
        // Unsourced stays unsourced in every language.
        expect(tr[k] === '', `${lang} ${k}`).toBe(v === '')
      }
    }
  })

  it('numbers sources by first citation, general risks first', () => {
    const order = sourceOrder(GUIDE['dni-4.0'])
    expect(order.slice(0, GENERAL_RISK.length)).toEqual(GENERAL_RISK.map((c) => c.src))
    expect(new Set(order).size).toBe(order.length)
  })

  it('reports what the editor does with each linked field', () => {
    const dni = documentOf('dni-4.0')
    expect(appState(dni, 'can')).toBe('mandatory')
    expect(appState(dni, 'signature')).toBe('hidden')
    expect(appState(dni, 'address')).toBe('visible')
    expect(appState(dni, undefined)).toBe('none')
  })

  it('links every editor field of every document to a guide entry', () => {
    for (const d of DOCUMENTS) {
      for (const z of d.zones) expect(entryForField(GUIDE[d.model], z.id), `${d.model} ${z.id}`).toBeDefined()
    }
  })

  it('links only to fields the document has', () => {
    for (const d of DOCUMENTS) {
      for (const e of GUIDE[d.model]) if (e.field) expect(d.zones.some((z) => z.id === e.field), `${d.model} ${e.id}`).toBe(true)
    }
  })
})
