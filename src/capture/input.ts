// SPDX-License-Identifier: AGPL-3.0-or-later
// Wires one capture target (front or back): file input, drag-and-drop, and paste.

import { decodeImage, type DecodeResult } from './decode.ts'

export interface CaptureTarget {
  /** The <input type=file> for this side that opens the file or gallery picker. */
  readonly input: HTMLInputElement;
  /** Optional second input that opens the camera directly (touch devices only). */
  readonly cameraInput?: HTMLInputElement;
  /** Element that accepts drops; usually the label wrapping the input. */
  readonly dropZone: HTMLElement;
  readonly onResult: (result: DecodeResult) => void;
}

/**
 * `pick`: no `capture` attribute, so mobile browsers open the gallery or file chooser.
 * `camera`: `capture="environment"`, so mobile browsers open the rear camera directly.
 * Desktop browsers ignore `capture`; the UI shows the camera input on touch devices only.
 */
export function configureFileInput (input: HTMLInputElement, mode: 'pick' | 'camera' = 'pick'): void {
  input.type = 'file'
  // A hint for the picker only: the file's content decides (sniff.ts). 'image/*' also makes iOS
  // usually hand over a JPEG copy of an HEIC photo, which every browser can open.
  input.accept = 'image/*'
  if (mode === 'camera') input.setAttribute('capture', 'environment')
  else input.removeAttribute('capture')
}

/** True on phones and tablets: the primary pointer is a finger, so a camera button makes sense. */
export function prefersCameraButton (matchMedia: (q: string) => { matches: boolean }): boolean {
  return matchMedia('(pointer: coarse)').matches
}

/**
 * Decodes and delivers the result unless the screen that asked for it was torn down meanwhile
 * (e.g. a language change re-renders the UI). A discarded bitmap is closed to free its memory.
 */
function decodeFor (file: File, signal: AbortSignal, onResult: (r: DecodeResult) => void): void {
  void decodeImage(file).then((r) => {
    if (signal.aborted) {
      if (r.ok) r.bitmap.close()
      return
    }
    onResult(r)
  })
}

export function wireCapture (target: CaptureTarget, signal: AbortSignal): void {
  const { input, cameraInput, dropZone, onResult } = target
  configureFileInput(input, 'pick')
  if (cameraInput) configureFileInput(cameraInput, 'camera')
  const handle = (file: File | null): void => {
    if (!file) return
    decodeFor(file, signal, onResult)
  }
  for (const i of cameraInput ? [input, cameraInput] : [input]) {
    i.addEventListener('change', () => {
      // Take the file as chosen (not filtered) so a wrong type gets a clear error instead of silence.
      handle(i.files?.[0] ?? null)
      i.value = '' // drop the File reference held by the input (§4.8)
    }, { signal })
  }
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('is-dragover')
  }, { signal })
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('is-dragover') }, { signal })
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('is-dragover')
    handle(e.dataTransfer?.files[0] ?? null)
  }, { signal })
}

/** Paste goes to whichever side the caller says is active (the first empty one, or the focused one). */
export function wirePaste (pickTarget: () => CaptureTarget | null, signal: AbortSignal): void {
  document.addEventListener('paste', (e) => {
    const target = pickTarget()
    // Take the first file as pasted (not filtered by type): its content decides, with a clear error.
    const file = e.clipboardData?.files[0] ?? null
    if (!target || !file) return
    e.preventDefault()
    decodeFor(file, signal, target.onResult)
  }, { signal })
}

/** True when a drag carries files from the system, not text or a link from the page. */
export function carriesFiles (dt: Pick<DataTransfer, 'types'> | null): boolean {
  return dt !== null && Array.from(dt.types).includes('Files')
}

/**
 * A file dropped outside the app's drop areas would make the browser open it in the tab, which
 * discards the session (photos, corners, redactions). Called once at start-up: every step is safe.
 */
export function blockStrayDrops (target: Pick<EventTarget, 'addEventListener'>): void {
  const stop = (e: Event): void => { if (carriesFiles((e as DragEvent).dataTransfer)) e.preventDefault() }
  target.addEventListener('dragover', stop)
  target.addEventListener('drop', stop)
}

/**
 * Desktop drag and drop for the photo step: the whole page is the drop area. A file dropped
 * anywhere goes to `pickTarget()`, unless a side's tile already took it. `onDragging` tells the UI
 * when files are over the page, so it can show where they go. The file is only decoded in memory.
 */
export function wirePageDrop (
  pickTarget: () => CaptureTarget | null,
  onDragging: (dragging: boolean) => void,
  signal: AbortSignal
): void {
  document.addEventListener('dragover', (e) => {
    if (!carriesFiles(e.dataTransfer)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    onDragging(true)
  }, { signal })
  // relatedTarget is null only when the pointer leaves the window (or the drag is cancelled).
  document.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) onDragging(false) }, { signal })
  document.addEventListener('drop', (e) => {
    onDragging(false)
    if (e.defaultPrevented || !carriesFiles(e.dataTransfer)) return // a side's tile handled it
    e.preventDefault()
    const target = pickTarget()
    // Take the file as dropped (not filtered) so a wrong type gets a clear error instead of silence.
    const file = e.dataTransfer?.files[0] ?? null
    if (target && file) decodeFor(file, signal, target.onResult)
  }, { signal })
}
