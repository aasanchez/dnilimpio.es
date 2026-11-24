// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DecodeError, DecodeResult } from '../capture/decode.ts'
import { wireCapture, wirePaste, type CaptureTarget } from '../capture/input.ts'
import type { Side } from '../zones/dni.ts'
import { t, type Key, type Lang } from '../i18n/index.ts'
import { el } from './dom.ts'

const ERROR_KEY: Record<DecodeError['kind'], Key> = {
  'not-an-image': 'errNotImage',
  'heic-unsupported': 'errHeic',
  'too-large': 'errTooLarge',
  'decode-failed': 'errDecode',
}

export interface CaptureState { front: ImageBitmap | null; back: ImageBitmap | null }

/** Renders the capture step. Calls onChange whenever a side is (re)loaded. */
export function renderCapture (lang: Lang, state: CaptureState, onChange: () => void, signal: AbortSignal): HTMLElement {
  const targets: Partial<Record<Side, CaptureTarget>> = {}
  const section = el('section', { className: 'step' }, el('h2', { text: t(lang, 'stepCapture') }))

  for (const side of ['front', 'back'] as const) {
    const input = el('input', { id: `file-${side}`, className: 'visually-hidden' })
    const status = el('p', { className: 'status', id: `status-${side}` })
    status.setAttribute('role', 'status')
    const preview = el('canvas', { className: 'preview' })
    preview.width = 0
    preview.height = 0
    const button = el('label', { className: 'button', text: t(lang, 'chooseOrTake') }, input)
    button.htmlFor = input.id
    const zone = el('div', { className: 'dropzone' },
      el('h3', { text: t(lang, side) }), button, el('p', { className: 'hint', text: t(lang, 'dropHint') }), preview, status)
    input.setAttribute('aria-describedby', status.id)

    const show = (bitmap: ImageBitmap): void => {
      const scale = Math.min(1, 480 / bitmap.width)
      preview.width = Math.round(bitmap.width * scale)
      preview.height = Math.round(bitmap.height * scale)
      preview.getContext('2d')?.drawImage(bitmap, 0, 0, preview.width, preview.height)
    }
    // Re-rendering (e.g. after a language change) keeps already loaded images.
    const existing = state[side]
    if (existing) {
      show(existing)
      status.textContent = t(lang, 'loaded')
    }

    const onResult = (r: DecodeResult): void => {
      if (!r.ok) {
        status.textContent = t(lang, ERROR_KEY[r.error.kind])
        status.setAttribute('role', 'alert')
        return
      }
      state[side]?.close()
      state[side] = r.bitmap
      show(r.bitmap)
      status.setAttribute('role', 'status')
      status.textContent = t(lang, 'loaded')
      onChange()
    }
    const target: CaptureTarget = { input, dropZone: zone, onResult }
    targets[side] = target
    wireCapture(target, signal)
    section.append(zone)
  }

  // Paste fills the first empty side; if both are set, it replaces the front.
  wirePaste(() => (state.front === null ? targets.front : state.back === null ? targets.back : targets.front) ?? null, signal)
  return section
}
