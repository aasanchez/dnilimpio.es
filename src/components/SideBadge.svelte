<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Which side of the card is being captured, in large type: a small drawing of that side, its
  name and a "1/2" or "2/2" counter. Used on the Photos step and in the live camera.
-->
<script lang="ts">
  import { CARD_ASPECT } from '../capture/coach.ts'
  import { t, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'
  import GhostCard from './GhostCard.svelte'

  /** `live`: in the camera view, on a dark background: no margin or shadow, a light border. */
  const { lang, side, id, live = false }: { lang: Lang; side: Side; id?: string; live?: boolean } = $props()

  const H = 100 / CARD_ASPECT
</script>

<p class="side-badge inline-flex animate-side-pop items-center gap-2.5 rounded-md border-2 bg-accent py-1.5 ps-2 pe-3 text-coal motion-reduce:animate-none {live ? 'm-0 border-cream' : 'mb-2.5 border-ink shadow-hard-sm'}" {id} data-side={side}>
  <svg class="h-auto w-13 flex-none" viewBox="-2 -2 104 {H + 4}" aria-hidden="true">
    <rect class="fill-cream stroke-coal stroke-3" x="0" y="0" width="100" height={H} rx="5" />
    <GhostCard {side} rect={{ x: 0, y: 0, w: 100, h: H }} dim={false} />
  </svg>
  <span class="{live ? 'text-[1.1rem]' : 'text-[1.35rem]'} font-extrabold tracking-[-0.4px] uppercase">{t(lang, side === 'front' ? 'tabFront' : 'tabBack')}</span>
  <span class="rounded-sm border-[1.5px] border-coal px-1.5 py-0.5 font-mono text-sm" dir="ltr">{side === 'front' ? '1/2' : '2/2'}</span>
</p>
