// SPDX-License-Identifier: AGPL-3.0-or-later
// Size budget for the production build in dist/. Run after `pnpm build`: `pnpm size`.
// Sizes are gzip (what a browser downloads from GitHub Pages), except the whole-folder total.
// Over budget: a warning by default; `pnpm size --strict` fails instead. CI job `bundle-size` writes
// the table to the job summary.
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

interface Budget {
  /** Label in the report. */
  name: string
  /** Files in dist/ (path relative to dist/, with forward slashes) that count towards this budget. */
  match: RegExp
  /** Limit in kB (1 kB = 1000 bytes). */
  limitKb: number
  /** gzip: compressed size; raw: size on disk. */
  measure: 'gzip' | 'raw'
}

// Current sizes plus about 10 % headroom (2026-11-25). Raise a limit only on purpose, in the same PR
// that makes the bundle bigger, and say why.
const BUDGETS: readonly Budget[] = [
  { name: 'Start page JavaScript', match: /^assets\/index-[\w-]+\.js$/, limitKb: 100, measure: 'gzip' },
  // CSS: 12 kB since Tailwind CSS (ADR 0017): its base reset and the utility classes, about 10.3 kB.
  { name: 'Start page CSS', match: /^assets\/index-[\w-]+\.css$/, limitKb: 12, measure: 'gzip' },
  { name: 'PDF export chunk', match: /^assets\/export-[\w-]+\.js$/, limitKb: 275, measure: 'gzip' },
  { name: 'Corner model (on demand)', match: /^assets\/ml\/.+\.js$/, limitKb: 2850, measure: 'gzip' },
  { name: 'OCR worker and data (on demand)', match: /^ocr\//, limitKb: 7300, measure: 'gzip' },
  { name: 'Whole dist/ folder', match: /^(?!.*\.map$)/, limitKb: 23500, measure: 'raw' },
]

const DIST = 'dist'
const strict = process.argv.includes('--strict')

function files (dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    return e.isDirectory() ? files(path) : [path]
  })
}

const all = files(DIST).map((path) => ({ path, rel: relative(DIST, path).split('\\').join('/') }))
const kb = (bytes: number): string => (bytes / 1000).toFixed(1)

let over = 0
const rows: string[] = []
for (const b of BUDGETS) {
  const matched = all.filter((f) => b.match.test(f.rel))
  const bytes = matched.reduce((sum, f) => sum + (b.measure === 'gzip' ? gzipSync(readFileSync(f.path)).length : statSync(f.path).size), 0)
  const ok = matched.length > 0 && bytes <= b.limitKb * 1000
  if (!ok) over++
  const status = matched.length === 0 ? 'no files' : ok ? 'ok' : 'over budget'
  rows.push(`| ${b.name} | ${String(matched.length)} | ${kb(bytes)} kB ${b.measure} | ${String(b.limitKb)} kB | ${String(Math.round((bytes / (b.limitKb * 1000)) * 100))} % | ${status} |`)
  if (!ok) {
    const level = strict ? 'error' : 'warning'
    console.log(`::${level} title=Bundle size::${b.name}: ${status} (${kb(bytes)} kB ${b.measure}, limit ${String(b.limitKb)} kB)`)
  }
}

const table = [
  '### Bundle size',
  '',
  '| Budget | Files | Size | Limit | Used | Status |',
  '|---|---:|---:|---:|---:|---|',
  ...rows,
  '',
].join('\n')
console.log(table)
if (process.env['GITHUB_STEP_SUMMARY'] !== undefined) appendFileSync(process.env['GITHUB_STEP_SUMMARY'], table + '\n')

if (over > 0 && strict) process.exit(1)
