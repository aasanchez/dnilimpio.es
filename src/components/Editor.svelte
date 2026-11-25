<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 3: fields to hide, watermark, black and white, live preview (spec §12, §14, §15). -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { fieldsOf, masksFor, mrzLeaks } from '../engine/fields.ts'
  import { renderSecure } from '../engine/render.ts'
  import { toPixels } from '../redact/zones.ts'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import type { AlignState } from '../ui/align-state.ts'
  import type { EditState } from '../ui/edit-state.ts'
  import { DNI_4_0, type Side, type ZoneId } from '../zones/dni.ts'
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

  const fieldKey = (id: ZoneId): Key => `field_${id}`

  function toggle (id: ZoneId, on: boolean): void {
    edit.hidden = on ? [...new Set([...edit.hidden, id])] : edit.hidden.filter((x) => x !== id)
  }

  // Re-render both sides whenever a choice changes.
  $effect(() => {
    const opts = { greyscale: edit.greyscale, watermark: edit.watermark }
    for (const s of SIDES) {
      const card = align.warped[s]
      if (card) renderSecure(card, { ...opts, masks: masksFor(DNI_4_0, s, hidden) }, secure[s])
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
    <div class="editor">
      <div class="editor-preview">
        <div class="tabs">
          {#each SIDES as s (s)}
            <button type="button" class="tab" id="tab-{s}" aria-pressed={side === s} onclick={() => { side = s }}>{t(lang, s === 'front' ? 'tabFront' : 'tabBack')}</button>
          {/each}
        </div>
        <div role="img" aria-label={tf(lang, 'previewLabel', { side: t(lang, side === 'front' ? 'tabFront' : 'tabBack') })}>
          <canvas id="preview" class="card-result" bind:this={display} aria-hidden="true"></canvas>
        </div>
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
    <Review {lang} {secure} hiddenCount={hidden.size} watermark={edit.watermark} greyscale={edit.greyscale}
      onBack={() => { reviewing = false }} {onReset} />
  {/if}
</section>
