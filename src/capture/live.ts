// SPDX-License-Identifier: AGPL-3.0-or-later
// Live camera for the capture coach. The stream stays in this tab: frames are drawn to canvases
// in memory and never sent anywhere.
// Every failure is reported as a reason, never thrown, so the UI can fall back to the plain
// camera and gallery buttons without an error screen.

export type CameraFailure = 'denied' | 'unavailable'
export type CameraResult = { ok: true; stream: MediaStream } | { ok: false; reason: CameraFailure }

interface CameraEnv {
  readonly isSecureContext: boolean
  readonly mediaDevices?: Pick<MediaDevices, 'getUserMedia'> | undefined
}

/** True when the browser can give a live camera stream: a secure context with getUserMedia. */
export function canUseLiveCamera (env: CameraEnv): boolean {
  return env.isSecureContext && typeof env.mediaDevices?.getUserMedia === 'function'
}

/**
 * Rear camera, as sharp as the phone offers for video. 2560 × 1440 is an ideal, not a minimum:
 * the browser picks the closest mode, and in portrait it swaps width and height itself.
 */
export const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 2560 },
    height: { ideal: 1440 },
  },
}

/** Classifies a getUserMedia rejection. Exported for unit tests. */
export function classifyError (e: unknown): CameraFailure {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String(e.name) : ''
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
}

export async function openCamera (env: CameraEnv): Promise<CameraResult> {
  const devices = env.mediaDevices
  if (!canUseLiveCamera(env) || !devices) return { ok: false, reason: 'unavailable' }
  try {
    const stream = await devices.getUserMedia(CONSTRAINTS)
    return { ok: true, stream }
  } catch (e) {
    return { ok: false, reason: classifyError(e) }
  }
}

/** Turns the camera off (the indicator light goes out). Safe to call more than once. */
export function stopStream (stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
}
