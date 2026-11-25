<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 2 (spec §4.2): mark the four card corners on one side. Front first, then back. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { isConvex, type Quad } from '../geometry/homography.ts'
  import { defaultQuad, rotateQuad } from '../geometry/quad-edit.ts'
  import { t, type Lang } from '../i18n/index.ts'
  import type { AlignState } from '../ui/align-state.ts'
  import { resetSide } from '../ui/align-state.ts'
  import { cornerEditor, type CornerEditor } from '../ui/corner-editor.ts'
  import { warpBitmap } from '../ui/warp-bitmap.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, side, bitmap, align, aligned, onSide, onDone }: {
    lang: Lang
    side: Side
    bitmap: ImageBitmap
    align: AlignState
    /** Which sides already have confirmed corners. */
    aligned: Readonly<Record<Side, boolean>>
    onSide: (side: Side) => void
    onDone: () => void
  } = $props()

  const SIDES = ['front', 'back'] as const
  let quad = $state.raw<Quad>(untrack(() => align.quads[side] ?? defaultQuad(bitmap.width, bitmap.height)))
  untrack(() => { align.quads[side] = quad })
  const valid = $derived(isConvex(quad))
  const sideName = (s: Side): string => t(lang, s === 'front' ? 'tabFront' : 'tabBack')
  const label = $derived(`${t(lang, 'editorLabel')}: ${sideName(side)}`)
  const other: Side = untrack(() => (side === 'front' ? 'back' : 'front'))
  const last = $derived(aligned[other])
  let editor: CornerEditor | undefined

  function setQuad (q: Quad): void {
    quad = q
    align.quads[side] = q
  }

  /** The editor is an imperative canvas widget; Svelte only mounts it and keeps its label current. */
  function mountEditor (node: HTMLElement): () => void {
    const ac = new AbortController()
    const e = untrack(() => cornerEditor({ bitmap, quad, label, onChange: setQuad, signal: ac.signal }))
    editor = e
    node.append(e.element)
    return () => {
      ac.abort()
      e.element.remove()
      editor = undefined
    }
  }

  $effect(() => { editor?.setLabel(label) })

  function rotate (): void {
    setQuad(rotateQuad(quad))
    editor?.setQuad(quad)
  }

  function restart (): void {
    setQuad(defaultQuad(bitmap.width, bitmap.height))
    editor?.setQuad(quad)
  }

  function next (): void {
    if (!valid) return
    const q = quad
    resetSide(align, side)
    align.quads[side] = q
    align.warped[side] = warpBitmap(bitmap, q)
    onDone()
  }
</script>

<section class="step">
  <div>
    <h2>{t(lang, side === 'front' ? 'alignFront' : 'alignBack')}</h2>
    <p class="lead">{t(lang, 'alignLead')}</p>
  </div>
  <div class="segmented" role="group" aria-label={t(lang, 'sides')}>
    {#each SIDES as s (s)}
      <button type="button" id="align-tab-{s}" aria-pressed={s === side} onclick={() => { if (s !== side) onSide(s) }}>
        {#if aligned[s]}<span class="tick" aria-hidden="true">✓</span>{/if}{sideName(s)}
      </button>
    {/each}
  </div>
  <div class="win">
    <div class="winbar"><i></i><i></i><i></i><span class="title">{sideName(side).toLowerCase()}.jpg</span></div>
    <div {@attach mountEditor}></div>
  </div>
  <p class="hint">{t(lang, 'alignHint')}</p>
  <p class="warning" id="align-status" role={valid ? 'status' : 'alert'} hidden={valid}>{valid ? '' : t(lang, 'cornersInvalid')}</p>

  <div class="actionbar">
    <div class="row">
      <button type="button" class="icon-btn" id="align-rotate" onclick={rotate}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 4v7h-7" /></svg>{t(lang, 'rotate')}
      </button>
      <button type="button" class="icon-btn" id="align-restart" onclick={restart}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="4" cy="4" r="1.5" /><circle cx="20" cy="20" r="1.5" /></svg>{t(lang, 'restartCorners')}
      </button>
      <button type="button" class="button primary" id="align-continue" disabled={!valid} onclick={next}>
        {t(lang, last ? 'cornersDone' : side === 'front' ? 'cornersDoneNextBack' : 'cornersDoneNextFront')} <span class="flip" aria-hidden="true">→</span>
      </button>
    </div>
  </div>
</section>
