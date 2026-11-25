// SPDX-License-Identifier: AGPL-3.0-or-later
// Generates synthetic "photo of a card" PNGs for tests. No real DNI data is ever used (spec §6).
// Run: node scripts/make-fixtures.ts  (Node ≥ 22.18 strips types natively)

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

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
