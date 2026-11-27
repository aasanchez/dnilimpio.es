// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared e2e steps: load the synthetic fixtures and snap the corners onto the card.
import { expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { checkDigit } from '../../src/ocr/mrz.ts'

export const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

// Card corners in the 1600 × 1200 synthetic fixtures.
export const CARD = [{ x: 200, y: 222 }, { x: 1400, y: 222 }, { x: 1400, y: 978 }, { x: 200, y: 978 }]
/** Straightened size per document (src/zones/documents.ts). */
export const DOC_PX = { 'dni-4.0': { w: 1712, h: 1080 }, 'dni-3.0': { w: 1712, h: 1080 }, tie: { w: 1712, h: 1080 } } as const
export type Doc = keyof typeof DOC_PX

/** Start quad from defaultQuad(1600, 1200, aspect): 70 % of the width, the document's aspect, centred. */
export function startQuad (doc: Doc = 'dni-4.0'): Array<{ x: number; y: number }> {
  const W = 1120
  const H = W / (DOC_PX[doc].w / DOC_PX[doc].h)
  return [{ x: 240, y: 600 - H / 2 }, { x: 1360, y: 600 - H / 2 }, { x: 1360, y: 600 + H / 2 }, { x: 240, y: 600 + H / 2 }]
}
export const START = startQuad()

/** From the start screen to the photo step. */
export async function openCapture (page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('#start').click()
}

/** Makes the corner model unavailable, as when offline before its first use. */
export async function blockModel (page: Page): Promise<void> {
  await page.route('**/assets/ml/**', (route) => route.abort('internetdisconnected'))
}

/**
 * Opens the app and loads both fixtures. The corner model is blocked unless `model` is true: most
 * tests check the manual flow, and the model's 2.5 MB would only slow them down.
 */
export async function loadBoth (page: Page, { model = false } = {}): Promise<void> {
  if (!model) await blockModel(page)
  await openCapture(page)
  // Continue appears once both sides are loaded.
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toHaveCount(0)
  await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
  await expect(page.locator('#capture-continue')).toBeEnabled()
}

/** The picker option of a layout: both DNI versions are one "DNI" option. */
export const choiceOf = (doc: Doc): 'dni' | 'tie' => (doc === 'tie' ? 'tie' : 'dni')

/**
 * From the photo step through the document picker; the photos are then straightened automatically.
 * The picker has one DNI option: the DNI 3.0 is set afterwards with the editor's "Older DNI" switch.
 */
export async function chooseDoc (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await page.locator('#capture-continue').click()
  await expect(page.locator('h2')).toHaveText(/documento|document/)
  await page.locator(`#doc-${choiceOf(doc)}`).check()
  await page.locator('#doc-continue').click()
}

/** In the editor: sets the DNI layout with the "Older DNI (3.0)" switch. */
export async function setDniVersion (page: Page, doc: 'dni-4.0' | 'dni-3.0'): Promise<void> {
  const older = page.locator('#dni-older')
  await older.setChecked(doc === 'dni-3.0')
  await expect(page.locator('#dni-older')).toBeChecked({ checked: doc === 'dni-3.0' })
}

/**
 * Loads both fixtures and confirms the document. Both cards are then found and straightened
 * automatically (edge detection; the model is blocked unless `model` is true), ending in the editor.
 */
export async function toAuto (page: Page, doc: Doc = 'dni-4.0', opts: { model?: boolean } = {}): Promise<void> {
  await loadBoth(page, opts)
  await chooseDoc(page, doc)
  await expect(page.locator('#preview')).toHaveJSProperty('width', DOC_PX[doc].w)
  if (doc !== 'tie') await setDniVersion(page, doc)
}

/** Waits for the editor (straightening can take a while with the model), then opens the front's corners. */
export async function adjustFront (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await expect(page.locator('#preview')).toHaveJSProperty('width', DOC_PX[doc].w, { timeout: 30_000 })
  await page.locator('#tab-front').click()
  await page.locator('#adjust-front').click()
  await expect(page.locator('canvas.corner-editor')).toBeVisible()
}

/** Like toAuto, then opens the corners of the front with "Adjust corners". */
export async function toAlign (page: Page, doc: Doc = 'dni-4.0', opts: { model?: boolean } = {}): Promise<void> {
  await toAuto(page, doc, opts)
  await adjustFront(page, doc)
}

/**
 * The corner editor's box once its layout has settled: the same box on two reads one animation
 * frame apart. A box read during a late layout change (scroll, resize) makes a drag miss its handle.
 */
export async function editorBox (page: Page): Promise<{ x: number; y: number; k: number }> {
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
  let last = ''
  await expect.poll(async () => {
    const box = await canvas.evaluate(async (c) => {
      await new Promise(requestAnimationFrame)
      const r = c.getBoundingClientRect()
      return `${String(r.x)},${String(r.y)},${String(r.width)}`
    })
    const stable = box === last
    last = box
    return stable
  }).toBe(true)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas box')
  return { x: box.x, y: box.y, k: box.width / 1600 }
}

/**
 * Drags a corner handle with the mouse, in 1600 × 1200 photo coordinates. Waits until the pointer is
 * over a handle before pressing, so a drag that would miss fails here, with a clear message.
 */
export async function dragCorner (page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const { x, y, k } = await editorBox(page)
  await page.mouse.move(x + from.x * k, y + from.y * k)
  await expect(page.locator('canvas.corner-editor'), 'pointer over a corner handle').toHaveClass(/is-over-handle/)
  await page.mouse.down()
  await page.mouse.move(x + to.x * k, y + to.y * k, { steps: 5 })
  await page.mouse.up()
}

/**
 * Drags each corner handle from the start quad onto the card corners with the mouse. Reset first
 * puts the corners at the start quad even if a detector already moved them.
 */
export async function snapCorners (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  const start = startQuad(doc)
  const canvas = page.locator('canvas.corner-editor')
  await expect(canvas).toBeVisible()
  await page.locator('#align-restart').click()
  for (let i = 0; i < 4; i++) await dragCorner(page, start[i]!, CARD[i]!)
}

/** RGB of one pixel of a canvas. */
export async function pixel (page: Page, id: string, x: number, y: number): Promise<number[]> {
  return await page.locator(id).evaluate((c, [px, py]) => {
    const d = (c as HTMLCanvasElement).getContext('2d')?.getImageData(px ?? 0, py ?? 0, 1, 1).data
    return d ? [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] : []
  }, [x, y])
}

/** Loads both fixtures, confirms the document and lets the app straighten both sides: ends in the editor. */
export async function toEditor (page: Page, doc: Doc = 'dni-4.0'): Promise<void> {
  await toAuto(page, doc)
}

/** A valid TD1 MRZ for a fictional DNI. */
export function mrz (): string[] {
  const number = 'BAA000589'
  const l1 = `IDESP${number}${String(checkDigit(number))}99999999R<<<<<<`
  const l2a = `800101${String(checkDigit('800101'))}F310101${String(checkDigit('310101'))}ESP<<<<<<<<<<<`
  const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
  return [l1, l2a + String(checkDigit(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<']
}

/** Draws a 1600 × 1200 photo of a card with printed text, at the same corners as the other fixtures. */
export async function cardPhoto (page: Page, lines: ReadonlyArray<readonly [string, number, number, string]>): Promise<Buffer> {
  const b64 = await page.evaluate(async ([card, text]) => {
    const c = new OffscreenCanvas(1600, 1200)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    ctx.fillStyle = '#282830'
    ctx.fillRect(0, 0, 1600, 1200)
    ctx.fillStyle = '#f4f4f0'
    ctx.fillRect(card[0]?.x ?? 0, card[0]?.y ?? 0, 1200, 756)
    ctx.fillStyle = '#111'
    for (const [s, x, y, font] of text) {
      ctx.font = font
      ctx.fillText(s, x, y)
    }
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }, [CARD, lines] as const)
  return Buffer.from(b64, 'base64')
}

export const SANS = 'bold 40px sans-serif'
export const MONO = '40px monospace'

/**
 * Loads two synthetic cards with printed text (a fictional DNI) and goes to the editor. The corner
 * model is blocked unless `model` is true (edge detection finds these cards). `frontLines` replaces
 * the text of the front. `names` are the file names the photos are loaded with.
 */
export async function toEditorWithText (page: Page, { model = false, frontLines, names = ['front.png', 'back.png'] }: { model?: boolean; frontLines?: ReadonlyArray<readonly [string, number, number, string]>; names?: readonly [string, string] } = {}): Promise<void> {
  const front = await cardPhoto(page, frontLines ?? [
    ['DNI 99999999R', 640, 300, SANS],
    ['APELLIDOS', 640, 380, SANS],
    ['ESPANOLA', 640, 430, SANS],
    ['NOMBRE', 640, 510, SANS],
    ['CARMEN', 640, 560, SANS],
    ['EMISION 02 06 2021', 640, 660, SANS],
    ['NUM SOPORTE CAA000000', 640, 760, SANS],
    ['987654', 1180, 930, SANS],
  ])
  const back = await cardPhoto(page, [
    ['DOMICILIO', 500, 320, SANS],
    ['CALLE MAYOR 1', 500, 370, SANS],
    ...mrz().map((l, i) => [l, 230, 800 + i * 60, MONO] as const),
  ])
  if (!model) await blockModel(page)
  await openCapture(page)
  await page.locator('#file-front').setInputFiles({ name: names[0], mimeType: 'image/png', buffer: front })
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await page.locator('#file-back').setInputFiles({ name: names[1], mimeType: 'image/png', buffer: back })
  await page.locator('#capture-continue').click()
  await page.locator('#doc-dni').check()
  await page.locator('#doc-continue').click()
  // Found and straightened by themselves (edge detection; the model is not needed here).
  await expect(page.locator('#preview')).toHaveJSProperty('width', 1712)
}

/** Opens the app and waits until the service worker controls it. */
export async function controlled (page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(async () => await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

/**
 * Puts the app in a frame of `page` and waits until the frame has loaded: an error page when the
 * host refuses it, or at most 5 s, because Firefox fires no load event then. Returns how many of the
 * app's elements (its heading, or the #app root of its own frame guard) the frame holds. Works in
 * every browser: Chromium shows chrome-error:, WebKit an empty document, and Firefox gives no access
 * to the refused frame at all (counted as 0).
 */
export async function appElementsInFrame (page: Page, url: string): Promise<number> {
  await page.setContent('<iframe width="800" height="600"></iframe>')
  await page.locator('iframe').evaluate(async (frame, src) => {
    await new Promise<void>((resolve) => {
      frame.addEventListener('load', () => { resolve() }, { once: true })
      // Firefox fires no load event for a frame that frame-ancestors refused.
      setTimeout(resolve, 5000)
      frame.setAttribute('src', src)
    })
  }, url)
  // Had the app run, its module scripts would have rendered before the frame's load event.
  const child = page.frames().find((f) => f !== page.mainFrame())
  // Firefox leaves a refused frame without an address, and evaluating in it never returns.
  if (!child || !/^https?:/.test(child.url())) return 0
  return await child.evaluate(() => document.querySelectorAll('h1, #app').length).catch(() => 0)
}
