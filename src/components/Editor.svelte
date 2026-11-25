<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 3: fields to hide, watermark, black and white, live preview (spec §12, §14, §15). -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { fieldsOf, masksFor, mrzLeaks } from '../engine/fields.ts'
  import { renderSecure } from '../engine/render.ts'
  import { canRedo, canUndo, commit, redo, undo } from '../engine/history.ts'
  import { HANDLES, centredBox, fromPoints, grow, handlePoint, hitTest, isUsable, move, resize, type Handle, type Point } from '../engine/masks.ts'
  import { toPixels } from '../redact/zones.ts'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import type { AlignState } from '../ui/align-state.ts'
  import type { EditState } from '../ui/edit-state.ts'
  import { DNI_4_0, type Rect, type Side, type ZoneId } from '../zones/dni.ts'
  import Review from './Review.svelte'

  const { lang, align, edit, onAdjust, onReset }: {
    lang: Lang
    align: AlignState
    edit: EditState
    onAdjust: (side: Side) => void
    onReset: () => void
  } = $props()

  const SIDES = ['front', 'back'] as const
  const fields = fieldsOf(DNI_4_0)
  const hidden = $derived(new Set<ZoneId>(edit.hidden))
  let side = $state<Side>('front')
  let finalPreview = $state(false)
  let reviewing = $state(false)
  let display: HTMLCanvasElement | undefined = $state()
  /** Sanitised rasters, one per side: the only images the preview, the review and the PDF use. */
  const secure: Record<Side, HTMLCanvasElement> = { front: document.createElement('canvas'), back: document.createElement('canvas') }
  let version = $state(0)
  let drawMode = $state(false)
  /** Index of the selected manual box on the current side. */
  let selected = $state<number | null>(null)
  /** Box being drawn, moved or resized; shown as an outline until the pointer is released. */
  let draft = $state<{ index: number | null; rect: Rect } | null>(null)
  let drag: { pointerId: number; start: Point; handle: Handle | null; origin: Rect | null } | null = null
  const boxes = $derived(edit.boxes.present[side])

  function setBoxes (list: readonly Rect[]): void {
    edit.boxes = commit(edit.boxes, { ...edit.boxes.present, [side]: list })
  }

  function history (op: 'undo' | 'redo'): void {
    edit.boxes = op === 'undo' ? undo(edit.boxes) : redo(edit.boxes)
    selected = null
  }

  function addBox (): void {
    setBoxes([...boxes, centredBox()])
    selected = boxes.length - 1
    display?.focus()
  }

  function deleteBox (): void {
    if (selected === null) return
    setBoxes(boxes.filter((_, i) => i !== selected))
    selected = null
  }

  /** Pointer position in normalised card coordinates. */
  function toCard (e: PointerEvent): Point {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  function onPointerDown (e: PointerEvent): void {
    if (drag || !e.isPrimary || finalPreview) return
    const canvas = e.currentTarget as HTMLCanvasElement
    const p = toCard(e)
    const r = canvas.getBoundingClientRect()
    const tolPx = e.pointerType === 'touch' ? 24 : 12
    const hit = hitTest(boxes, selected, p, tolPx / r.width, tolPx / r.height)
    if (hit) {
      selected = hit.index
      drag = { pointerId: e.pointerId, start: p, handle: hit.handle, origin: boxes[hit.index] ?? null }
    } else if (drawMode) {
      selected = null
      drag = { pointerId: e.pointerId, start: p, handle: null, origin: null }
    } else {
      selected = null
      return
    }
    e.preventDefault()
    try { canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events cannot be captured */ }
  }

  function onPointerMove (e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return
    e.preventDefault()
    const p = toCard(e)
    const o = drag.origin
    if (!o) draft = { index: null, rect: fromPoints(drag.start, p) }
    else if (drag.handle) draft = { index: selected, rect: resize(o, drag.handle, p) }
    else draft = { index: selected, rect: move(o, p.x - drag.start.x, p.y - drag.start.y) }
  }

  function onPointerUp (e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return
    const d = draft
    drag = null
    draft = null
    if (!d) return
    if (d.index === null) {
      if (!isUsable(d.rect)) return
      setBoxes([...boxes, d.rect])
      selected = boxes.length - 1
    } else {
      setBoxes(boxes.map((b, i) => (i === d.index ? d.rect : b)))
    }
  }

  function onKeyDown (e: KeyboardEvent): void {
    const step = e.shiftKey ? 0.02 : 0.005
    const dirs: Partial<Record<string, [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const d = dirs[e.key]
    const r = selected === null ? undefined : boxes[selected]
    if (d && r) {
      e.preventDefault()
      const next = e.shiftKey ? grow(r, d[0] * step, d[1] * step) : move(r, d[0] * step, d[1] * step)
      setBoxes(boxes.map((b, i) => (i === selected ? next : b)))
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && r) {
      e.preventDefault()
      deleteBox()
    } else if ((e.key === 'n' || e.key === 'N') && boxes.length > 0) {
      e.preventDefault()
      selected = selected === null ? 0 : (selected + 1) % boxes.length
    }
  }

  /** Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, anywhere in the editor except text fields. */
  function onEditorKey (e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.target instanceof HTMLInputElement) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey && canUndo(edit.boxes)) { e.preventDefault(); history('undo') }
    if (((k === 'z' && e.shiftKey) || k === 'y') && canRedo(edit.boxes)) { e.preventDefault(); history('redo') }
  }

  const fieldKey = (id: ZoneId): Key => `field_${id}`

  function toggle (id: ZoneId, on: boolean): void {
    edit.hidden = on ? [...new Set([...edit.hidden, id])] : edit.hidden.filter((x) => x !== id)
  }

  // Re-render both sides whenever a choice changes.
  $effect(() => {
    const opts = { greyscale: edit.greyscale, watermark: edit.watermark }
    for (const s of SIDES) {
      const card = align.warped[s]
      if (card) renderSecure(card, { ...opts, masks: [...masksFor(DNI_4_0, s, hidden), ...edit.boxes.present[s]] }, secure[s])
    }
    version = untrack(() => version) + 1
  })

  // Display copy of the current side. Outside the final preview, fields left visible get a dashed
  // outline (a pattern, not only a colour). The outlines never reach the sanitised raster.
  $effect(() => {
    if (version === 0) return // nothing rendered yet; also subscribes to re-renders
    const src = secure[side]
    if (!display || src.width === 0) return
    display.width = src.width
    display.height = src.height
    const ctx = display.getContext('2d')
    if (!ctx) return
    ctx.drawImage(src, 0, 0)
    if (finalPreview) return
    ctx.setLineDash([18, 10])
    ctx.lineWidth = 5
    for (const z of DNI_4_0.zones) {
      if (z.side !== side || hidden.has(z.id)) continue
      for (const r of z.rects) {
        const p = toPixels(r, src.width, src.height)
        ctx.strokeStyle = '#ffffff'
        ctx.strokeRect(p.x, p.y, p.w, p.h)
        ctx.strokeStyle = '#c62828'
        ctx.lineDashOffset = 14
        ctx.strokeRect(p.x, p.y, p.w, p.h)
        ctx.lineDashOffset = 0
      }
    }
    // Selected box and the box being drawn: solid outline with corner handles.
    const w = src.width
    const h = src.height
    const outline = (r: Rect, handles: boolean): void => {
      ctx.setLineDash([])
      for (const [lw, c] of [[7, '#ffffff'], [3, '#0b57d0']] as const) {
        ctx.lineWidth = lw
        ctx.strokeStyle = c
        ctx.strokeRect(r.x * w, r.y * h, r.w * w, r.h * h)
      }
      if (!handles) return
      for (const hd of HANDLES) {
        const p = handlePoint(r, hd)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(p.x * w - 12, p.y * h - 12, 24, 24)
        ctx.strokeRect(p.x * w - 12, p.y * h - 12, 24, 24)
      }
    }
    const sel = selected === null ? undefined : boxes[selected]
    if (draft) {
      if (draft.index === null) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fillRect(draft.rect.x * w, draft.rect.y * h, draft.rect.w * w, draft.rect.h * h)
      }
      outline(draft.rect, draft.index !== null)
    } else if (sel) {
      outline(sel, true)
    }
  })

  // Free the rasters when the editor goes away (Reset, or adjusting corners).
  $effect(() => () => {
    for (const s of SIDES) {
      secure[s].width = 0
      secure[s].height = 0
    }
  })

  async function openReview (): Promise<void> {
    reviewing = true
    await Promise.resolve()
    const h = document.getElementById('review-title')
    h?.focus()
    h?.scrollIntoView({ block: 'start' })
  }
</script>

<section class="step">
  <h2 tabindex="-1">{t(lang, 'stepEdit')}</h2>
  {#if !reviewing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="editor" onkeydown={onEditorKey}>
      <div class="editor-preview">
        <div class="tabs">
          {#each SIDES as s (s)}
            <button type="button" class="tab" id="tab-{s}" aria-pressed={side === s} onclick={() => { side = s; selected = null }}>{t(lang, s === 'front' ? 'tabFront' : 'tabBack')}</button>
          {/each}
        </div>
        <!-- role=application: the canvas is a keyboard-operable box editor (keys described in #box-hint). -->
        <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
        <canvas id="preview" class="card-result box-editor" class:is-drawing={drawMode} bind:this={display} tabindex="0" role="application"
          aria-label={tf(lang, 'previewLabel', { side: t(lang, side === 'front' ? 'tabFront' : 'tabBack') })}
          aria-describedby="box-hint"
          onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp}
          onkeydown={onKeyDown}></canvas>
        <div class="actions" role="group" aria-label={t(lang, 'boxesLabel')}>
          <button type="button" class="button secondary" id="draw-box" aria-pressed={drawMode} disabled={finalPreview} onclick={() => { drawMode = !drawMode }}>{t(lang, 'drawBox')}</button>
          <button type="button" class="button secondary" id="add-box" disabled={finalPreview} onclick={addBox}>{t(lang, 'addBox')}</button>
          <button type="button" class="button secondary" id="delete-box" disabled={selected === null || finalPreview} onclick={deleteBox}>{t(lang, 'deleteBox')}</button>
          <button type="button" class="button secondary" id="undo" disabled={!canUndo(edit.boxes)} onclick={() => { history('undo') }}>{t(lang, 'undo')}</button>
          <button type="button" class="button secondary" id="redo" disabled={!canRedo(edit.boxes)} onclick={() => { history('redo') }}>{t(lang, 'redo')}</button>
        </div>
        <p class="hint" id="box-hint">{t(lang, 'boxHint')}</p>
        <div class="actions">
          <label class="check"><input type="checkbox" id="final-preview" bind:checked={finalPreview} /> {t(lang, 'finalPreview')}</label>
          <button type="button" class="button secondary" id="adjust-{side}" onclick={() => { onAdjust(side) }}>{t(lang, 'adjust')}</button>
        </div>
      </div>

      <div class="editor-form">
        <fieldset class="fields">
          <legend>
            {t(lang, 'fieldsToHide')}
            <span class="count" id="hidden-count">{tf(lang, 'hiddenCount', { hidden: hidden.size, total: fields.length })}</span>
          </legend>
          <p class="hint">{t(lang, 'fieldsHint')}</p>
          {#each fields as f (f.id)}
            <label class="check">
              <input type="checkbox" id="field-{f.id}" checked={hidden.has(f.id)}
                onchange={(e) => { toggle(f.id, e.currentTarget.checked) }} />
              {t(lang, fieldKey(f.id))}
            </label>
          {/each}
          <div class="actions">
            <button type="button" class="button secondary" id="hide-all" onclick={() => { edit.hidden = fields.map((f) => f.id) }}>{t(lang, 'hideAll')}</button>
            <button type="button" class="button secondary" id="restore-all" onclick={() => { edit.hidden = [] }}>{t(lang, 'restoreAll')}</button>
          </div>
          <div aria-live="polite">
            {#if !hidden.has('can')}<p class="warning" id="can-warning">{t(lang, 'canWarning')}</p>{/if}
            {#if mrzLeaks(hidden)}<p class="warning" id="mrz-warning">{t(lang, 'mrzWarning')}</p>{/if}
          </div>
          <p class="hint">{t(lang, 'positionsHint')}</p>
        </fieldset>

        <label class="field" for="watermark">{t(lang, 'watermarkLabel')}</label>
        <input type="text" id="watermark" class="text" bind:value={edit.watermark} maxlength="200" autocomplete="off" spellcheck="false" aria-describedby="watermark-hint" />
        <p class="hint" id="watermark-hint">{t(lang, 'watermarkHint')}</p>

        <label class="check"><input type="checkbox" id="greyscale" bind:checked={edit.greyscale} /> {t(lang, 'greyscale')}</label>

        <div class="actions">
          <button type="button" class="button" id="review" onclick={openReview}>{t(lang, 'review')}</button>
          <button type="button" class="button secondary" id="reset" onclick={onReset}>{t(lang, 'reset')}</button>
        </div>
      </div>
    </div>
  {:else}
    <Review {lang} {secure} hiddenCount={hidden.size} boxCount={edit.boxes.present.front.length + edit.boxes.present.back.length} watermark={edit.watermark} greyscale={edit.greyscale}
      onBack={() => { reviewing = false }} {onReset} />
  {/if}
</section>
