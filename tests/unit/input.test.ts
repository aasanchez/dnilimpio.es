// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  blockStrayDrops, carriesFiles, configureFileInput, prefersCameraButton, wireCapture, wirePageDrop, wirePaste,
  type CaptureTarget,
} from '../../src/capture/input.ts'
import { MAX_BYTES } from '../../src/capture/decode.ts'
import { jpegHeader, pngHeader } from '../image-headers.ts'

/** Minimal stand-in for HTMLInputElement: the unit tests run in Node, without a DOM. */
function fakeInput (attrs: Record<string, string> = {}): HTMLInputElement & { attrs: Record<string, string> } {
  const fake = {
    type: 'text',
    accept: '',
    attrs: { ...attrs },
    setAttribute (name: string, value: string) { fake.attrs[name] = value },
    removeAttribute (name: string) { Reflect.deleteProperty(fake.attrs, name) },
    hasAttribute (name: string) { return name in fake.attrs },
  }
  return fake as unknown as HTMLInputElement & { attrs: Record<string, string> }
}

describe('configureFileInput', () => {
  it('makes an image file picker', () => {
    const input = fakeInput()
    configureFileInput(input)
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
  })

  it('does not force the camera, so the gallery stays available on mobile', () => {
    const input = fakeInput({ capture: 'environment' })
    configureFileInput(input)
    expect(input.hasAttribute('capture')).toBe(false)
  })

  it('camera mode opens the rear camera directly', () => {
    const input = fakeInput()
    configureFileInput(input, 'camera')
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
    expect(input.attrs['capture']).toBe('environment')
  })
})

describe('prefersCameraButton', () => {
  it('is true for a coarse (touch) pointer', () => {
    expect(prefersCameraButton((q) => ({ matches: q === '(pointer: coarse)' }))).toBe(true)
  })

  it('is false for a fine (mouse) pointer', () => {
    expect(prefersCameraButton(() => ({ matches: false }))).toBe(false)
  })
})

describe('carriesFiles', () => {
  it('is true only for drags that carry files from the system', () => {
    expect(carriesFiles({ types: ['Files'] })).toBe(true)
    expect(carriesFiles({ types: ['text/plain', 'Files'] })).toBe(true)
    expect(carriesFiles({ types: ['text/uri-list'] })).toBe(false)
    expect(carriesFiles(null)).toBe(false)
  })
})

// Every way a photo arrives (file picker, camera, drop on a tile, drop on the page, paste) hands the
// file over unfiltered, so the content checks of ADR 0031 (decode.ts) apply to each one: a file that
// is not an image, too large in bytes or in pixels gets a clear error, never silence.

/** A file input as an event target, with the parts wireCapture uses. */
function liveInput (): HTMLInputElement {
  const t = new EventTarget() as EventTarget & Record<string, unknown>
  const attrs: Record<string, string> = {}
  Object.assign(t, {
    type: 'text',
    accept: '',
    value: '',
    files: null,
    setAttribute: (n: string, v: string) => { attrs[n] = v },
    removeAttribute: (n: string) => { Reflect.deleteProperty(attrs, n) },
  })
  return t as unknown as HTMLInputElement
}

/** What the picker does when a file is chosen. */
function choose (input: HTMLInputElement, file: File): void {
  Object.assign(input, { files: [file] })
}

function dropZone (): HTMLElement & { classes: Set<string> } {
  const t = new EventTarget() as EventTarget & Record<string, unknown>
  const classes = new Set<string>()
  Object.assign(t, { classes, classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } })
  return t as unknown as HTMLElement & { classes: Set<string> }
}

/** A drag or paste event carrying `files`. */
function carrying (type: string, files: File[], extra: Record<string, unknown> = {}): Event {
  const e = new Event(type, { cancelable: true })
  const dt = { types: files.length > 0 ? ['Files'] : ['text/plain'], files, dropEffect: 'none' }
  return Object.assign(e, type === 'paste' ? { clipboardData: dt } : { dataTransfer: dt }, extra)
}

const png = (w: number, h: number): File => new File([new Uint8Array(pngHeader(w, h))], 'photo.png', { type: 'image/png' })
/** A JPEG by its content, named and typed as a PNG: the content decides. */
const disguised = (): File => new File([new Uint8Array(jpegHeader(800, 600))], 'photo.png', { type: 'image/png' })
const notAnImage = (): File => new File(['%PDF-1.7'], 'photo.jpg', { type: 'image/jpeg' })

describe('every way in checks the file by its content (ADR 0031)', () => {
  let bitmaps: Array<{ width: number; height: number; closed: boolean }>
  let ctrl: AbortController
  let page: EventTarget

  beforeEach(() => {
    bitmaps = []
    ctrl = new AbortController()
    page = new EventTarget()
    vi.stubGlobal('document', page)
    // The browser's decoder: the header is all the fake needs.
    vi.stubGlobal('createImageBitmap', vi.fn(() => {
      const b = { width: 800, height: 600, closed: false, close () { b.closed = true } }
      bitmaps.push(b)
      return Promise.resolve(b)
    }))
  })

  afterEach(() => {
    ctrl.abort()
    vi.unstubAllGlobals()
  })

  function target (): CaptureTarget & { results: Array<[unknown, string]>; input: HTMLInputElement; cameraInput: HTMLInputElement; dropZone: ReturnType<typeof dropZone> } {
    const results: Array<[unknown, string]> = []
    return { input: liveInput(), cameraInput: liveInput(), dropZone: dropZone(), results, onResult: (r, via) => { results.push([r, via]) } }
  }

  it('file picker and camera: a file that is not an image gets an error, and the input lets go of the file', async () => {
    const t = target()
    wireCapture(t, ctrl.signal)
    choose(t.input, notAnImage())
    t.input.value = 'C:\\fakepath\\photo.jpg'
    t.input.dispatchEvent(new Event('change'))
    expect(t.input.value).toBe('')
    choose(t.cameraInput, png(20_000, 20_000))
    t.cameraInput.dispatchEvent(new Event('change'))
    await vi.waitFor(() => { expect(t.results).toHaveLength(2) })
    expect(t.results).toContainEqual([{ ok: false, error: { kind: 'not-an-image' } }, 'file'])
    expect(t.results).toContainEqual([{ ok: false, error: { kind: 'too-many-pixels', width: 20_000, height: 20_000 } }, 'camera'])
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('drop on a tile: a file over the size limit is refused before it is read', async () => {
    const t = target()
    wireCapture(t, ctrl.signal)
    t.dropZone.dispatchEvent(carrying('dragover', []))
    expect(t.dropZone.classes.has('is-dragover')).toBe(true)
    const big = new File([new Uint8Array(MAX_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' })
    const drop = carrying('drop', [big])
    t.dropZone.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(t.dropZone.classes.has('is-dragover')).toBe(false)
    await vi.waitFor(() => { expect(t.results).toEqual([[{ ok: false, error: { kind: 'too-large', bytes: MAX_BYTES + 1 } }, 'file']]) })
  })

  it('paste: an image whose name and type lie is decoded by its content', async () => {
    const t = target()
    wirePaste(() => t, ctrl.signal)
    const e = carrying('paste', [disguised()])
    page.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    await vi.waitFor(() => { expect(t.results).toHaveLength(1) })
    expect(t.results[0]?.[0]).toMatchObject({ ok: true, bitmap: { width: 800 } })
    expect(t.results[0]?.[1]).toBe('paste')
  })

  it('paste: does nothing without a file or without a side to take it', async () => {
    const t = target()
    let side: CaptureTarget | null = null
    wirePaste(() => side, ctrl.signal)
    const noSide = carrying('paste', [png(10, 10)])
    page.dispatchEvent(noSide)
    side = t
    const noFile = carrying('paste', [])
    page.dispatchEvent(noFile)
    expect([noSide.defaultPrevented, noFile.defaultPrevented]).toEqual([false, false])
    await Promise.resolve()
    expect(t.results).toEqual([])
  })

  it('drop on the page: a file goes to the side the app picks, through the same checks', async () => {
    const t = target()
    const dragging: boolean[] = []
    wirePageDrop(() => t, (d) => { dragging.push(d) }, ctrl.signal)
    const over = carrying('dragover', [png(10, 10)])
    page.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    page.dispatchEvent(carrying('drop', [notAnImage()]))
    expect(dragging).toEqual([true, false])
    await vi.waitFor(() => { expect(t.results).toEqual([[{ ok: false, error: { kind: 'not-an-image' } }, 'file']]) })
  })

  it('drop on the page: leaves a drop that a tile already took, and text drags, alone', async () => {
    const t = target()
    wirePageDrop(() => t, () => undefined, ctrl.signal)
    const taken = carrying('drop', [png(10, 10)])
    taken.preventDefault()
    page.dispatchEvent(taken)
    const text = carrying('drop', [])
    page.dispatchEvent(text)
    expect(text.defaultPrevented).toBe(false)
    await Promise.resolve()
    expect(t.results).toEqual([])
  })

  it('closes a decoded photo that arrives after its screen was closed', async () => {
    const t = target()
    wireCapture(t, ctrl.signal)
    choose(t.input, png(800, 600))
    t.input.dispatchEvent(new Event('change'))
    ctrl.abort()
    await vi.waitFor(() => { expect(bitmaps).toHaveLength(1) })
    await vi.waitFor(() => { expect(bitmaps[0]?.closed).toBe(true) })
    expect(t.results).toEqual([])
  })

  it('stops listening once the screen is closed', async () => {
    const t = target()
    wireCapture(t, ctrl.signal)
    wirePaste(() => t, ctrl.signal)
    ctrl.abort()
    choose(t.input, png(10, 10))
    t.input.dispatchEvent(new Event('change'))
    page.dispatchEvent(carrying('paste', [png(10, 10)]))
    await Promise.resolve()
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})

describe('blockStrayDrops', () => {
  it('stops the browser from opening a file dropped outside the drop areas, and nothing else', () => {
    const page = new EventTarget()
    blockStrayDrops(page)
    const file = carrying('drop', [png(10, 10)])
    const over = carrying('dragover', [png(10, 10)])
    const text = carrying('drop', [])
    for (const e of [file, over, text]) page.dispatchEvent(e)
    expect([file.defaultPrevented, over.defaultPrevented, text.defaultPrevented]).toEqual([true, true, false])
  })
})
