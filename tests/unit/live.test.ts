// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { canUseLiveCamera, classifyError, openCamera, stopStream } from '../../src/capture/live.ts'

const fakeStream = (): MediaStream & { stopped: number } => {
  const s = { stopped: 0, getTracks: () => [{ stop: () => { s.stopped++ } }] }
  return s as unknown as MediaStream & { stopped: number }
}

describe('live camera', () => {
  it('needs a secure context and getUserMedia', () => {
    const mediaDevices = { getUserMedia: () => Promise.resolve(fakeStream()) }
    expect(canUseLiveCamera({ isSecureContext: true, mediaDevices })).toBe(true)
    expect(canUseLiveCamera({ isSecureContext: false, mediaDevices })).toBe(false)
    expect(canUseLiveCamera({ isSecureContext: true })).toBe(false)
  })

  it('classifies failures without throwing', async () => {
    expect(classifyError(new DOMException('no', 'NotAllowedError'))).toBe('denied')
    expect(classifyError(new DOMException('no', 'NotFoundError'))).toBe('unavailable')
    expect(classifyError('weird')).toBe('unavailable')
    const reject = (name: string) => ({ isSecureContext: true, mediaDevices: { getUserMedia: () => Promise.reject(new DOMException('x', name)) } })
    await expect(openCamera(reject('NotAllowedError'))).resolves.toEqual({ ok: false, reason: 'denied' })
    await expect(openCamera(reject('NotReadableError'))).resolves.toEqual({ ok: false, reason: 'unavailable' })
    await expect(openCamera({ isSecureContext: true })).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('asks for the rear camera, video only, and stops every track', async () => {
    let asked: MediaStreamConstraints | undefined
    const stream = fakeStream()
    const r = await openCamera({ isSecureContext: true, mediaDevices: { getUserMedia: (c?: MediaStreamConstraints) => { asked = c; return Promise.resolve(stream) } } })
    expect(r.ok).toBe(true)
    expect(asked?.audio).toBe(false)
    expect(asked?.video).toMatchObject({ facingMode: { ideal: 'environment' } })
    stopStream(stream)
    stopStream(null)
    expect(stream.stopped).toBe(1)
  })
})
