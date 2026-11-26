// SPDX-License-Identifier: AGPL-3.0-or-later
// Memory clean-up after processing: canvases shrink, buffers are zeroed, download URLs are revoked,
// and the capture coach keeps no old camera frame.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shrink, wipe } from '../../src/engine/wipe.ts'
import { DOWNLOAD_URL_MS, downloadUrl, openDownloads, revokeDownloads } from '../../src/engine/downloads.ts'
import { Coach, type Gray } from '../../src/capture/coach.ts'
import { detectCard } from '../../src/detect/edges.ts'

describe('shrink / wipe', () => {
  it('shrinks every canvas to 0 × 0 and skips missing ones', () => {
    const a = { width: 1712, height: 1080 }
    const b = { width: 10, height: 10 }
    shrink(a, null, undefined, b)
    expect([a, b]).toEqual([{ width: 0, height: 0 }, { width: 0, height: 0 }])
  })

  it('overwrites every array with zeros and skips missing ones', () => {
    const a = new Uint8ClampedArray([1, 2, 255])
    const b = new Float32Array([0.5, 128])
    wipe(a, undefined, b, null)
    expect([...a, ...b]).toEqual([0, 0, 0, 0, 0])
  })
})

describe('download URLs', () => {
  afterEach(() => {
    revokeDownloads()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('revokes a download URL by itself after the delay', () => {
    vi.useFakeTimers()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const url = downloadUrl(new Blob(['%PDF-']))
    expect(openDownloads()).toBe(1)
    vi.advanceTimersByTime(DOWNLOAD_URL_MS - 1)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revoke).toHaveBeenCalledExactlyOnceWith(url)
    expect(openDownloads()).toBe(0)
  })

  it('revokeDownloads() revokes every open URL at once, and the timers do not revoke them again', () => {
    vi.useFakeTimers()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const urls = [downloadUrl(new Blob(['a'])), downloadUrl(new Blob(['b']))]
    revokeDownloads()
    expect(revoke.mock.calls.map((c) => c[0])).toEqual(urls)
    expect(openDownloads()).toBe(0)
    vi.advanceTimersByTime(DOWNLOAD_URL_MS * 2)
    expect(revoke).toHaveBeenCalledTimes(2)
  })
})

describe('capture coach frames', () => {
  const frame = (v: number): Gray => ({ width: 48, height: 36, data: new Uint8Array(48 * 36).fill(v) })

  it('keeps only the latest frame: the one before is zeroed when a new one arrives', () => {
    const coach = new Coach()
    const first = frame(120)
    const second = frame(130)
    coach.feed(first, 0)
    expect(first.data.every((v) => v === 120)).toBe(true)
    coach.feed(second, 125)
    expect(first.data.every((v) => v === 0)).toBe(true)
    expect(second.data.every((v) => v === 130)).toBe(true)
  })

  it('dispose() zeroes the last frame', () => {
    const coach = new Coach()
    const last = frame(90)
    coach.feed(last, 0)
    coach.dispose()
    expect(last.data.every((v) => v === 0)).toBe(true)
  })
})

describe('edge detection', () => {
  it('reads the photo without changing it', () => {
    const data = new Uint8ClampedArray(64 * 48 * 4).fill(200)
    const copy = new Uint8ClampedArray(data)
    detectCard({ width: 64, height: 48, data })
    expect(data).toEqual(copy)
  })
})
