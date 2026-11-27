<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 3: choose what to hide, on the card itself or in the list (spec §12, §14, §15); then review
     and download (Review.svelte). The editor owns the sanitised rasters that both screens show. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { fieldsOn, hasField, masksFor, mrzLeaks, placeZones, sideRects } from '../engine/fields.ts'
  import { renderSecure } from '../engine/render.ts'
  import { canRedo, canUndo, commit, redo, undo } from '../engine/history.ts'
  import { HANDLES, centredBox, fromPoints, grow, handlePoint, hitTest, isUsable, move, resize, type Handle, type Point } from '../engine/masks.ts'
  import { toPixels } from '../redact/zones.ts'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import type { AlignState } from '../ui/align-state.ts'
  import type { EditState, Phase } from '../ui/edit-state.ts'
  import type { ModelZones, Rect, Side, ZoneId } from '../zones/types.ts'
  import { isDni, type DniVersion } from '../zones/documents.ts'
  import { overlap } from '../ocr/find.ts'
  import { WATERMARK_OPACITY, WATERMARK_SCALE, normaliseWatermark } from '../engine/watermark.ts'
  import Review from './Review.svelte'
  import SmartFind from './SmartFind.svelte'
  import FitZones from './FitZones.svelte'
  import { fitSide } from '../engine/snap.ts'
  import { shrink } from '../engine/wipe.ts'

  let { lang, doc, align, edit, dniFound, phase = $bindable(), onDniVersion, onAdjust, onReset, onFinish, onPhase, onGuide }: {
    lang: Lang
    /** The document's zone data. The editor is re-created when the document changes. */
    doc: ModelZones
    /** For a DNI: false when its version could not be detected and the default layout (4.0) is in use. */
    dniFound: boolean
    /** Switches to the other DNI layout (the "Older DNI (3.0)" switch). */
    onDniVersion: (version: DniVersion) => void
    align: AlignState
    edit: EditState
    phase: Phase
    onAdjust: (side: Side) => void
    onReset: () => void
    /** "Clear everything" on the done screen (Review.svelte). */
    onFinish: () => void
    /** Called after the phase changes, so the shell can move focus to the new heading. */
    onPhase: () => void
    /** Opens the card guide on this field's entry. */
    onGuide: (field: ZoneId) => void
  } = $props()

  type Tool = 'fields' | 'boxes' | 'mark'
  const TOOLS: ReadonlyArray<{ id: Tool; key: Key }> = [
    { id: 'fields', key: 'toolFields' },
    { id: 'boxes', key: 'toolBoxes' },
    { id: 'mark', key: 'toolMark' },
  ]
  // The shell re-creates the editor for another document, so these never change while it is mounted.
  const model = untrack(() => doc)
  /**
   * The sides with a straightened card, front first. The back is optional: with the front alone, the
   * editor, the review and the PDF have one side. The shell re-creates the editor when this changes.
   */
  const SIDES = untrack(() => (['front', 'back'] as const).filter((s) => align.warped[s] !== null))
  const fields = fieldsOn(model, SIDES)
  const fieldIds = new Set(fields.map((f) => f.id))
  const recommended = fields.filter((f) => f.hiddenByDefault).map((f) => f.id)
  const docName = $derived(t(lang, `doc_${model.model}`))
  /**
   * Hidden fields on the sides in use. `edit.hidden` keeps choices for a side left out (a back-only
   * field stays ticked), so they apply again if the back photo is added later.
   */
  const hidden = $derived(new Set<ZoneId>(edit.hidden.filter((id) => fieldIds.has(id))))
  let side = $state<Side>('front')
  let tool = $state<Tool>('fields')
  const sideFields = $derived(fields.filter((f) => f.sides.includes(side)))
  let finalPreview = $state(false)
  let display: HTMLCanvasElement | undefined = $state()
  /** Sanitised rasters, one per side: the only images the preview, the review and the PDF use. */
  const secure: Record<Side, HTMLCanvasElement> = { front: document.createElement('canvas'), back: document.createElement('canvas') }
  let version = $state(0)
  let drawMode = $state(false)
  /** Index of the selected manual box on the current side. */
  let selected = $state<number | null>(null)
  /** Box being drawn, moved or resized; shown as an outline until the pointer is released. */
  let draft = $state<{ index: number | null; rect: Rect } | null>(null)
  /**
   * A pointer gesture: a box drag, a field box drag while adjusting (`key`), or a tap on a field zone
   * (toggled on release if it did not move).
   */
  let drag: { pointerId: number; start: Point; handle: Handle | null; origin: Rect | null; zone: ZoneId | null; key?: string } | null = null
  const boxes = $derived(edit.boxes.present[side])
  /** Template zones with the user's moves and resizes applied: what the copy hides. */
  const placed = $derived(placeZones(model, edit.placement))
  /** Adjusting: the field boxes of this side can be selected, moved and resized on the card. */
  let adjusting = $state(false)
  /** Placement key of the selected field box, while adjusting. */
  let selectedZone = $state<string | null>(null)
  /** Field box being moved or resized; shown until the pointer is released. */
  let zoneDraft = $state<{ key: string; rect: Rect } | null>(null)
  const zoneList = $derived(sideRects(placed, side))
  const zoneIndex = $derived.by(() => {
    const i = zoneList.findIndex((z) => z.key === selectedZone)
    return i < 0 ? null : i
  })
  const selectedPlaced = $derived(zoneIndex === null ? undefined : zoneList[zoneIndex])
  const moved = $derived(Object.keys(edit.placement).length > 0)
  const share = $derived(new Intl.NumberFormat(lang, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }))
  const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x))
  const sideName = (s: Side): string => t(lang, s === 'front' ? 'tabFront' : 'tabBack')
  const percent = $derived(new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }))
  const hasMark = $derived(normaliseWatermark(edit.watermark) !== '')
  const today = $derived(new Date().toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }))

  function setBoxes (list: readonly Rect[]): void {
    edit.boxes = commit(edit.boxes, { ...edit.boxes.present, [side]: list })
  }

  /** Smart find results: one undoable step that adds every new rectangle, skipping ones a box already covers. */
  function addFound (found: ReadonlyArray<{ side: Side; rects: Rect[] }>): number {
    const next = { front: [...edit.boxes.present.front], back: [...edit.boxes.present.back] }
    let n = 0
    for (const { side: s, rects } of found) {
      for (const r of rects) {
        if (next[s].some((b) => overlap(b, r) > 0.5)) continue
        next[s].push(r)
        n++
      }
    }
    if (n > 0) {
      edit.boxes = commit(edit.boxes, next)
      selected = null
    }
    return n
  }
  const cards = $derived(SIDES.flatMap((s) => (align.warped[s] ? [[s, align.warped[s]] as const] : [])))

  function place (key: string, rect: Rect): void {
    edit.placement = { ...edit.placement, [key]: rect }
  }

  /**
   * Fit to the text: the ticked fields' boxes, as placed now, grow to cover the words found next to
   * them. One step that Back to original position undoes, like a hand adjustment.
   */
  function fitToText (found: ReadonlyArray<{ side: Side; words: Rect[] }>): number {
    let next = { ...edit.placement }
    for (const { side: s, words } of found) next = { ...next, ...fitSide(placed, s, words, hidden) }
    const n = Object.keys(next).filter((k) => next[k] !== edit.placement[k]).length
    if (n > 0) {
      edit.placement = next
      zoneDraft = null
    }
    return n
  }

  function resetPlacement (): void {
    edit.placement = {}
    zoneDraft = null
  }

  function setAdjusting (on: boolean): void {
    adjusting = on
    selectedZone = null
    zoneDraft = null
    if (on) display?.focus()
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

  /** The field whose printed zone on this side contains the point, if any. */
  function zoneAt (p: Point): ZoneId | null {
    for (const z of placed.zones) {
      if (z.side !== side) continue
      if (z.rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)) return z.id
    }
    return null
  }

  function onPointerDown (e: PointerEvent): void {
    if (drag || !e.isPrimary || finalPreview) return
    const canvas = e.currentTarget as HTMLCanvasElement
    const p = toCard(e)
    const r = canvas.getBoundingClientRect()
    const tolPx = e.pointerType === 'touch' ? 24 : 12
    if (adjusting) {
      const zh = hitTest(zoneList.map((z) => z.rect), zoneIndex, p, tolPx / r.width, tolPx / r.height)
      const z = zh ? zoneList[zh.index] : undefined
      selectedZone = z?.key ?? null
      if (!zh || !z) return
      drag = { pointerId: e.pointerId, start: p, handle: zh.handle, origin: z.rect, zone: null, key: z.key }
      e.preventDefault()
      canvas.focus()
      try { canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events cannot be captured */ }
      return
    }
    const hit = hitTest(boxes, selected, p, tolPx / r.width, tolPx / r.height)
    if (hit) {
      selected = hit.index
      drag = { pointerId: e.pointerId, start: p, handle: hit.handle, origin: boxes[hit.index] ?? null, zone: null }
    } else if (drawMode) {
      selected = null
      drag = { pointerId: e.pointerId, start: p, handle: null, origin: null, zone: null }
    } else {
      selected = null
      const zone = zoneAt(p)
      if (!zone) return
      drag = { pointerId: e.pointerId, start: p, handle: null, origin: null, zone }
    }
    e.preventDefault()
    // preventDefault() also stops the click from moving focus; focus the canvas so the keys work next.
    canvas.focus()
    try { canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events cannot be captured */ }
  }

  function onPointerMove (e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId || drag.zone) return
    e.preventDefault()
    const p = toCard(e)
    const o = drag.origin
    if (drag.key && o) {
      zoneDraft = { key: drag.key, rect: drag.handle ? resize(o, drag.handle, p) : move(o, p.x - drag.start.x, p.y - drag.start.y) }
      return
    }
    if (!o) draft = { index: null, rect: fromPoints(drag.start, p) }
    else if (drag.handle) draft = { index: selected, rect: resize(o, drag.handle, p) }
    else draft = { index: selected, rect: move(o, p.x - drag.start.x, p.y - drag.start.y) }
  }

  function onPointerUp (e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return
    const d = draft
    const zone = drag.zone
    const start = drag.start
    const zd = drag.key ? zoneDraft : null
    drag = null
    draft = null
    zoneDraft = null
    if (zd) {
      if (e.type === 'pointerup') place(zd.key, zd.rect)
      return
    }
    if (zone) {
      // A tap toggles the field; a slide that left the zone does nothing.
      const p = toCard(e)
      if (e.type === 'pointerup' && Math.hypot(p.x - start.x, p.y - start.y) < 0.03) toggle(zone, !hidden.has(zone))
      return
    }
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
    if (adjusting) {
      const z = selectedPlaced
      if (d && z) {
        e.preventDefault()
        place(z.key, e.shiftKey ? grow(z.rect, d[0] * step, d[1] * step) : move(z.rect, d[0] * step, d[1] * step))
      } else if ((e.key === 'n' || e.key === 'N') && zoneList.length > 0) {
        e.preventDefault()
        selectedZone = zoneList[zoneIndex === null ? 0 : (zoneIndex + 1) % zoneList.length]?.key ?? null
      } else if (e.key === 'Escape' && z) {
        e.preventDefault()
        selectedZone = null
      }
      return
    }
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

  /**
   * A preset (Recommended, Hide all, Show all) for the fields on the sides in use. Choices for a side
   * left out (a skipped back) stay as they are, so adding the back later keeps its protection.
   */
  function setHere (ids: readonly ZoneId[]): void {
    edit.hidden = [...edit.hidden.filter((id) => !fieldIds.has(id)), ...ids]
  }

  function toggle (id: ZoneId, on: boolean): void {
    edit.hidden = on ? [...new Set([...edit.hidden, id])] : edit.hidden.filter((x) => x !== id)
  }

  function pickTool (id: Tool): void {
    tool = id
    drawMode = false
    if (adjusting) setAdjusting(false)
  }

  function setPhase (p: Phase): void {
    phase = p
    onPhase()
  }

  // Re-render both sides whenever a choice changes.
  $effect(() => {
    const opts = {
      greyscale: edit.greyscale,
      watermark: edit.watermark,
      watermarkStyle: { scale: edit.watermarkScale, opacity: edit.watermarkOpacity },
    }
    for (const s of SIDES) {
      const card = align.warped[s]
      if (card) renderSecure(card, { ...opts, masks: [...masksFor(placed, s, hidden), ...edit.boxes.present[s]] }, secure[s])
    }
    version = untrack(() => version) + 1
  })

  // Display copy of the current side. Outside the final preview, fields left visible get a dashed
  // orange outline (a pattern, not only a colour). The outlines never reach the sanitised raster.
  $effect(() => {
    if (version === 0) return // nothing rendered yet; also subscribes to re-renders
    const src = secure[side]
    if (!display || src.width === 0) return
    display.width = src.width
    display.height = src.height
    const ctx = display.getContext('2d')
    if (!ctx) return
    // While adjusting, show the straightened photo without the fills, so the person can see what each
    // box has to cover; hidden fields and manual boxes are drawn see-through instead. This copy is
    // only on screen: the review and the PDF always use the sanitised raster.
    const raw = adjusting && !finalPreview ? align.warped[side] : undefined
    ctx.drawImage(raw ?? src, 0, 0, src.width, src.height)
    if (finalPreview) return
    const w = src.width
    const h = src.height
    if (raw) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      for (const b of boxes) ctx.fillRect(b.x * w, b.y * h, b.w * w, b.h * h)
    }
    ctx.setLineDash([18, 10])
    ctx.lineWidth = 5
    for (const z of adjusting ? zoneList : zoneList.filter((x) => !hidden.has(x.id))) {
      const isHidden = hidden.has(z.id)
      const p = toPixels(zoneDraft?.key === z.key ? zoneDraft.rect : z.rect, w, h)
      ctx.fillStyle = isHidden ? 'rgba(0, 0, 0, 0.55)' : 'rgba(243, 103, 22, 0.1)'
      ctx.fillRect(p.x, p.y, p.w, p.h)
      ctx.strokeStyle = '#1f1a14'
      ctx.strokeRect(p.x, p.y, p.w, p.h)
      ctx.strokeStyle = isHidden ? '#fbf9f4' : '#f36716'
      ctx.lineDashOffset = 14
      ctx.strokeRect(p.x, p.y, p.w, p.h)
      ctx.lineDashOffset = 0
    }
    // Selected box and the box being drawn: solid outline with corner handles.
    const outline = (r: Rect, handles: boolean): void => {
      ctx.setLineDash([])
      for (const [lw, c] of [[7, '#fbf9f4'], [3, '#f36716']] as const) {
        ctx.lineWidth = lw
        ctx.strokeStyle = c
        ctx.strokeRect(r.x * w, r.y * h, r.w * w, r.h * h)
      }
      if (!handles) return
      for (const hd of HANDLES) {
        const p = handlePoint(r, hd)
        ctx.fillStyle = '#fbf9f4'
        ctx.fillRect(p.x * w - 12, p.y * h - 12, 24, 24)
        ctx.strokeStyle = '#1f1a14'
        ctx.strokeRect(p.x * w - 12, p.y * h - 12, 24, 24)
      }
    }
    if (adjusting) {
      const z = selectedPlaced
      if (z) outline(zoneDraft?.key === z.key ? zoneDraft.rect : z.rect, true)
      return
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
  $effect(() => () => { shrink(secure.front, secure.back) })

  // The on-screen copy too: when it leaves the screen (review, Reset, adjusting corners).
  $effect(() => {
    const d = display
    return () => { shrink(d) }
  })
</script>

{#if phase === 'edit'}
  <section class="step split flex-1">
    <div class="area-head flex flex-col gap-4">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <h2>{t(lang, 'hideTitle')}</h2>
        <span class="count font-mono text-xs text-muted" id="hidden-count">{tf(lang, 'hiddenCount', { hidden: hidden.size, total: fields.length })}</span>
      </div>
      {#if SIDES.length > 1}
        <div class="segmented" role="group" aria-label={t(lang, 'sides')}>
          {#each SIDES as s (s)}
            <button type="button" id="tab-{s}" aria-pressed={side === s} onclick={() => { side = s; selected = null; selectedZone = null }}>{sideName(s)}</button>
          {/each}
        </div>
      {:else}
        <!-- The back photo was skipped: one side only, so no side tabs. -->
        <p class="hint" id="front-only">{t(lang, 'frontOnly')}</p>
      {/if}
    </div>

    <div class="area-stage flex flex-col gap-3">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="panel" onkeydown={onEditorKey}>
        <div class="panel-bar">
          <label class="chip"><input type="checkbox" id="final-preview" class="sr-only" bind:checked={finalPreview} />{finalPreview ? '◉' : '○'} {t(lang, 'finalPreview')}</label>
          <button type="button" class="chip" id="adjust-{side}" onclick={() => { onAdjust(side) }}>{t(lang, 'adjust')}</button>
        </div>
        <div class="panel-body">
          <!-- role=application: the canvas is a pointer- and keyboard-operable editor (keys described in #box-hint). -->
          <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
          <canvas id="preview" class="block h-auto w-full cursor-pointer touch-none rounded-md select-none [&.is-drawing]:cursor-crosshair" class:is-drawing={drawMode} bind:this={display} tabindex="0" role="application"
            aria-label={tf(lang, 'previewLabel', { side: sideName(side) })}
            aria-describedby={adjusting ? 'adjust-hint' : 'box-hint'}
            onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp}
            onkeydown={onKeyDown}></canvas>
        </div>
      </div>
      <p class="flex items-center gap-2 text-sm text-muted"><span class="inline-block h-2.75 w-4.5 flex-none rounded-xs border-2 border-dashed border-accent" aria-hidden="true"></span>{t(lang, adjusting ? 'legendAdjust' : 'legendVisible')}</p>
    </div>

    <div class="area-side flex flex-col gap-4">
      <div class="tabs" role="tablist" aria-label={t(lang, 'tools')}>
        {#each TOOLS as tl (tl.id)}
          <button type="button" role="tab" id="tool-{tl.id}" aria-selected={tool === tl.id} aria-controls="panel-{tl.id}" onclick={() => { pickTool(tl.id) }}>{t(lang, tl.key)}</button>
        {/each}
      </div>

      <div class="flex flex-col gap-3" id="panel-fields" role="tabpanel" aria-labelledby="tool-fields" hidden={tool !== 'fields'}>
        <div class="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="group" aria-label={t(lang, 'presets')}>
          <button type="button" class="chip" id="preset-recommended" aria-pressed={sameSet([...hidden], recommended)} onclick={() => { setHere(recommended) }}>{t(lang, 'presetRecommended')}</button>
          <button type="button" class="chip" id="hide-all" aria-pressed={hidden.size === fields.length} onclick={() => { setHere(fields.map((f) => f.id)) }}>{t(lang, 'hideAll')}</button>
          <button type="button" class="chip" id="restore-all" aria-pressed={hidden.size === 0} onclick={() => { setHere([]) }}>{t(lang, 'restoreAll')}</button>
        </div>
        <ul class="rows" aria-label={t(lang, 'fieldsToHide')}>
          {#each sideFields as f (f.id)}
            <li class="flex items-center">
              <label class="toggle min-w-0 flex-1">
                <span class="toggle-text">
                  <span class="toggle-label">{t(lang, fieldKey(f.id))}</span>
                  {#if f.sides.length > 1}<span class="toggle-note">{t(lang, 'bothSides')}</span>{/if}
                </span>
                <span class="min-w-[4.5em] text-end font-mono text-[0.6875rem] font-bold {hidden.has(f.id) ? 'text-ink' : 'text-accent-text'}" aria-hidden="true">{t(lang, hidden.has(f.id) ? 'stateHidden' : 'stateVisible')}</span>
                <input type="checkbox" role="switch" class="switch" id="field-{f.id}" checked={hidden.has(f.id)}
                  onchange={(e) => { toggle(f.id, e.currentTarget.checked) }} />
              </label>
              <!-- Outside the label, so it never toggles the field. -->
              <button type="button" class="icon-btn me-1.5 flex-none text-muted" id="about-{f.id}" aria-label={tf(lang, 'guideAbout', { field: t(lang, fieldKey(f.id)) })} onclick={() => { onGuide(f.id) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
              </button>
            </li>
          {/each}
        </ul>
        <div aria-live="polite" class="flex flex-col gap-3 empty:hidden">
          {#if hasField(model, 'can', SIDES) && !hidden.has('can')}<p class="notice-warn" id="can-warning">{t(lang, 'canWarning')}</p>{/if}
          {#if mrzLeaks(model, hidden, SIDES)}<p class="notice-warn" id="mrz-warning">{t(lang, 'mrzWarning')}</p>{/if}
        </div>
        <p class="hint">{tf(lang, 'positionsHint', { doc: docName })}</p>
        {#if isDni(model.model)}
          <!-- One "DNI" in the picker: the version comes from detection, else 4.0. This switch fixes a wrong layout. -->
          <ul class="rows">
            <li>
            <label class="toggle">
              <span class="toggle-text">
                <span class="toggle-label">{t(lang, 'dniOlder')}</span>
                <span class="toggle-note">{t(lang, 'dniOlderHint')}</span>
              </span>
              <input type="checkbox" role="switch" class="switch" id="dni-older" checked={model.model === 'dni-3.0'}
                onchange={(e) => { onDniVersion(e.currentTarget.checked ? 'dni-3.0' : 'dni-4.0') }} />
            </label>
            </li>
          </ul>
          {#if !dniFound}<p class="hint" id="dni-guessed">{t(lang, 'dniGuessed')}</p>{/if}
        {/if}
        <!-- Adjust: move or resize the field boxes by hand when the template sits a little off the card. -->
        <div class="panel-box">
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="button small" id="adjust-zones" aria-pressed={adjusting} disabled={finalPreview} onclick={() => { setAdjusting(!adjusting) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>
              {t(lang, 'adjustZones')}
            </button>
            <button type="button" class="button small" id="reset-zones" disabled={!moved} onclick={resetPlacement}>{t(lang, 'resetZones')}</button>
          </div>
          <FitZones {lang} {cards} disabled={finalPreview || hidden.size === 0} onFit={fitToText} />
          {#if adjusting}
            <p class="hint" id="adjust-hint">{t(lang, 'adjustHint')}</p>
            <p class="font-mono text-xs text-muted" id="zone-position" aria-live="polite">
              {#if selectedPlaced}
                {@const r = zoneDraft?.key === selectedPlaced.key ? zoneDraft.rect : selectedPlaced.rect}
                {tf(lang, 'zonePosition', { field: t(lang, fieldKey(selectedPlaced.id)), x: share.format(r.x), y: share.format(r.y), w: share.format(r.w), h: share.format(r.h) })}
              {/if}
            </p>
          {/if}
        </div>
        <SmartFind {lang} {cards} onFound={addFound} />
      </div>

      <div class="flex flex-col gap-3" id="panel-boxes" role="tabpanel" aria-labelledby="tool-boxes" hidden={tool !== 'boxes'}>
        <div class="panel-box">
          <p class="hint" id="box-hint">{t(lang, 'boxHint')}</p>
          <div class="flex flex-wrap items-center gap-2" role="group" aria-label={t(lang, 'boxesLabel')}>
            <button type="button" class="button small" id="draw-box" aria-pressed={drawMode} disabled={finalPreview} onclick={() => { drawMode = !drawMode }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M12 9v6M9 12h6" /></svg>
              {t(lang, 'drawBox')}
            </button>
            <button type="button" class="button small" id="add-box" disabled={finalPreview} onclick={addBox}>{t(lang, 'addBox')}</button>
            <span class="flex-1"></span>
            <button type="button" class="icon-btn" id="delete-box" aria-label={t(lang, 'deleteBox')} disabled={selected === null || finalPreview} onclick={deleteBox}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
            </button>
            <button type="button" class="icon-btn" id="undo" aria-label={t(lang, 'undo')} disabled={!canUndo(edit.boxes)} onclick={() => { history('undo') }}>
              <svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>
            </button>
            <button type="button" class="icon-btn" id="redo" aria-label={t(lang, 'redo')} disabled={!canRedo(edit.boxes)} onclick={() => { history('redo') }}>
              <svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></svg>
            </button>
          </div>
          <p class="count font-mono text-xs text-muted">{tf(lang, 'boxCount', { n: boxes.length })}</p>
        </div>
      </div>

      <div class="flex flex-col gap-3" id="panel-mark" role="tabpanel" aria-labelledby="tool-mark" hidden={tool !== 'mark'}>
        <div class="panel-box">
          <label class="font-bold" for="watermark">{t(lang, 'watermarkLabel')}</label>
          <input type="text" id="watermark" class="min-h-12 w-full rounded-md border-2 border-ink bg-paper px-3 text-base" bind:value={edit.watermark} maxlength="200" autocomplete="off" spellcheck="false" aria-describedby="watermark-hint" />
          <div class="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="group" aria-label={t(lang, 'suggestions')}>
            {#each [t(lang, 'wmRental'), t(lang, 'wmBank'), tf(lang, 'wmDated', { date: today })] as s (s)}
              <button type="button" class="chip" onclick={() => { edit.watermark = s }}>{s}</button>
            {/each}
          </div>
          <p class="hint" id="watermark-hint">{t(lang, 'watermarkHint')}</p>
          <!-- Size and opacity: applied live to the preview; disabled until there is text to draw. -->
          <div class="group grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1">
            <label class="font-bold group-has-[:disabled]:text-muted" for="watermark-size">{t(lang, 'watermarkSize')}</label>
            <output class="font-mono text-[0.8125rem] font-bold group-has-[:disabled]:text-muted" for="watermark-size" id="watermark-size-value">{percent.format(edit.watermarkScale)}</output>
            <input type="range" id="watermark-size" class="range" disabled={!hasMark}
              min={WATERMARK_SCALE.min} max={WATERMARK_SCALE.max} step={WATERMARK_SCALE.step}
              bind:value={edit.watermarkScale} aria-valuetext={percent.format(edit.watermarkScale)} />
          </div>
          <div class="group grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1">
            <label class="font-bold group-has-[:disabled]:text-muted" for="watermark-opacity">{t(lang, 'watermarkOpacity')}</label>
            <output class="font-mono text-[0.8125rem] font-bold group-has-[:disabled]:text-muted" for="watermark-opacity" id="watermark-opacity-value">{percent.format(edit.watermarkOpacity)}</output>
            <input type="range" id="watermark-opacity" class="range" disabled={!hasMark}
              min={WATERMARK_OPACITY.min} max={WATERMARK_OPACITY.max} step={WATERMARK_OPACITY.step}
              bind:value={edit.watermarkOpacity} aria-valuetext={percent.format(edit.watermarkOpacity)} />
          </div>
          <label class="toggle">
            <span class="toggle-text">
              <span class="toggle-label">{t(lang, 'greyscale')}</span>
              <span class="toggle-note">{t(lang, 'greyscaleHint')}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" id="greyscale" bind:checked={edit.greyscale} />
          </label>
        </div>
      </div>

      <button type="button" class="link-button" id="reset" onclick={onReset}>{t(lang, 'reset')}</button>
    </div>

    <div class="actionbar">
      <button type="button" class="button primary" id="review" onclick={() => { setPhase('review') }}>{t(lang, 'review')} <span class="flip" aria-hidden="true">→</span></button>
    </div>
  </section>
{:else}
  <Review {lang} {secure} sides={SIDES} {phase} hiddenCount={hidden.size} boxCount={SIDES.reduce((n, s) => n + edit.boxes.present[s].length, 0)} watermark={edit.watermark} greyscale={edit.greyscale}
    onDone={() => { setPhase('done') }} {onReset} {onFinish} />
{/if}
