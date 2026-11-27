// SPDX-License-Identifier: AGPL-3.0-or-later
// The Grafana dashboard of the opt-in usage stats (docs/GRAFANA.md): every query reads the one
// dataset, follows the time range, and names each column as the Worker writes it (dataPoint() in
// src/stats/endpoint.ts). A change to the column order breaks this test, not the dashboard in silence.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIELDS, type UsageStats } from '../../src/stats/schema.ts'
import { dataPoint } from '../../src/stats/endpoint.ts'

interface Target { query: string, format: string, dateTimeColDataType: string, datasource: { type: string, uid: string } }
interface Panel { type: string, title: string, targets?: Target[] }
interface Dashboard { uid: string, panels: Panel[], __inputs: Array<{ name: string, pluginId: string }> }

const dash = JSON.parse(readFileSync('docs/grafana/dnitapado-usage.json', 'utf8')) as Dashboard
const targets = dash.panels.flatMap((p) => (p.targets ?? []).map((t) => ({ panel: p.title, ...t })))

const PLUGIN = 'vertamedia-clickhouse-datasource'
/** Grafana's placeholder for the data source chosen at import. */
const DS_INPUT = '$' + '{DS_ANALYTICS_ENGINE}'
const SAMPLE = {
  doc: 'tie',
  ai: 'right',
  back: true,
  fields: [],
  boxes: 2,
  mark: true,
  grey: false,
  lang: 'es',
  app: '1a2b3c4',
  src: 'camera',
  ocr: true,
  device: 'phone',
  os: 'android',
  browser: 'chrome',
  bv: 131,
  pwa: false,
  moved: [],
} as unknown as UsageStats
const point = dataPoint(SAMPLE, 'ES')

/** Alias in the dashboard → the value of SAMPLE that the Worker writes in that blob. */
const BLOB_ALIAS: Record<string, string> = {
  doc: SAMPLE.doc,
  ai: SAMPLE.ai,
  lang: SAMPLE.lang,
  build: SAMPLE.app,
  src: SAMPLE.src,
  device: SAMPLE.device,
  os: SAMPLE.os,
  browser: SAMPLE.browser,
}

describe('Grafana dashboard', () => {
  it('has panels with queries, all on the import data source', () => {
    expect(dash.uid).toBe('dnitapado-usage')
    expect(dash.__inputs).toEqual([expect.objectContaining({ name: 'DS_ANALYTICS_ENGINE', pluginId: PLUGIN })])
    expect(targets.length).toBeGreaterThan(10)
    for (const t of targets) {
      expect(t.datasource, t.panel).toEqual({ type: PLUGIN, uid: DS_INPUT })
      expect(t.dateTimeColDataType, t.panel).toBe('timestamp')
      expect(['table', 'time_series'], t.panel).toContain(t.format)
    }
  })

  it('reads only dnitapado_usage, within the time range, weighted by the sample interval', () => {
    for (const t of targets) {
      expect(t.query, t.panel).toMatch(/\bFROM dnitapado_usage\b/)
      expect(t.query, t.panel).toMatch(/\bWHERE \$timeFilter\b/)
      expect(t.query, t.panel).not.toMatch(/\bcount\(/i)
      // Every aggregate weighs rows by _sample_interval; only the moved-box list reads single rows.
      if (!t.query.includes('LIMIT 200')) expect(t.query, t.panel).toMatch(/_sample_interval/)
      if (t.format === 'time_series') expect(t.query, t.panel).toMatch(/^SELECT \$timeSeries AS t\b/)
    }
  })

  it('names each text column as the Worker writes it', () => {
    let seen = 0
    for (const t of targets) {
      for (const [, n = '', alias = ''] of t.query.matchAll(/\bblob(\d+) AS (\w+)/g)) {
        const i = Number(n) - 1
        const label = `${t.panel}: blob${n} AS ${alias}`
        if (alias === 'moved') {
          // List version 2 (ADR 0047). Checked against the Worker once it writes that column.
          expect(n).toBe('12')
          if (point.blobs.length >= 12) expect(point.blobs[i]).toBe('')
          continue
        }
        expect(BLOB_ALIAS[alias], label).toBeDefined()
        expect(point.blobs[i], label).toBe(BLOB_ALIAS[alias])
        seen++
      }
    }
    expect(seen).toBeGreaterThanOrEqual(Object.keys(BLOB_ALIAS).length)
    expect(point.blobs[0]).toMatch(/^\d+$/) // blob1: list version, used to skip version 1 rows
    expect(point.blobs[2]).toBe(SAMPLE.ai) // blob3 in the detection rate
  })

  it('names each field column as the Worker writes it', () => {
    const table = targets.find((t) => t.panel.startsWith('Covered fields'))
    expect(table).toBeDefined()
    const pairs = [...(table?.query ?? '').matchAll(/double(\d+)\) \/ SUM\(_sample_interval\) AS (\w+)/g)]
    expect(pairs.map(([, , f]) => f)).toEqual([...FIELDS])
    for (const [, n = '', f = ''] of pairs) {
      const one = dataPoint({ ...SAMPLE, fields: [f] } as unknown as UsageStats, 'ES')
      expect(one.doubles[Number(n) - 1], `double${n} AS ${f}`).toBe(1)
      expect(one.doubles.filter((d, i) => i >= 8 && i < 8 + FIELDS.length && d === 1)).toHaveLength(1)
    }
  })

  it('reads the number columns it names from the positions the Worker writes', () => {
    // double1 back, double2 boxes, double3 watermark, double4 greyscale, double5 OCR ran.
    expect(point.doubles.slice(0, 5)).toEqual([1, SAMPLE.boxes, 1, 0, 1])
    const all = targets.map((t) => t.query).join('\n')
    for (const n of ['1', '2', '3', '4', '5']) expect(all).toContain(`double${n})`)
    // double20, moved boxes (ADR 0047), only on rows of list version 2 and later.
    for (const t of targets.filter((x) => x.query.includes('double20'))) {
      expect(t.query, t.panel).toContain("blob1 NOT IN ('1')")
    }
  })
})
