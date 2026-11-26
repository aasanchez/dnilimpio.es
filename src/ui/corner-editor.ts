// SPDX-License-Identifier: AGPL-3.0-or-later
// Corner editor (spec §4.2): the photo on a canvas with four draggable corner handles.
// Pointer Events cover mouse, pen and touch. While a corner is dragged, a magnifier shows the area
// under the finger. Keyboard: arrow keys move the selected corner (Shift = ×10), N selects the next one.

import type { Point, Quad } from '../geometry/homography.ts'
import { isConvex } from '../geometry/homography.ts'
import { moveCorner, nearestCorner } from '../geometry/quad-edit.ts'
import { el } from './dom.ts'
import { shrink } from '../engine/wipe.ts'

export interface CornerEditorOptions {
  readonly bitmap: ImageBitmap;
  readonly quad: Quad;
  readonly label: string;
  readonly onChange: (quad: Quad) => void;
  readonly signal: AbortSignal;
}

/** Handle radius and hit radius in CSS pixels. Touch gets a larger target than a mouse (WCAG 2.5.5). */
const HANDLE_R = 11
const HIT_R = { touch: 36, pen: 24, mouse: 18 } as const
const LOUPE_R = 64
const LOUPE_ZOOM = 3

export interface CornerEditor {
  readonly element: HTMLElement;
  /** Replaces the quad (e.g. after rotation) and redraws. Does not call onChange. */
  setQuad: (quad: Quad) => void;
  /** Updates the accessible name, e.g. after a language change. */
  setLabel: (label: string) => void;
}

export function cornerEditor (opts: CornerEditorOptions): CornerEditor {
  const { bitmap, label, onChange, signal } = opts
  const bw = bitmap.width
  const bh = bitmap.height
  let quad = opts.quad
  let active = 0
  let drag: { pointerId: number; dx: number; dy: number } | null = null

  const canvas = el('canvas', { className: 'corner-editor' })
  canvas.tabIndex = 0
  canvas.setAttribute('role', 'application')
  canvas.setAttribute('aria-label', label)
  const wrap = el('div', { className: 'corner-editor-wrap' }, canvas)

  /** Canvas pixels per CSS pixel, and source pixels per CSS pixel, from the current layout. */
  const metrics = (): { cssToCanvas: number; cssToSrc: number; rect: DOMRect } => {
    const rect = canvas.getBoundingClientRect()
    const w = rect.width > 0 ? rect.width : 1
    return { cssToCanvas: canvas.width / w, cssToSrc: bw / w, rect }
  }

  const layout = (): void => {
    const dpr = window.devicePixelRatio || 1
    const maxW = wrap.clientWidth
    const maxH = window.innerHeight * 0.55
    if (maxW <= 0) return
    const s = Math.min(maxW / bw, maxH / bh)
    // The bitmap is drawn at display resolution; full resolution is kept for the warp.
    canvas.width = Math.max(1, Math.round(bw * s * dpr))
    canvas.height = Math.max(1, Math.round(bh * s * dpr))
    draw()
  }

  const draw = (): void => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const k = canvas.width / bw // source → canvas
    const { cssToCanvas: u } = metrics()
    const pts = quad.map((p) => ({ x: p.x * k, y: p.y * k }))
    const [tl, tr, br, bl] = pts as [Point, Point, Point, Point]
    const valid = isConvex(quad)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    // Dim everything outside the card.
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.closePath()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fill('evenodd')

    const color = valid ? '#f36716' : '#e53935'
    ctx.lineJoin = 'round'
    // Outline: white halo under the coloured line keeps it visible on any background.
    for (const [w, c] of [[4 * u, '#ffffff'], [2 * u, color]] as const) {
      ctx.beginPath()
      ctx.moveTo(tl.x, tl.y)
      ctx.lineTo(tr.x, tr.y)
      ctx.lineTo(br.x, br.y)
      ctx.lineTo(bl.x, bl.y)
      ctx.closePath()
      ctx.lineWidth = w
      ctx.strokeStyle = c
      ctx.stroke()
    }
    // Top edge, thicker: tells the user which side ends up on top.
    for (const [w, c] of [[9 * u, '#ffffff'], [6 * u, color]] as const) {
      ctx.beginPath()
      ctx.moveTo(tl.x, tl.y)
      ctx.lineTo(tr.x, tr.y)
      ctx.lineWidth = w
      ctx.strokeStyle = c
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    pts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, HANDLE_R * u, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.fill()
      ctx.lineWidth = (i === active ? 4 : 2.5) * u
      ctx.strokeStyle = i === active ? color : '#ffffff'
      ctx.stroke()
      // Centre dot marks the exact point.
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.5 * u, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      if (i === active && document.activeElement === canvas) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, (HANDLE_R + 5) * u, 0, Math.PI * 2)
        ctx.setLineDash([4 * u, 3 * u])
        ctx.lineWidth = 2 * u
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()
        ctx.setLineDash([])
      }
    })

    if (drag) drawLoupe(ctx, pts[active] ?? tl, quad[active] ?? quad[0], u)
  }

  /** Magnified view of the area under the dragged corner, placed away from the finger. */
  const drawLoupe = (ctx: CanvasRenderingContext2D, at: Point, src: Point, u: number): void => {
    const r = LOUPE_R * u
    const margin = 12 * u
    const left = at.x > canvas.width / 2
    const cx = left ? margin + r : canvas.width - margin - r
    const cy = margin + r
    const srcR = (r / LOUPE_ZOOM) * (bw / canvas.width)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#000000'
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, src.x - srcR, src.y - srcR, 2 * srcR, 2 * srcR, cx - r, cy - r, 2 * r, 2 * r)
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(cx - r, cy)
    ctx.lineTo(cx + r, cy)
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx, cy + r)
    ctx.lineWidth = 1 * u
    ctx.strokeStyle = '#f36716'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.lineWidth = 3 * u
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }

  const toSrc = (e: PointerEvent): Point => {
    const { rect, cssToSrc } = metrics()
    return { x: (e.clientX - rect.left) * cssToSrc, y: (e.clientY - rect.top) * cssToSrc }
  }

  const set = (q: Quad): void => {
    quad = q
    onChange(quad)
    draw()
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (drag || !e.isPrimary) return
    const p = toSrc(e)
    const kind = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse'
    const hit = nearestCorner(quad, p, HIT_R[kind] * metrics().cssToSrc)
    if (hit === null) return
    e.preventDefault()
    active = hit
    const c = quad[hit] ?? p
    // Keep the grab offset so the corner does not jump under the finger.
    drag = { pointerId: e.pointerId, dx: c.x - p.x, dy: c.y - p.y }
    // Capture keeps the drag alive when the finger leaves the canvas. It throws for synthetic events.
    try { canvas.setPointerCapture(e.pointerId) } catch { /* drag still works inside the canvas */ }
    canvas.classList.add('is-dragging')
    draw()
  }, { signal })

  canvas.addEventListener('pointermove', (e) => {
    const p = toSrc(e)
    if (!drag) {
      if (e.pointerType === 'mouse') canvas.classList.toggle('is-over-handle', nearestCorner(quad, p, HIT_R.mouse * metrics().cssToSrc) !== null)
      return
    }
    if (e.pointerId !== drag.pointerId) return
    e.preventDefault()
    set(moveCorner(quad, active, { x: p.x + drag.dx, y: p.y + drag.dy }, bw, bh))
  }, { signal })

  const end = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointerId) return
    drag = null
    canvas.classList.remove('is-dragging')
    draw()
  }
  canvas.addEventListener('pointerup', end, { signal })
  canvas.addEventListener('pointercancel', end, { signal })

  canvas.addEventListener('keydown', (e) => {
    const step = (e.shiftKey ? 10 : 1) * metrics().cssToSrc
    const c = quad[active]
    if (!c) return
    const moves: Partial<Record<string, Point>> = {
      ArrowLeft: { x: c.x - step, y: c.y },
      ArrowRight: { x: c.x + step, y: c.y },
      ArrowUp: { x: c.x, y: c.y - step },
      ArrowDown: { x: c.x, y: c.y + step },
    }
    const target = moves[e.key]
    if (target) {
      e.preventDefault()
      set(moveCorner(quad, active, target, bw, bh))
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      active = (active + (e.shiftKey ? 3 : 1)) % 4
      draw()
    }
  }, { signal })
  canvas.addEventListener('focus', draw, { signal })
  canvas.addEventListener('blur', draw, { signal })

  const ro = new ResizeObserver(layout)
  ro.observe(wrap)
  window.addEventListener('resize', layout, { signal })
  // Closed (next side, Reset, leaving the page): stop observing and drop the photo's pixels.
  signal.addEventListener('abort', () => {
    ro.disconnect()
    shrink(canvas)
  }, { once: true })

  return {
    element: wrap,
    setQuad: (q: Quad) => {
      quad = q
      draw()
    },
    setLabel: (l: string) => { canvas.setAttribute('aria-label', l) },
  }
}
