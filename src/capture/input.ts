// SPDX-License-Identifier: AGPL-3.0-or-later
// Wires one capture target (front or back): file input, drag-and-drop, and paste.

import { decodeImage, firstImageFile, type DecodeResult } from './decode.ts'

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
  void decodeImage(file, file.name).then((r) => {
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
    const file = e.clipboardData ? firstImageFile(e.clipboardData.files) : null
    if (!target || !file) return
    e.preventDefault()
    decodeFor(file, signal, target.onResult)
  }, { signal })
}
