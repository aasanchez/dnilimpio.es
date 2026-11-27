// SPDX-License-Identifier: AGPL-3.0-or-later
// Whether OCR read a photo in this session, for the opt-in usage stats (ADR 0029). Only a yes/no:
// set by every finished read (document detection, Find my data, Fit to the text), cleared by Reset.
// Kept apart from ocr.ts so the app can read it without loading the OCR engine.

let ran = false

export function markOcrRan (): void { ran = true }
export function ocrRan (): boolean { return ran }
export function clearOcrRan (): void { ran = false }
