<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Shows both straightened cards so the user can go back and fix a side. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import type { AlignState } from '../ui/align-state.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, align, onEdit }: { lang: Lang; align: AlignState; onEdit: (side: Side) => void } = $props()

  /** Places the existing card canvas right after the caption; nothing is copied. */
  const showCanvas = (side: Side) => (node: HTMLElement): (() => void) | undefined => {
    const canvas = align.warped[side]
    if (!canvas) return
    canvas.className = 'card-result'
    canvas.id = `warped-${side}`
    node.after(canvas)
    return () => { canvas.remove() }
  }
</script>

<section class="step">
  <h2 tabindex="-1">{t(lang, 'stepResult')}</h2>
  <p class="hint">{t(lang, 'resultHint')}</p>
  {#each ['front', 'back'] as const as side (side)}
    <figure class="result">
      <figcaption {@attach showCanvas(side)}>{t(lang, side)}</figcaption>
      <button type="button" class="button secondary" id="adjust-{side}" onclick={() => { onEdit(side) }}>{t(lang, 'adjust')}</button>
    </figure>
  {/each}
  <p class="status">{t(lang, 'nextNotReady')}</p>
</section>
