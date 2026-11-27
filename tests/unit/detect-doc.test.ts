// SPDX-License-Identifier: AGPL-3.0-or-later
// Document detection (src/detect/detect-doc.ts) with a fake OCR engine, fake canvases and a fake edge
// detector, so the order of reads, the stop rules, the per-photo cache and the "found nothing"
// answer that preselects the TIE (ADR 0028) run in Node. Personal data is fictional.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mrz } from '../../src/ocr/mrz.ts'
import type { OcrLine } from '../../src/ocr/ocr.ts'

const ocr = vi.hoisted(() => ({
  loadOcr: vi.fn(),
  ocrStatus: vi.fn(),
  readMrz: vi.fn(),
  recognise: vi.fn(),
}))
const edges = vi.hoisted(() => ({ detectCard: vi.fn() }))
const warp = vi.hoisted(() => ({ warpBitmap: vi.fn() }))

vi.mock('../../src/ocr/load-ocr.ts', () => ({ loadOcr: ocr.loadOcr }))
vi.mock('../../src/detect/edges.ts', () => ({ detectCard: edges.detectCard, ID1_ASPECT: 85.6 / 53.98 }))
vi.mock('../../src/ui/warp-bitmap.ts', () => ({ warpBitmap: warp.warpBitmap }))

const { detectDocument, detectStatus } = await import('../../src/detect/detect-doc.ts')

/** Records what was drawn on it, whether it was turned 180°, and every pixel copy it gave out. */
class FakeCanvas {
  static made: FakeCanvas[] = []
  width: number
  height: number
  turned = false
  source: unknown = null
  copies: Uint8ClampedArray[] = []
  constructor (w = 0, h = 0) {
    this.width = w
    this.height = h
    FakeCanvas.made.push(this)
  }

  getContext (): unknown {
    return {
      translate: () => undefined,
      rotate: () => { this.turned = true },
      drawImage: (src: unknown) => { this.source = src },
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4).fill(7)
        this.copies.push(data)
        return { width: w, height: h, data }
      },
    }
  }
}

const bitmap = (name: string, width = 1600, height = 1000): ImageBitmap => ({ name, width, height, close: () => undefined }) as unknown as ImageBitmap

/** An MRZ as parseMrz would return it; only the fields classify() reads matter. */
function mrz (documentCode: string, checks: Partial<Mrz['checks']> = {}, issuingState = 'ESP'): Mrz {
  const all = { number: true, birth: true, expiry: true, composite: true, ...checks }
  return {
    lines: ['', '', ''],
    documentCode,
    issuingState,
    documentNumber: 'BAA000589',
    optional1: '',
    birthDate: '900101',
    sex: 'F',
    expiryDate: '300101',
    nationality: 'ESP',
    checks: all,
    valid: Object.values(all).every(Boolean),
  }
}

/** Printed text of a DNI 4.0 front, at the heights where the straightened card has it (doc-text.test.ts). */
const DNI_4_FRONT: Array<{ text: string; y: number }> = [
  { text: 'REINO DE ESPAÑA', y: 0.08 },
  { text: 'DOCUMENTO NACIONAL DE IDENTIDAD', y: 0.13 },
  { text: 'DNI 99999999R', y: 0.2 },
  { text: 'EMISIÓN VALIDEZ', y: 0.62 },
  { text: 'NUM SOPORTE', y: 0.7 },
]
const lines = (rows: ReadonlyArray<{ text: string; y: number }>, h: number): { lines: OcrLine[] } => ({
  lines: rows.map((r) => ({ text: r.text, confidence: 0.9, bbox: { x0: 0, y0: r.y * h - 5, x1: 100, y1: r.y * h + 5 }, words: [] })),
})

/** A card found in the middle of the photo (pixels of the 800 px copy). */
const FOUND = { quad: [{ x: 100, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 480 }, { x: 100, y: 480 }], confidence: 0.9 }

beforeEach(() => {
  FakeCanvas.made = []
  vi.stubGlobal('document', { createElement: () => new FakeCanvas() })
  vi.stubGlobal('HTMLCanvasElement', FakeCanvas)
  ocr.loadOcr.mockResolvedValue({ ocrStatus: ocr.ocrStatus, readMrz: ocr.readMrz, recognise: ocr.recognise })
  ocr.readMrz.mockResolvedValue(null)
  ocr.recognise.mockResolvedValue({ lines: [] })
  edges.detectCard.mockReturnValue(FOUND)
  warp.warpBitmap.mockImplementation((src: unknown) => Object.assign(new FakeCanvas(1712, 1080), { source: src }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** The canvases given to readMrz or recognise, in order. */
const read = (fn: typeof ocr.readMrz): FakeCanvas[] => fn.mock.calls.map((c) => c[0] as FakeCanvas)

describe('detectStatus', () => {
  it('passes on the OCR status', async () => {
    ocr.ocrStatus.mockResolvedValue({ state: 'download', megabytes: 9 })
    expect(await detectStatus()).toEqual({ state: 'download', megabytes: 9 })
  })

  it('says unsupported when the OCR module does not load, and never throws', async () => {
    ocr.loadOcr.mockRejectedValueOnce(new Error('offline'))
    expect(await detectStatus()).toEqual({ state: 'unavailable', reason: 'unsupported' })
    ocr.ocrStatus.mockRejectedValueOnce(new Error('broken'))
    expect(await detectStatus()).toEqual({ state: 'unavailable', reason: 'unsupported' })
  })
})

describe('detectDocument: the MRZ', () => {
  it('reads the bottom of the back first and stops at the first read whose check digits pass', async () => {
    const seen: Array<{ w: number; h: number; turned: boolean; card: boolean }> = []
    ocr.readMrz.mockImplementationOnce((c: FakeCanvas) => {
      seen.push({ w: c.width, h: c.height, turned: c.turned, card: c.source instanceof FakeCanvas })
      return mrz('IR')
    })
    const back = bitmap('back')
    expect(await detectDocument({ front: bitmap('front'), back })).toEqual({ kind: 'tie', model: 'tie' })
    expect(ocr.readMrz).toHaveBeenCalledTimes(1)
    expect(ocr.recognise).not.toHaveBeenCalled()
    expect(warp.warpBitmap.mock.calls[0]?.[0]).toBe(back)
    // The bottom 40 % of the straightened 1712 × 1080 card, at 60 % size, not turned.
    expect(seen).toEqual([{ w: Math.round(1712 * 0.6), h: Math.round(1080 * 0.4 * 0.6), turned: false, card: true }])
  })

  it('tries the card upside down when the right way up reads nothing', async () => {
    ocr.readMrz.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(mrz('IR'))
    expect(await detectDocument({ front: null, back: bitmap('back') })).toEqual({ kind: 'tie', model: 'tie' })
    expect(read(ocr.readMrz).map((c) => c.turned)).toEqual([false, false, true])
  })

  it('keeps the read with the most passing check digits when none passes them all', async () => {
    // A TIE read with one passing digit, then a DNI read with three: the DNI read wins.
    ocr.readMrz
      .mockResolvedValueOnce(mrz('IR', { number: false, expiry: false, composite: false }))
      .mockResolvedValueOnce(mrz('ID', { birth: false }))
    // The DNI version stays open (the birth date failed its check), so the front's text decides it.
    ocr.recognise.mockImplementation((c: FakeCanvas) => lines(DNI_4_FRONT, c.height))
    expect(await detectDocument({ front: bitmap('front'), back: bitmap('back') })).toEqual({ kind: 'dni', model: 'dni-4.0' })
    // All four tries on the back (two sizes, both ways up); the back gave an answer, so the front's MRZ is not read.
    expect(ocr.readMrz).toHaveBeenCalledTimes(4)
  })

  it('reads the front when the photos were swapped', async () => {
    const front = bitmap('front')
    edges.detectCard.mockReturnValue(null) // whole photos: the strip is drawn from the photo itself
    ocr.readMrz.mockImplementation((c: FakeCanvas) => (c.source === front ? mrz('IR') : null))
    expect(await detectDocument({ front, back: bitmap('back') })).toEqual({ kind: 'tie', model: 'tie' })
    expect(read(ocr.readMrz).map((c) => (c.source === front ? 'front' : 'back'))).toEqual(['back', 'back', 'front'])
  })

  it('reads the whole photo, both ways up and at most 1600 px, when no card outline is found', async () => {
    edges.detectCard.mockReturnValue(null)
    const sizes: number[][] = []
    ocr.readMrz.mockImplementation((c: FakeCanvas) => { sizes.push([c.width, c.height]); return null })
    await detectDocument({ front: null, back: bitmap('back', 4000, 3000) })
    expect(warp.warpBitmap).not.toHaveBeenCalled()
    expect(sizes).toEqual([[1600, 1200], [1600, 1200]])
    expect(read(ocr.readMrz).map((c) => c.turned)).toEqual([false, true])
    // Each canvas is freed after its read: its size is recorded by the fake before it is dropped.
    expect(read(ocr.readMrz).every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })
})

describe('detectDocument: the printed text and the TIE fallback (ADR 0028)', () => {
  it('returns null when the photos were read but nothing was recognised, so the screen preselects the TIE', async () => {
    expect(await detectDocument({ front: bitmap('front'), back: bitmap('back') })).toBeNull()
    // Front then back, each right way up then upside down.
    expect(read(ocr.recognise).map((c) => c.turned)).toEqual([false, true, false, true])
  })

  it('says "other" for a document that is not Spanish, which the screen treats as no answer', async () => {
    ocr.readMrz.mockResolvedValue(mrz('ID', {}, 'FRA'))
    expect(await detectDocument({ front: bitmap('front'), back: bitmap('back') })).toEqual({ kind: 'other', model: null })
  })

  it('throws, and so preselects nothing, when OCR cannot start', async () => {
    ocr.loadOcr.mockRejectedValue(new Error('OCR unavailable: no-service-worker'))
    await expect(detectDocument({ front: bitmap('front'), back: bitmap('back') })).rejects.toThrow('no-service-worker')
  })

  it('throws when a read fails, and reads that photo again next time', async () => {
    const back = bitmap('back')
    ocr.readMrz.mockRejectedValueOnce(new Error('OCR files unavailable'))
    await expect(detectDocument({ front: null, back })).rejects.toThrow('OCR files unavailable')
    ocr.readMrz.mockResolvedValue(mrz('IR'))
    expect(await detectDocument({ front: null, back })).toEqual({ kind: 'tie', model: 'tie' })
  })

  it('uses the text of the front to find the document when no MRZ is read', async () => {
    ocr.recognise.mockImplementation((c: FakeCanvas) => lines(DNI_4_FRONT, c.height))
    expect(await detectDocument({ front: bitmap('front'), back: null })).toEqual({ kind: 'dni', model: 'dni-4.0' })
  })

  it('ignores where the text is when no card outline was found', async () => {
    edges.detectCard.mockReturnValue(null)
    // Only the title and the number: where the number is tells DNI 4.0 from 3.0.
    const titleAndNumber = DNI_4_FRONT.slice(1, 3)
    ocr.recognise.mockImplementation((c: FakeCanvas) => lines(titleAndNumber, c.height))
    expect(await detectDocument({ front: bitmap('a'), back: null })).toEqual({ kind: 'dni', model: null })
    edges.detectCard.mockReturnValue(FOUND)
    expect(await detectDocument({ front: bitmap('b'), back: null })).toEqual({ kind: 'dni', model: 'dni-4.0' })
  })
})

describe('detectDocument: memory', () => {
  it('reads each photo once, however often the screen asks', async () => {
    const photos = { front: bitmap('front'), back: bitmap('back') }
    expect(await detectDocument(photos)).toBeNull()
    const mrzReads = ocr.readMrz.mock.calls.length
    const textReads = ocr.recognise.mock.calls.length
    expect(await detectDocument(photos)).toBeNull()
    expect(ocr.readMrz).toHaveBeenCalledTimes(mrzReads)
    expect(ocr.recognise).toHaveBeenCalledTimes(textReads)
  })

  it('frees every canvas and clears every copy of the photo pixels', async () => {
    ocr.recognise.mockImplementation((c: FakeCanvas) => lines(DNI_4_FRONT, c.height))
    await detectDocument({ front: bitmap('front'), back: bitmap('back') })
    expect(FakeCanvas.made.length).toBeGreaterThan(0)
    for (const c of FakeCanvas.made) {
      expect([c.width, c.height]).toEqual([0, 0])
      for (const data of c.copies) expect(data.every((v) => v === 0)).toBe(true)
    }
  })

  it('frees the canvases when the edge detector throws', async () => {
    edges.detectCard.mockImplementation(() => { throw new Error('bug') })
    await expect(detectDocument({ front: null, back: bitmap('back') })).rejects.toThrow('bug')
    for (const c of FakeCanvas.made) {
      expect([c.width, c.height]).toEqual([0, 0])
      for (const data of c.copies) expect(data.every((v) => v === 0)).toBe(true)
    }
  })
})
