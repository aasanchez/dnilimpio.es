// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared test helpers: a real browser-encoded JPEG (64 × 40, synthetic colours) with metadata
// segments injected after SOI, the way a phone camera would write them.
import { readFileSync } from 'node:fs'

export const CLEAN = new Uint8Array(readFileSync(new URL('../fixtures/synthetic-card.jpg', import.meta.url)))

function segment (marker: number, payload: string): number[] {
  const body = [...new TextEncoder().encode(payload)]
  const len = body.length + 2
  return [0xff, marker, len >> 8, len & 0xff, ...body]
}

/** Canary strings that must never reach an exported file. */
export const CANARIES = ['Exif', 'GPS-40.4168N', 'CameraModel-X1', 'secret-comment', 'http://ns.adobe.com/xap']

export function dirtyJpeg (): Uint8Array {
  const extra = [
    ...segment(0xe1, 'Exif\0\0GPS-40.4168N CameraModel-X1'),
    ...segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'),
    ...segment(0xfe, 'secret-comment'),
  ]
  return new Uint8Array([...CLEAN.subarray(0, 2), ...extra, ...CLEAN.subarray(2)])
}

export function latin1 (b: Uint8Array): string {
  return Buffer.from(b).toString('latin1')
}
