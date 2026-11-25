// SPDX-License-Identifier: AGPL-3.0-or-later
// Step 2 (spec §4.2): mark the four card corners on each side, then check the straightened result.

import type { Quad } from '../geometry/homography.ts'
import { isConvex } from '../geometry/homography.ts'
import { defaultQuad, rotateQuad } from '../geometry/quad-edit.ts'
import { t, type Lang } from '../i18n/index.ts'
import type { Side } from '../zones/dni.ts'
import { cornerEditor } from './corner-editor.ts'
import { el } from './dom.ts'
import { warpBitmap } from './warp-bitmap.ts'

export interface AlignState {
  quads: Record<Side, Quad | null>;
  /** Straightened 1712 × 1080 card per side; null until the user confirms the corners. */
  warped: Record<Side, HTMLCanvasElement | null>;
}

export function emptyAlignState (): AlignState {
  return { quads: { front: null, back: null }, warped: { front: null, back: null } }
}

/** Drops everything derived from one side, e.g. when its photo is replaced. */
export function resetSide (state: AlignState, side: Side): void {
  state.quads[side] = null
  const c = state.warped[side]
  if (c) {
    c.width = 0
    c.height = 0
  }
  state.warped[side] = null
}

function button (text: string, className: string, onClick: () => void, signal: AbortSignal): HTMLButtonElement {
  const b = el('button', { text, className })
  b.type = 'button'
  b.addEventListener('click', onClick, { signal })
  return b
}

/** Corner editor for one side. `onDone` runs after the warp succeeded. */
export function renderAlign (
  lang: Lang, side: Side, bitmap: ImageBitmap, state: AlignState,
  nav: { onBack: () => void; onDone: () => void }, signal: AbortSignal
): HTMLElement {
  const quad = state.quads[side] ?? defaultQuad(bitmap.width, bitmap.height)
  state.quads[side] = quad
  const status = el('p', { className: 'status', id: 'align-status' })
  status.setAttribute('role', 'status')

  const next = button(t(lang, 'continue'), 'button', () => {
    const q = state.quads[side]
    if (!q || !isConvex(q)) return
    resetSide(state, side)
    state.quads[side] = q
    state.warped[side] = warpBitmap(bitmap, q)
    nav.onDone()
  }, signal)
  next.id = 'align-continue'

  const sync = (q: Quad): void => {
    const ok = isConvex(q)
    next.disabled = !ok
    status.textContent = ok ? '' : t(lang, 'cornersInvalid')
    status.setAttribute('role', ok ? 'status' : 'alert')
  }

  const editor = cornerEditor({
    bitmap,
    quad,
    label: `${t(lang, 'editorLabel')}: ${t(lang, side)}`,
    onChange: (q) => {
      state.quads[side] = q
      sync(q)
    },
    signal,
  })
  sync(quad)

  const rotate = button(t(lang, 'rotate'), 'button secondary', () => {
    const q = rotateQuad(state.quads[side] ?? quad)
    state.quads[side] = q
    editor.setQuad(q)
    sync(q)
  }, signal)
  rotate.id = 'align-rotate'
  const back = button(t(lang, 'goBack'), 'button secondary', nav.onBack, signal)
  back.id = 'align-back'

  const heading = el('h2', { text: t(lang, 'stepAlign') })
  heading.tabIndex = -1
  return el('section', { className: 'step' },
    heading,
    el('h3', { text: t(lang, side) }),
    el('p', { className: 'hint', text: t(lang, 'alignHint') }),
    editor.element,
    status,
    el('div', { className: 'actions' }, back, rotate, next))
}

/** Shows both straightened cards so the user can go back and fix a side. */
export function renderAlignResult (
  lang: Lang, state: AlignState,
  nav: { onEdit: (side: Side) => void }, signal: AbortSignal
): HTMLElement {
  const heading = el('h2', { text: t(lang, 'stepResult') })
  heading.tabIndex = -1
  const section = el('section', { className: 'step' }, heading, el('p', { className: 'hint', text: t(lang, 'resultHint') }))
  for (const side of ['front', 'back'] as const) {
    const canvas = state.warped[side]
    if (!canvas) continue
    canvas.className = 'card-result'
    canvas.id = `warped-${side}`
    const edit = button(t(lang, 'adjust'), 'button secondary', () => { nav.onEdit(side) }, signal)
    edit.id = `adjust-${side}`
    section.append(el('figure', { className: 'result' }, el('figcaption', { text: t(lang, side) }), canvas, edit))
  }
  section.append(el('p', { className: 'status', text: t(lang, 'nextNotReady') }))
  return section
}
