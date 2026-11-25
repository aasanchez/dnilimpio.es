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
  import { findCorners } from '../detect/corners.ts'
  import type { Side } from '../zones/types.ts'

  const { lang, side, size, bitmap, align, aligned, onSide, onDone }: {
    lang: Lang
    side: Side
    /** Size of the straightened document in pixels; also sets the starting frame's shape. */
    size: { readonly w: number; readonly h: number }
    bitmap: ImageBitmap
    align: AlignState
    /** Which sides already have confirmed corners. */
    aligned: Readonly<Record<Side, boolean>>
    onSide: (side: Side) => void
    onDone: () => void
  } = $props()

  const SIDES = ['front', 'back'] as const
  // Corners are looked for only the first time a photo reaches this step; after that the user's own
  // corners are kept.
  const fresh = untrack(() => align.quads[side] === null)
  let quad = $state.raw<Quad>(untrack(() => align.quads[side] ?? defaultQuad(bitmap.width, bitmap.height, size.w / size.h)))
  untrack(() => { align.quads[side] = quad })
  /** searching: the detector runs; found: its corners are shown; idle: manual (nothing to say). */
  let auto = $state<'idle' | 'searching' | 'found'>('idle')
  /** True once the user moved, rotated or reset the corners: a late detection then never overrides them. */
  let touched = false
  /** Which detector placed the corners, for the e2e tests ('' when none did). */
  let source = $state('')
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

  function userQuad (q: Quad): void {
    touched = true
    auto = 'idle'
    setQuad(q)
  }

  // Suggest corners. Any failure leaves the manual start position, with no message.
  $effect(() => {
    if (!fresh) return
    let live = true
    auto = 'searching'
    void findCorners(bitmap, size.w / size.h).then((found) => {
      if (!live || touched) return
      if (found) {
        setQuad(found.quad)
        editor?.setQuad(found.quad)
        auto = 'found'
        source = found.source
      } else {
        auto = 'idle'
      }
    })
    return () => { live = false }
  })

  /** The editor is an imperative canvas widget; Svelte only mounts it and keeps its label current. */
  function mountEditor (node: HTMLElement): () => void {
    const ac = new AbortController()
    const e = untrack(() => cornerEditor({ bitmap, quad, label, onChange: userQuad, signal: ac.signal }))
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
    userQuad(rotateQuad(quad))
    editor?.setQuad(quad)
  }

  function restart (): void {
    userQuad(defaultQuad(bitmap.width, bitmap.height, size.w / size.h))
    editor?.setQuad(quad)
  }

  function next (): void {
    if (!valid) return
    const q = quad
    resetSide(align, side)
    align.quads[side] = q
    align.warped[side] = warpBitmap(bitmap, q, size)
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
    <!-- data-corners / data-source: current corners in photo pixels and who placed them, for e2e tests. -->
    <div {@attach mountEditor} data-source={source} data-corners={quad.map((p) => `${String(Math.round(p.x))},${String(Math.round(p.y))}`).join(' ')}></div>
  </div>
  <p class="status" id="align-auto" role="status">{auto === 'searching' ? t(lang, 'cornersSearching') : auto === 'found' ? t(lang, 'cornersFound') : ''}</p>
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
