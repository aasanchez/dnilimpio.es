// SPDX-License-Identifier: AGPL-3.0-or-later
// Generates synthetic "photo of a card" PNGs for tests. No real DNI data is ever used (spec §6).
// Run: node scripts/make-fixtures.ts  (Node ≥ 22.18 strips types natively). The accuracy set at the
// end also needs the Playwright browser; PW_CHROMIUM=<path> picks another Chromium binary.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homography, type Quad } from '../src/geometry/homography.ts'

const W = 1600; const H = 1200

function crc32 (buf: Uint8Array): number {
  let c = ~0
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) }
  return ~c >>> 0
}

function chunk (type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function png (pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    for (let x = 0; x < W; x++) raw.set(pixel(x, y), y * (W * 3 + 1) + 1 + x * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array()),
  ])
}

// Card occupies an axis-aligned ID-1 rectangle on a dark "table"; coloured blocks stand in for fields.
const card = { x: 200, y: 222, w: 1200, h: Math.round(1200 * 53.98 / 85.6) }
function inRect (x: number, y: number, r: [number, number, number, number]): boolean {
  return x >= card.x + r[0] * card.w && x < card.x + (r[0] + r[2]) * card.w && y >= card.y + r[1] * card.h && y < card.y + (r[1] + r[3]) * card.h
}
function side (blocks: [number, number, number, number][]) {
  return (x: number, y: number): [number, number, number] => {
    if (!inRect(x, y, [0, 0, 1, 1])) return [40, 40, 48]
    if (blocks.some((b) => inRect(x, y, b))) return [30, 60, 140]
    return [225, 232, 240]
  }
}

writeFileSync('tests/fixtures/synthetic-front.png', png(side([[0.04, 0.2, 0.28, 0.6], [0.36, 0.2, 0.5, 0.06], [0.36, 0.32, 0.4, 0.06], [0.36, 0.7, 0.3, 0.06]])))
writeFileSync('tests/fixtures/synthetic-back.png', png(side([[0.04, 0.68, 0.92, 0.08], [0.04, 0.78, 0.92, 0.08], [0.04, 0.88, 0.92, 0.08]])))

// ---------------------------------------------------------------------------------------------
// Accuracy set (tests/e2e/accuracy.spec.ts): photos of fictional cards under different conditions,
// with the true card corners and document type. Chromium draws the text (no canvas in Node), so
// this part needs the Playwright browser: `pnpm exec playwright install chromium` once.
// The data is invented and the layout is a simplified drawing, not a copy of a real document.

const PHOTO = { w: 1280, h: 960 } as const
const CARD_SIZE = { w: 1712, h: 1080 } as const

type AccDoc = 'dni-4.0' | 'dni-3.0' | 'tie'
type AccSide = 'front' | 'back'

/** One photo condition, applied to both sides of a card (each side with its own noise). */
interface Condition {
  readonly id: string
  /** Card width as a share of the photo width. */
  readonly size: number
  /** Card centre as a share of the photo size. */
  readonly at: readonly [number, number]
  /** Rotation in degrees, clockwise. */
  readonly turn: number
  /** Perspective: the top edge is this much shorter than the bottom edge (camera tilted). */
  readonly tilt: number
  /** Overall brightness gain, and how much darker the darkest corner is (uneven light). */
  readonly light: number
  readonly shade: number
  /** Gaussian blur radius in photo pixels (focus or motion). */
  readonly blur: number
  /** Sensor noise amplitude (0 to 255). */
  readonly noise: number
  /** Background: 'wood', 'cloth' or 'paper' (light, low contrast with the card). */
  readonly table: 'wood' | 'cloth' | 'paper'
}

export const CONDITIONS: readonly Condition[] = [
  { id: 'plain', size: 0.78, at: [0.5, 0.5], turn: 0, tilt: 0, light: 1, shade: 0.1, blur: 0, noise: 6, table: 'wood' },
  { id: 'rotated', size: 0.7, at: [0.5, 0.52], turn: -14, tilt: 0, light: 1, shade: 0.15, blur: 0, noise: 6, table: 'cloth' },
  { id: 'small', size: 0.48, at: [0.44, 0.56], turn: 6, tilt: 0, light: 1, shade: 0.1, blur: 0, noise: 6, table: 'wood' },
  { id: 'tilted', size: 0.8, at: [0.5, 0.5], turn: 3, tilt: 0.14, light: 1, shade: 0.2, blur: 0.6, noise: 6, table: 'cloth' },
  { id: 'dim', size: 0.74, at: [0.52, 0.48], turn: -4, tilt: 0.05, light: 0.62, shade: 0.35, blur: 0, noise: 12, table: 'wood' },
  { id: 'blurred', size: 0.76, at: [0.5, 0.5], turn: 2, tilt: 0.04, light: 0.95, shade: 0.15, blur: 2.2, noise: 8, table: 'paper' },
  // Everything at once: turned, tilted, dim, out of focus, noisy, on a light background.
  { id: 'hard', size: 0.62, at: [0.5, 0.5], turn: 22, tilt: 0.18, light: 0.7, shade: 0.4, blur: 3, noise: 16, table: 'paper' },
]

export const ACC_DOCS: readonly AccDoc[] = ['dni-4.0', 'dni-3.0', 'tie']

/** The card's corners in the photo (top-left, top-right, bottom-right, bottom-left of the card). */
export function cardCorners (c: Condition): Quad {
  const w = c.size * PHOTO.w
  const h = w * CARD_SIZE.h / CARD_SIZE.w
  const top = 1 - c.tilt
  // Tilted away from the camera: the top edge is shorter and a little lower (foreshortened).
  const local = [
    { x: -w / 2 * top, y: -h / 2 * (1 - c.tilt / 2) }, { x: w / 2 * top, y: -h / 2 * (1 - c.tilt / 2) },
    { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
  ]
  const a = c.turn * Math.PI / 180
  const [cx, cy] = [c.at[0] * PHOTO.w, c.at[1] * PHOTO.h]
  return local.map((p) => ({ x: cx + p.x * Math.cos(a) - p.y * Math.sin(a), y: cy + p.x * Math.sin(a) + p.y * Math.cos(a) })) as unknown as Quad
}

/** Check digit of an MRZ field (ICAO Doc 9303 part 3, 4.9). */
function check (s: string): number {
  const v = (ch: string): number => (ch === '<' ? 0 : /[0-9]/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55)
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += v(s[i] ?? '<') * ([7, 3, 1][i % 3] ?? 0)
  return sum % 10
}

/** A valid TD1 MRZ with fictional data. The dates set the DNI version (src/detect/doc-type.ts). */
function mrzLines (doc: AccDoc): string[] {
  const code = doc === 'tie' ? 'IR' : 'ID'
  const number = doc === 'tie' ? 'E00000000' : 'BAA000589'
  // DNI 4.0: issued 2023 (birth 1980, valid 10 years). DNI 3.0: issued 2017. TIE: any dates.
  const [birth, expiry] = doc === 'dni-4.0' ? ['800101', '330101'] : doc === 'dni-3.0' ? ['800101', '270615'] : ['900101', '290101']
  const optional = doc === 'tie' ? 'X0000000T<<<<<' : '99999999R<<<<<'
  const l1 = (code + 'ESP' + number + String(check(number)) + optional).padEnd(30, '<').slice(0, 30)
  const l2a = `${birth}${String(check(birth))}F${expiry}${String(check(expiry))}ESP<<<<<<<<<<<`
  const composite = l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29)
  return [l1, l2a + String(check(composite)), 'ESPANOLA<ESPANOLA<<CARMEN<<<<']
}

/** Text drawn on each face: [text, x, y, size in card pixels, bold]. Fictional values only. */
function faceText (doc: AccDoc, side: AccSide): Array<[string, number, number, number, boolean]> {
  if (side === 'back') {
    const head: Array<[string, number, number, number, boolean]> = doc === 'tie'
      ? [['LUGAR DE NACIMIENTO', 90, 120, 26, false], ['MADRID', 90, 160, 32, true], ['DOMICILIO', 90, 230, 26, false], ['C. FICTICIA 1', 90, 270, 32, true]]
      : [['DOMICILIO', 90, 120, 26, false], ['C. FICTICIA 1', 90, 160, 32, true], ['LUGAR DE NACIMIENTO', 90, 230, 26, false], ['MADRID', 90, 270, 32, true]]
    return [...head, ...mrzLines(doc).map((l, i): [string, number, number, number, boolean] => [l, 110, 790 + i * 92, 66, false])]
  }
  if (doc === 'tie') {
    return [
      ['ESPAÑA', 90, 110, 40, true], ['PERMISO DE RESIDENCIA', 560, 110, 52, true],
      ['APELLIDOS', 560, 260, 26, false], ['ESPAÑOLA ESPAÑOLA', 560, 300, 36, true],
      ['NOMBRE', 560, 370, 26, false], ['CARMEN', 560, 410, 36, true],
      ['TIPO DE PERMISO / TYPE OF PERMIT', 560, 560, 28, false], ['RESIDENCIA TEMPORAL', 560, 600, 34, true],
      ['N.I.E.', 560, 680, 26, false], ['X0000000T', 560, 720, 36, true],
      ['RESIDENCE PERMIT / TITRE DE SEJOUR', 560, 960, 32, true],
    ]
  }
  if (doc === 'dni-4.0') {
    return [
      ['REINO DE ESPAÑA', 560, 100, 56, true], ['DOCUMENTO NACIONAL DE IDENTIDAD', 560, 150, 30, false],
      ['DNI 99999999R', 90, 240, 40, true],
      ['APELLIDOS', 560, 300, 26, false], ['ESPAÑOLA ESPAÑOLA', 560, 340, 36, true],
      ['NOMBRE', 560, 410, 26, false], ['CARMEN', 560, 450, 36, true],
      ['EMISIÓN', 560, 620, 26, false], ['01 01 2023', 560, 660, 34, true],
      ['NUM SOPORTE', 960, 620, 26, false], ['BAA000589', 960, 660, 34, true],
      ['NATIONAL IDENTITY CARD / DOCUMENTO NACIONAL IDENTIDAD', 90, 1000, 30, false],
    ]
  }
  return [
    ['ESPAÑA', 560, 100, 56, true], ['DOCUMENTO NACIONAL DE IDENTIDAD', 560, 150, 34, true],
    ['PRIMER APELLIDO', 560, 280, 26, false], ['ESPAÑOLA', 560, 320, 36, true],
    ['NOMBRE', 560, 470, 26, false], ['CARMEN', 560, 510, 36, true],
    ['NUM SOPORT', 560, 700, 26, false], ['BAA000589', 560, 740, 34, true],
    ['99999999R', 90, 960, 48, true],
  ]
}

/** Deterministic seed per photo. */
function seedOf (s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

export interface AccPhoto {
  readonly file: string
  readonly doc: AccDoc
  readonly side: AccSide
  readonly condition: string
  /** True card corners in photo pixels: top-left, top-right, bottom-right, bottom-left. */
  readonly corners: Quad
}

/** Draws one photo in the browser and returns it as JPEG bytes. */
async function drawPhoto (page: import('@playwright/test').Page, doc: AccDoc, side: AccSide, c: Condition): Promise<Buffer> {
  const toCard = homography(cardCorners(c), [{ x: 0, y: 0 }, { x: CARD_SIZE.w, y: 0 }, { x: CARD_SIZE.w, y: CARD_SIZE.h }, { x: 0, y: CARD_SIZE.h }])
  if (!toCard) throw new Error(`degenerate card for ${c.id}`)
  const args = { doc, side, c, toCard, text: faceText(doc, side), photo: PHOTO, card: CARD_SIZE, seed: seedOf(`${doc}/${side}/${c.id}`) }
  const b64 = await page.evaluate((a) => {
    let s = a.seed >>> 0
    const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
    const ctx2 = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const x = cv.getContext('2d', { willReadFrequently: true })
      if (!x) throw new Error('no 2d')
      return [cv, x]
    }

    // 1. The card face, flat, 1712 × 1080, with rounded ID-1 corners (3.18 mm ≈ 64 px).
    const [face, f] = ctx2(a.card.w, a.card.h)
    const tint = a.doc === 'tie' ? ['#e9eef6', '#cfdcef'] : a.doc === 'dni-4.0' ? ['#f2ece6', '#e6d3cf'] : ['#eef1ea', '#d7e1d0']
    const g = f.createLinearGradient(0, 0, a.card.w, a.card.h)
    g.addColorStop(0, tint[0] ?? '#fff')
    g.addColorStop(1, tint[1] ?? '#fff')
    f.fillStyle = g
    f.beginPath()
    f.roundRect(0, 0, a.card.w, a.card.h, 64)
    f.fill()
    // A fine guilloche-like pattern, so the card is not flat.
    f.strokeStyle = 'rgba(120, 110, 150, 0.18)'
    f.lineWidth = 2
    for (let k = 0; k < 18; k++) {
      f.beginPath()
      for (let x = 0; x <= a.card.w; x += 16) {
        const y = 120 + k * 50 + Math.sin(x / 90 + k) * 22
        if (x === 0) f.moveTo(x, y)
        else f.lineTo(x, y)
      }
      f.stroke()
    }
    if (a.side === 'front') {
      // Photo area and a small "chip" block.
      f.fillStyle = '#8a8f99'
      f.fillRect(90, 300, 400, 520)
      f.fillStyle = '#b8bcc4'
      f.beginPath()
      f.ellipse(290, 500, 110, 140, 0, 0, Math.PI * 2)
      f.fill()
    } else {
      f.fillStyle = '#c9a24a'
      f.fillRect(1380, 120, 210, 160)
      f.fillStyle = 'rgba(255, 255, 255, 0.85)'
      f.fillRect(60, 710, a.card.w - 120, 330)
    }
    f.fillStyle = '#16181d'
    f.textBaseline = 'alphabetic'
    for (const [t, x, y, size, bold] of a.text) {
      const mono = a.side === 'back' && size >= 60
      f.font = `${bold ? 'bold ' : ''}${String(size)}px ${mono ? 'monospace' : 'sans-serif'}`
      f.fillText(t, x, y)
    }
    const fd = f.getImageData(0, 0, a.card.w, a.card.h).data

    // 2. The table under the card.
    const W = a.photo.w
    const H = a.photo.h
    const [photo, p] = ctx2(W, H)
    const img = p.createImageData(W, H)
    const d = img.data
    const base = a.c.table === 'wood' ? [118, 82, 52] : a.c.table === 'cloth' ? [52, 64, 82] : [214, 210, 200]
    const phase = rnd() * 10
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        const grain = a.c.table === 'wood' ? Math.sin((y + Math.sin(x / 140 + phase) * 30) / 9) * 14 : a.c.table === 'cloth' ? ((x + y) % 6 < 3 ? 6 : -6) : Math.sin(x / 300 + phase) * 4
        d[o] = (base[0] ?? 0) + grain
        d[o + 1] = (base[1] ?? 0) + grain
        d[o + 2] = (base[2] ?? 0) + grain
        d[o + 3] = 255
      }
    }

    // 3. The card, warped into the photo (inverse mapping, bilinear), with a soft shadow below it.
    const m = a.toCard
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        // Shadow: sample the card a few pixels up-left.
        const sw = m[6] * (x - 6) + m[7] * (y - 8) + m[8]
        const su = (m[0] * (x - 6) + m[1] * (y - 8) + m[2]) / sw
        const sv = (m[3] * (x - 6) + m[4] * (y - 8) + m[5]) / sw
        if (su >= 0 && sv >= 0 && su < a.card.w && sv < a.card.h && (fd[(Math.floor(sv) * a.card.w + Math.floor(su)) * 4 + 3] ?? 0) > 0) {
          d[o] = (d[o] ?? 0) * 0.6; d[o + 1] = (d[o + 1] ?? 0) * 0.6; d[o + 2] = (d[o + 2] ?? 0) * 0.6
        }
        const w = m[6] * (x + 0.5) + m[7] * (y + 0.5) + m[8]
        const u = (m[0] * (x + 0.5) + m[1] * (y + 0.5) + m[2]) / w - 0.5
        const v = (m[3] * (x + 0.5) + m[4] * (y + 0.5) + m[5]) / w - 0.5
        if (u < -1 || v < -1 || u > a.card.w || v > a.card.h) continue
        const x0 = Math.floor(u); const y0 = Math.floor(v)
        const fx = u - x0; const fy = v - y0
        let r = 0; let gg = 0; let b = 0; let al = 0
        for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]] as const) {
          const sx = x0 + dx; const sy = y0 + dy
          if (sx < 0 || sy < 0 || sx >= a.card.w || sy >= a.card.h) continue
          const q = (sy * a.card.w + sx) * 4
          const aw = wt * (fd[q + 3] ?? 0) / 255
          r += (fd[q] ?? 0) * aw; gg += (fd[q + 1] ?? 0) * aw; b += (fd[q + 2] ?? 0) * aw; al += aw
        }
        if (al <= 0) continue
        d[o] = (d[o] ?? 0) * (1 - al) + r; d[o + 1] = (d[o + 1] ?? 0) * (1 - al) + gg; d[o + 2] = (d[o + 2] ?? 0) * (1 - al) + b
      }
    }
    p.putImageData(img, 0, 0)

    // 4. Focus blur.
    if (a.c.blur > 0) {
      const [tmp, t] = ctx2(W, H)
      t.drawImage(photo, 0, 0)
      p.filter = `blur(${String(a.c.blur)}px)`
      p.drawImage(tmp, 0, 0)
      p.filter = 'none'
    }

    // 5. Light: overall gain, uneven shade towards one corner, warm cast when dim, and noise.
    const out = p.getImageData(0, 0, W, H)
    const od = out.data
    const warm = a.c.light < 0.8
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        const k = a.c.light * (1 - a.c.shade * (x / W * 0.6 + y / H * 0.4))
        const n = (rnd() - 0.5) * 2 * a.c.noise
        od[o] = (od[o] ?? 0) * k * (warm ? 1.06 : 1) + n
        od[o + 1] = (od[o + 1] ?? 0) * k + n
        od[o + 2] = (od[o + 2] ?? 0) * k * (warm ? 0.82 : 1) + n
      }
    }
    p.putImageData(out, 0, 0)
    const url = photo.toDataURL('image/jpeg', 0.82)
    for (const cv of [face, photo]) { cv.width = 0; cv.height = 0 }
    return url.slice(url.indexOf(',') + 1)
  }, args)
  return Buffer.from(b64, 'base64')
}

async function makeAccuracySet (): Promise<void> {
  const { chromium } = await import('@playwright/test')
  const dir = 'tests/fixtures/accuracy'
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch(process.env['PW_CHROMIUM'] ? { executablePath: process.env['PW_CHROMIUM'] } : {})
  try {
    const page = await browser.newPage()
    const photos: AccPhoto[] = []
    for (const doc of ACC_DOCS) {
      for (const c of CONDITIONS) {
        for (const side of ['front', 'back'] as const) {
          const file = `${doc}-${c.id}-${side}.jpg`
          writeFileSync(`${dir}/${file}`, await drawPhoto(page, doc, side, c))
          const corners = cardCorners(c).map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 })) as unknown as Quad
          photos.push({ file, doc, side, condition: c.id, corners })
        }
      }
    }
    writeFileSync(`${dir}/expected.json`, JSON.stringify({ width: PHOTO.w, height: PHOTO.h, photos }, null, 2) + '\n')
  } finally {
    await browser.close()
  }
}

await makeAccuracySet()
