<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 3: choose what to hide, on the card itself or in the list (spec §12, §14, §15); then review
     and download (Review.svelte). The editor owns the sanitised rasters that both screens show. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { defaultHidden, fieldsOf, hasField, masksFor, mrzLeaks } from '../engine/fields.ts'
  import { renderSecure } from '../engine/render.ts'
  import { canRedo, canUndo, commit, redo, undo } from '../engine/history.ts'
  import { HANDLES, centredBox, fromPoints, grow, handlePoint, hitTest, isUsable, move, resize, type Handle, type Point } from '../engine/masks.ts'
  import { toPixels } from '../redact/zones.ts'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import type { AlignState } from '../ui/align-state.ts'
  import type { EditState, Phase } from '../ui/edit-state.ts'
  import type { ModelZones, Rect, Side, ZoneId } from '../zones/types.ts'
  import { overlap } from '../ocr/find.ts'
  import { WATERMARK_OPACITY, WATERMARK_SCALE, normaliseWatermark } from '../engine/watermark.ts'
  import Review from './Review.svelte'
  import SmartFind from './SmartFind.svelte'

  let { lang, doc, align, edit, phase = $bindable(), onAdjust, onReset, onPhase }: {
    lang: Lang
    /** The document's zone data. The editor is re-created when the document changes. */
    doc: ModelZones
    align: AlignState
    edit: EditState
    phase: Phase
    onAdjust: (side: Side) => void
    onReset: () => void
    /** Called after the phase changes, so the shell can move focus to the new heading. */
    onPhase: () => void
  } = $props()

  type Tool = 'fields' | 'boxes' | 'mark'
  const SIDES = ['front', 'back'] as const
  const TOOLS: ReadonlyArray<{ id: Tool; key: Key }> = [
    { id: 'fields', key: 'toolFields' },
    { id: 'boxes', key: 'toolBoxes' },
    { id: 'mark', key: 'toolMark' },
  ]
  // The shell re-creates the editor for another document, so these never change while it is mounted.
  const model = untrack(() => doc)
  const fields = fieldsOf(model)
  const recommended = [...defaultHidden(model)]
  const docName = $derived(t(lang, `doc_${model.model}`))
  const hidden = $derived(new Set<ZoneId>(edit.hidden))
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
  /** A pointer gesture: a box drag, or a tap on a field zone (toggled on release if it did not move). */
  let drag: { pointerId: number; start: Point; handle: Handle | null; origin: Rect | null; zone: ZoneId | null } | null = null
  const boxes = $derived(edit.boxes.present[side])
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
    for (const z of model.zones) {
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
    if (!o) draft = { index: null, rect: fromPoints(drag.start, p) }
    else if (drag.handle) draft = { index: selected, rect: resize(o, drag.handle, p) }
    else draft = { index: selected, rect: move(o, p.x - drag.start.x, p.y - drag.start.y) }
  }

  function onPointerUp (e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return
    const d = draft
    const zone = drag.zone
    const start = drag.start
    drag = null
    draft = null
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

  function pickTool (id: Tool): void {
    tool = id
    drawMode = false
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
      if (card) renderSecure(card, { ...opts, masks: [...masksFor(model, s, hidden), ...edit.boxes.present[s]] }, secure[s])
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
    ctx.drawImage(src, 0, 0)
    if (finalPreview) return
    ctx.setLineDash([18, 10])
    ctx.lineWidth = 5
    for (const z of model.zones) {
      if (z.side !== side || hidden.has(z.id)) continue
      for (const r of z.rects) {
        const p = toPixels(r, src.width, src.height)
        ctx.fillStyle = 'rgba(243, 103, 22, 0.1)'
        ctx.fillRect(p.x, p.y, p.w, p.h)
        ctx.strokeStyle = '#1f1a14'
        ctx.strokeRect(p.x, p.y, p.w, p.h)
        ctx.strokeStyle = '#f36716'
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
</script>

{#if phase === 'edit'}
  <section class="step">
    <div class="heading-row">
      <h2>{t(lang, 'hideTitle')}</h2>
      <span class="count" id="hidden-count">{tf(lang, 'hiddenCount', { hidden: hidden.size, total: fields.length })}</span>
    </div>
    <div class="segmented" role="group" aria-label={t(lang, 'sides')}>
      {#each SIDES as s (s)}
        <button type="button" id="tab-{s}" aria-pressed={side === s} onclick={() => { side = s; selected = null }}>{sideName(s)}</button>
      {/each}
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="win" onkeydown={onEditorKey}>
      <div class="winbar">
        <i></i><i></i><i></i><span class="title">{sideName(side).toLowerCase()}.jpg</span>
        <label class="chip"><input type="checkbox" id="final-preview" class="visually-hidden" bind:checked={finalPreview} />{finalPreview ? '◉' : '○'} {t(lang, 'finalPreview')}</label>
        <button type="button" class="chip" id="adjust-{side}" onclick={() => { onAdjust(side) }}>{t(lang, 'adjust')}</button>
      </div>
      <div class="winbody">
        <!-- role=application: the canvas is a pointer- and keyboard-operable editor (keys described in #box-hint). -->
        <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
        <canvas id="preview" class="card-result box-editor" class:is-drawing={drawMode} bind:this={display} tabindex="0" role="application"
          aria-label={tf(lang, 'previewLabel', { side: sideName(side) })}
          aria-describedby="box-hint"
          onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp}
          onkeydown={onKeyDown}></canvas>
      </div>
    </div>
    <p class="legend"><span class="legend-swatch" aria-hidden="true"></span>{t(lang, 'legendVisible')}</p>

    <div class="tools" role="tablist" aria-label={t(lang, 'tools')}>
      {#each TOOLS as tl (tl.id)}
        <button type="button" role="tab" id="tool-{tl.id}" aria-selected={tool === tl.id} aria-controls="panel-{tl.id}" onclick={() => { pickTool(tl.id) }}>{t(lang, tl.key)}</button>
      {/each}
    </div>

    <div class="panel" id="panel-fields" role="tabpanel" aria-labelledby="tool-fields" hidden={tool !== 'fields'}>
      <div class="chips scroll" role="group" aria-label={t(lang, 'presets')}>
        <button type="button" class="chip" id="preset-recommended" aria-pressed={sameSet(edit.hidden, recommended)} onclick={() => { edit.hidden = [...recommended] }}>{t(lang, 'presetRecommended')}</button>
        <button type="button" class="chip" id="hide-all" aria-pressed={hidden.size === fields.length} onclick={() => { edit.hidden = fields.map((f) => f.id) }}>{t(lang, 'hideAll')}</button>
        <button type="button" class="chip" id="restore-all" aria-pressed={hidden.size === 0} onclick={() => { edit.hidden = [] }}>{t(lang, 'restoreAll')}</button>
      </div>
      <ul class="fields" aria-label={t(lang, 'fieldsToHide')}>
        {#each sideFields as f (f.id)}
          <li>
            <label class="toggle">
              <span class="toggle-text">
                <span class="toggle-label">{t(lang, fieldKey(f.id))}</span>
                {#if f.sides.length > 1}<span class="toggle-note">{t(lang, 'bothSides')}</span>{/if}
              </span>
              <span class="toggle-state" class:is-on={hidden.has(f.id)} aria-hidden="true">{t(lang, hidden.has(f.id) ? 'stateHidden' : 'stateVisible')}</span>
              <input type="checkbox" role="switch" class="switch" id="field-{f.id}" checked={hidden.has(f.id)}
                onchange={(e) => { toggle(f.id, e.currentTarget.checked) }} />
            </label>
          </li>
        {/each}
      </ul>
      <div aria-live="polite" class="panel">
        {#if hasField(model, 'can') && !hidden.has('can')}<p class="warning" id="can-warning">{t(lang, 'canWarning')}</p>{/if}
        {#if mrzLeaks(model, hidden)}<p class="warning" id="mrz-warning">{t(lang, 'mrzWarning')}</p>{/if}
      </div>
      <p class="hint">{tf(lang, 'positionsHint', { doc: docName })}</p>
      <SmartFind {lang} {cards} onFound={addFound} />
    </div>

    <div class="panel" id="panel-boxes" role="tabpanel" aria-labelledby="tool-boxes" hidden={tool !== 'boxes'}>
      <div class="box">
        <p class="hint" id="box-hint">{t(lang, 'boxHint')}</p>
        <div class="box-actions" role="group" aria-label={t(lang, 'boxesLabel')}>
          <button type="button" class="button small" id="draw-box" aria-pressed={drawMode} disabled={finalPreview} onclick={() => { drawMode = !drawMode }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M12 9v6M9 12h6" /></svg>
            {t(lang, 'drawBox')}
          </button>
          <button type="button" class="button small" id="add-box" disabled={finalPreview} onclick={addBox}>{t(lang, 'addBox')}</button>
          <span class="spacer"></span>
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
        <p class="count">{tf(lang, 'boxCount', { n: boxes.length })}</p>
      </div>
    </div>

    <div class="panel" id="panel-mark" role="tabpanel" aria-labelledby="tool-mark" hidden={tool !== 'mark'}>
      <div class="box">
        <label class="field" for="watermark">{t(lang, 'watermarkLabel')}</label>
        <input type="text" id="watermark" class="text" bind:value={edit.watermark} maxlength="200" autocomplete="off" spellcheck="false" aria-describedby="watermark-hint" />
        <div class="chips scroll" role="group" aria-label={t(lang, 'suggestions')}>
          {#each [t(lang, 'wmRental'), t(lang, 'wmBank'), tf(lang, 'wmDated', { date: today })] as s (s)}
            <button type="button" class="chip" onclick={() => { edit.watermark = s }}>{s}</button>
          {/each}
        </div>
        <p class="hint" id="watermark-hint">{t(lang, 'watermarkHint')}</p>
        <!-- Size and opacity: applied live to the preview; disabled until there is text to draw. -->
        <div class="slider">
          <label class="field" for="watermark-size">{t(lang, 'watermarkSize')}</label>
          <output for="watermark-size" id="watermark-size-value">{percent.format(edit.watermarkScale)}</output>
          <input type="range" id="watermark-size" class="range" disabled={!hasMark}
            min={WATERMARK_SCALE.min} max={WATERMARK_SCALE.max} step={WATERMARK_SCALE.step}
            bind:value={edit.watermarkScale} aria-valuetext={percent.format(edit.watermarkScale)} />
        </div>
        <div class="slider">
          <label class="field" for="watermark-opacity">{t(lang, 'watermarkOpacity')}</label>
          <output for="watermark-opacity" id="watermark-opacity-value">{percent.format(edit.watermarkOpacity)}</output>
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

    <div class="actionbar">
      <button type="button" class="button primary" id="review" onclick={() => { setPhase('review') }}>{t(lang, 'review')} <span class="flip" aria-hidden="true">→</span></button>
    </div>
  </section>
{:else}
  <Review {lang} {secure} {phase} hiddenCount={hidden.size} boxCount={edit.boxes.present.front.length + edit.boxes.present.back.length} watermark={edit.watermark} greyscale={edit.greyscale}
    onDone={() => { setPhase('done') }} {onReset} />
{/if}
