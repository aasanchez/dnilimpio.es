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

  const { lang, side, id }: { lang: Lang; side: Side; id?: string } = $props()

  const H = 100 / CARD_ASPECT
</script>

<p class="side-badge" {id} data-side={side}>
  <svg class="side-badge-card" viewBox="-2 -2 104 {H + 4}" aria-hidden="true">
    <rect class="side-badge-outline" x="0" y="0" width="100" height={H} rx="5" />
    <GhostCard {side} rect={{ x: 0, y: 0, w: 100, h: H }} dim={false} />
  </svg>
  <span class="side-badge-name">{t(lang, side === 'front' ? 'tabFront' : 'tabBack')}</span>
  <span class="side-badge-count" dir="ltr">{side === 'front' ? '1/2' : '2/2'}</span>
</p>
