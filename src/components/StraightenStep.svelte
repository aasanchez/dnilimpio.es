<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Between the document choice and the editor: finds, turns and straightens both photos by itself
     (ADR 0012). A side whose card is not found goes to the manual corner screen; so does "Place the
     corners myself". Works offline: without the model, classic edge detection answers. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t, type Lang } from '../i18n/index.ts'
  import { autoAlign } from '../detect/auto-align.ts'
  import { defaultQuad } from '../geometry/quad-edit.ts'
  import type { AlignState } from '../ui/align-state.ts'
  import { resetSide } from '../ui/align-state.ts'
  import type { CaptureState } from '../ui/capture-state.ts'
  import { warpBitmap } from '../ui/warp-bitmap.ts'
  import type { ModelZones, Side } from '../zones/types.ts'

  const { lang, doc, size, photos, align, onDone, onManual }: {
    lang: Lang
    doc: ModelZones
    size: { readonly w: number; readonly h: number }
    photos: CaptureState
    align: AlignState
    /** Called when both sides are done; `missed` lists the sides whose card was not found. */
    onDone: (missed: Side[]) => void
    /** The person chose to place the corners by hand. */
    onManual: () => void
  } = $props()

  let closed = false
  $effect(() => () => { closed = true })

  void untrack(() => (async () => {
    const missed: Side[] = []
    for (const side of ['front', 'back'] as const) {
      const bitmap = photos[side]
      if (!bitmap) { missed.push(side); continue }
      // Already straightened for this document and photo (e.g. corners the person confirmed, then
      // only the other photo was replaced): keep it. A new photo or document clears it (App.svelte).
      if (align.warped[side]) continue
      let found = null
      try {
        found = await autoAlign(bitmap, doc, side, size)
      } catch {
        found = null
      }
      if (closed) return
      resetSide(align, side)
      if (found) {
        align.quads[side] = found.quad
        align.found[side] = found.source
        align.warped[side] = warpBitmap(bitmap, found.quad, size)
      } else {
        // The manual screen starts from its usual frame and does not search again.
        align.quads[side] = defaultQuad(bitmap.width, bitmap.height, size.w / size.h)
        missed.push(side)
      }
    }
    if (!closed) onDone(missed)
  })())
</script>

<section class="step">
  <div>
    <h2>{t(lang, 'straightenTitle')}</h2>
    <p class="lead" role="status" id="straighten-status">{t(lang, 'straightenLead')}</p>
  </div>
  <div class="actionbar">
    <div class="row">
      <button type="button" class="button" id="straighten-manual" onclick={() => { closed = true; onManual() }}>{t(lang, 'straightenManual')}</button>
    </div>
  </div>
</section>
