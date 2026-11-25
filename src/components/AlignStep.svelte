<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 2 (spec §4.2): mark the four card corners on one side. -->
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

  const { lang, side, bitmap, align, onBack, onDone }: {
    lang: Lang
    side: Side
    bitmap: ImageBitmap
    align: AlignState
    onBack: () => void
    onDone: () => void
  } = $props()

  let quad = $state.raw<Quad>(untrack(() => align.quads[side] ?? defaultQuad(bitmap.width, bitmap.height)))
  untrack(() => { align.quads[side] = quad })
  const valid = $derived(isConvex(quad))
  const label = $derived(`${t(lang, 'editorLabel')}: ${t(lang, side)}`)
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
  <h2 tabindex="-1">{t(lang, 'stepAlign')}</h2>
  <h3>{t(lang, side)}</h3>
  <p class="hint">{t(lang, 'alignHint')}</p>
  <div {@attach mountEditor}></div>
  <p class="status" id="align-status" role={valid ? 'status' : 'alert'}>{valid ? '' : t(lang, 'cornersInvalid')}</p>
  <div class="actions">
    <button type="button" class="button secondary" id="align-back" onclick={onBack}>{t(lang, 'goBack')}</button>
    <button type="button" class="button secondary" id="align-rotate" onclick={rotate}>{t(lang, 'rotate')}</button>
    <button type="button" class="button" id="align-continue" disabled={!valid} onclick={next}>{t(lang, 'continue')}</button>
  </div>
</section>
