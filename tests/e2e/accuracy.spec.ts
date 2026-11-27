// SPDX-License-Identifier: AGPL-3.0-or-later
// Accuracy floor for the on-device AI: corner finding (DocCornerNet, then edge snapping) and document
// type detection (PP-OCRv6: MRZ, then the printed front). The photos are fictional cards drawn by
// scripts/make-fixtures.ts under seven conditions (plain, rotated, small, tilted, dim, blurred, and
// "hard": all of them at once), with
// the true corners and document in tests/fixtures/accuracy/expected.json. The whole app runs, as a
// person uses it: photos in, picker preselection and corner editor out.
//
// A floor, not an exact result: a model or pipeline change may move single photos, but the share
// that comes out right must not drop below the numbers here. If a change raises the results, raise
// the floor in the same pull request.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { fixture, openCapture } from './helpers.ts'

test.use({ locale: 'es-ES', serviceWorkers: 'allow' })

type Doc = 'dni-4.0' | 'dni-3.0' | 'tie'
interface Point { x: number; y: number }
interface Photo { file: string; doc: Doc; side: 'front' | 'back'; condition: string; corners: Point[] }
const SET = JSON.parse(readFileSync(fixture('accuracy/expected.json'), 'utf8')) as { photos: Photo[] }

/** A corner is right when it is within this share of the card's width of the true corner. */
const CORNER_TOLERANCE = 0.02
/** Per document (14 photos): at least this many with all four corners right. Measured: 13 (the "hard" back fails). */
const MIN_CORNERS_RIGHT = 12
/** Median corner error over the photos of one document, as a share of the card's width. Measured: about 0.16 %. */
const MAX_MEDIAN_CORNER_ERROR = 0.005
/** Per document (7 photo pairs): at least this many detected as exactly the right document. Measured: 6 (not "hard"). */
const MIN_DOCS_RIGHT = 6
/** Per document: a wrong guess (TIE for a DNI, the wrong DNI version) misleads, so none is allowed. */
const MAX_DOCS_WRONG = 0

/** What the picker says it detected, as a document id; 'dni' when the version is open, 'none' when nothing. */
function detected (status: string): Doc | 'dni' | 'none' | 'other' {
  if (status.startsWith('Documento detectado: DNI 4.0.')) return 'dni-4.0'
  if (status.startsWith('Documento detectado: DNI 3.0.')) return 'dni-3.0'
  if (status.startsWith('Documento detectado: TIE')) return 'tie'
  if (status.startsWith('Documento detectado: DNI.')) return 'dni'
  if (status.startsWith('No se ha podido reconocer')) return 'none'
  return 'other'
}

/** Largest corner error over the four corners, as a share of the card's width. Labels may start at any corner. */
function cornerError (found: Point[], truth: Point[]): number {
  const width = Math.hypot(truth[1]!.x - truth[0]!.x, truth[1]!.y - truth[0]!.y)
  let best = Infinity
  for (let shift = 0; shift < 4; shift++) {
    const worst = Math.max(...truth.map((t, i) => { const f = found[(i + shift) % 4]; return f ? Math.hypot(f.x - t.x, f.y - t.y) : Infinity }))
    best = Math.min(best, worst)
  }
  return best / width
}

async function editorCorners (page: Page): Promise<{ corners: Point[]; source: string }> {
  const attr = (await page.locator('[data-corners]').getAttribute('data-corners')) ?? ''
  const source = (await page.locator('[data-source]').getAttribute('data-source')) ?? ''
  return { corners: attr.split(' ').filter(Boolean).map((p) => { const [x = 0, y = 0] = p.split(',').map(Number); return { x, y } }), source }
}

for (const doc of ['dni-4.0', 'dni-3.0', 'tie'] as const) {
  test(`accuracy floor: ${doc}`, async ({ page }) => {
    test.setTimeout(420_000)
    // Controlled by the service worker, so the OCR files download once and stay for the next pairs.
    await page.goto('/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    const pairs = new Map<string, { front: Photo; back: Photo }>()
    for (const p of SET.photos.filter((q) => q.doc === doc)) {
      const pair = pairs.get(p.condition) ?? ({} as { front: Photo; back: Photo })
      pair[p.side] = p
      pairs.set(p.condition, pair)
    }

    const rows: string[] = []
    let docsRight = 0
    let docsWrong = 0
    let cornersRight = 0
    const errors: number[] = []
    for (const [condition, { front, back }] of pairs) {
      await openCapture(page)
      await page.locator('#file-front').setInputFiles(fixture(`accuracy/${front.file}`))
      await page.locator('#file-back').setInputFiles(fixture(`accuracy/${back.file}`))
      await page.locator('#capture-continue').click()
      const status = page.locator('#detect-status')
      await expect(status).toHaveText(/^(Documento detectado|No se ha podido reconocer)/, { timeout: 120_000 })
      const guess = detected((await status.textContent()) ?? '')
      if (guess === doc) docsRight++
      else if (guess !== 'none' && !(guess === 'dni' && doc !== 'tie')) docsWrong++

      // Confirm the right document, then read the corners the app placed on each side.
      await page.locator(`#doc-${doc === 'tie' ? 'tie' : 'dni'}`).check()
      await page.locator('#doc-continue').click()
      const sides: Array<{ side: 'front' | 'back'; err: number; source: string }> = []
      const editor = page.locator('#preview')
      const align = page.locator('canvas.corner-editor')
      await expect(editor.or(align)).toBeVisible({ timeout: 60_000 })
      if (await editor.isVisible()) {
        await page.locator('#tab-front').click()
        await page.locator('#adjust-front').click()
      }
      for (const photo of [front, back]) {
        await page.locator(`#align-tab-${photo.side}`).click()
        const { corners, source } = await editorCorners(page)
        const err = source === '' ? Infinity : cornerError(corners, photo.corners)
        if (err <= CORNER_TOLERANCE) cornersRight++
        errors.push(err)
        sides.push({ side: photo.side, err, source: source || 'none' })
      }
      rows.push(`${condition.padEnd(8)} detected ${guess.padEnd(8)} ${sides.map((s) => `${s.side} ${(s.err * 100).toFixed(2)}% (${s.source})`).join('  ')}`)
    }

    const median = [...errors].sort((a, b) => a - b)[Math.floor(errors.length / 2)] ?? Infinity
    const report = [
      `${doc}: documents right ${String(docsRight)}/${String(pairs.size)}, wrong ${String(docsWrong)}; ` +
      `corners right ${String(cornersRight)}/${String(errors.length)} (within ${String(CORNER_TOLERANCE * 100)} % of the card width), median error ${(median * 100).toFixed(2)} %`,
      ...rows,
    ].join('\n')
    console.log(report)
    await test.info().attach(`accuracy-${doc}.txt`, { body: report, contentType: 'text/plain' })
    expect(docsWrong, report).toBeLessThanOrEqual(MAX_DOCS_WRONG)
    expect(docsRight, report).toBeGreaterThanOrEqual(MIN_DOCS_RIGHT)
    expect(cornersRight, report).toBeGreaterThanOrEqual(MIN_CORNERS_RIGHT)
    expect(median, report).toBeLessThanOrEqual(MAX_MEDIAN_CORNER_ERROR)
  })
}
