<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Faint line drawing of the card side to show in the live camera: photo and text lines on the
  front, text lines and the three machine-readable lines (MRZ) on the back. Generic on purpose:
  the document type is detected after the photos, and the layout is shared by DNI 3.0, DNI 4.0
  and TIE. No real face or data. Drawn in a 100 × 63 box (ID-1 ratio) and placed on `rect`.
-->
<svelte:options namespace="svg" />
<script lang="ts">
  import type { Rect } from '../capture/coach.ts'
  import type { Side } from '../zones/dni.ts'

  const { side, rect, dim }: { side: Side; rect: Rect; dim: boolean } = $props()

  const scale = $derived(rect.w / 100)
  /** [x, y, width] of each text line, in card units. */
  const FRONT_LINES = [[34, 7, 44], [34, 16, 30], [34, 21, 42], [34, 28, 24], [34, 33, 36], [34, 40, 20], [62, 40, 22]] as const
  const BACK_LINES = [[5, 7, 50], [5, 12, 62], [5, 19, 40], [5, 24, 56], [5, 31, 34]] as const
  const MRZ_Y = [43, 49, 55] as const
</script>

<g class="ghost" class:dim data-side={side} transform="translate({rect.x} {rect.y}) scale({scale})">
  {#if side === 'front'}
    <rect class="ghost-block" x="5" y="12" width="24" height="33" rx="1.5" />
    <circle class="ghost-line" cx="17" cy="24" r="5.5" />
    <path class="ghost-line" d="M8.5 45 Q17 31 25.5 45" />
    {#each FRONT_LINES as [x, y, w] (`${String(x)}-${String(y)}`)}
      <rect class="ghost-text" {x} {y} width={w} height="2.4" rx="1.2" />
    {/each}
    <path class="ghost-line" d="M36 53 q3 -5 6 0 t6 0 q2 -3 5 -1 t8 1" />
  {:else}
    {#each BACK_LINES as [x, y, w] (`${String(x)}-${String(y)}`)}
      <rect class="ghost-text" {x} {y} width={w} height="2.4" rx="1.2" />
    {/each}
    <rect class="ghost-block" x="74" y="6" width="21" height="28" rx="1.5" />
    {#each MRZ_Y as y (y)}
      <line class="ghost-mrz" x1="5" y1={y} x2="95" y2={y} />
    {/each}
  {/if}
</g>
