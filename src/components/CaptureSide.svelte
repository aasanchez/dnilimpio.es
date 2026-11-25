<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- One side's tile: pick it as the side on screen; also a drop target. The inputs live in the action bar. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'
  import GhostCard from './GhostCard.svelte'

  let { lang, side, loaded, isCurrent, message, isError, onSelect, zone = $bindable() }: {
    lang: Lang
    side: Side
    loaded: boolean
    isCurrent: boolean
    /** Status for screen readers: loaded, or the decode error. */
    message: string
    isError: boolean
    onSelect: () => void
    zone?: HTMLElement | undefined
  } = $props()

  const progress = $derived(loaded ? t(lang, 'statusReady') : isCurrent ? t(lang, 'statusNow') : t(lang, 'statusPending'))
</script>

<div class="dropzone" class:is-current={isCurrent} class:is-done={loaded} bind:this={zone}>
  <button type="button" class="side-pick" id="pick-{side}" aria-pressed={isCurrent} aria-describedby="status-{side}" onclick={onSelect}>
    <span class="thumb" class:done={loaded} aria-hidden="true">
      {#if loaded}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
      {:else}
        <svg class="thumb-ghost" viewBox="0 0 100 63.1"><GhostCard {side} rect={{ x: 0, y: 0, w: 100, h: 63.1 }} dim={false} /></svg>
      {/if}
    </span>
    <span>
      <span class="side-name">{t(lang, side === 'front' ? 'tabFront' : 'tabBack')} <span class="side-count" dir="ltr">{side === 'front' ? '1/2' : '2/2'}</span></span>
      <span class="status">{progress}</span>
    </span>
  </button>
  <p class="visually-hidden" id="status-{side}" role={isError ? 'alert' : 'status'}>{message}</p>
</div>
