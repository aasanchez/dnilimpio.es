// SPDX-License-Identifier: AGPL-3.0-or-later
// Wires one capture target (front or back): file input with camera hint, drag-and-drop, and paste.

import { decodeImage, firstImageFile, type DecodeResult } from './decode.ts';

export interface CaptureTarget {
  /** The <input type=file> for this side. */
  readonly input: HTMLInputElement;
  /** Element that accepts drops; usually the label wrapping the input. */
  readonly dropZone: HTMLElement;
  readonly onResult: (result: DecodeResult) => void;
}

export function configureFileInput(input: HTMLInputElement): void {
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
}

export function wireCapture(target: CaptureTarget, signal: AbortSignal): void {
  const { input, dropZone, onResult } = target;
  configureFileInput(input);
  const handle = (file: File | null): void => {
    if (!file) return;
    void decodeImage(file, file.name).then(onResult);
  };
  input.addEventListener('change', () => {
    // Take the file as chosen (not filtered) so a wrong type gets a clear error instead of silence.
    handle(input.files?.[0] ?? null);
    input.value = ''; // drop the File reference held by the input (§4.8)
  }, { signal });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('is-dragover');
  }, { signal });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('is-dragover'); }, { signal });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-dragover');
    handle(e.dataTransfer?.files[0] ?? null);
  }, { signal });
}

/** Paste goes to whichever side the caller says is active (the first empty one, or the focused one). */
export function wirePaste(pickTarget: () => CaptureTarget | null, signal: AbortSignal): void {
  document.addEventListener('paste', (e) => {
    const target = pickTarget();
    const file = e.clipboardData ? firstImageFile(e.clipboardData.files) : null;
    if (!target || !file) return;
    e.preventDefault();
    void decodeImage(file, file.name).then(target.onResult);
  }, { signal });
}
