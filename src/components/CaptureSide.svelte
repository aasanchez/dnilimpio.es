<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- One side's tile: pick it as the side on screen; also a drop target. The inputs live in the action bar. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'
  import GhostCard from './GhostCard.svelte'

  let { lang, side, optional = false, loaded, isCurrent, message, isError, onSelect, zone = $bindable() }: {
    lang: Lang
    side: Side
    /** The back photo is optional: its tile says so instead of "to do". */
    optional?: boolean
    loaded: boolean
    isCurrent: boolean
    /** Status for screen readers: loaded, or the decode error. */
    message: string
    isError: boolean
    onSelect: () => void
    zone?: HTMLElement | undefined
  } = $props()

  const progress = $derived(loaded ? t(lang, 'statusReady') : isCurrent ? t(lang, 'statusNow') : t(lang, optional ? 'statusOptional' : 'statusPending'))
</script>

<div class="dropzone" class:is-current={isCurrent} class:is-done={loaded} bind:this={zone}>
  <button type="button" class="side-pick flex min-h-16 w-full items-center gap-2.5 border-0 bg-transparent px-3 py-2.5 text-start" id="pick-{side}" aria-pressed={isCurrent} aria-describedby="status-{side}" onclick={onSelect}>
    <span class="flex h-7 w-10.5 flex-none items-center justify-center overflow-hidden rounded-sm border-[1.5px] border-ink {loaded ? 'bg-accent text-coal' : 'bg-sunk'}" aria-hidden="true">
      {#if loaded}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
      {:else}
        <svg class="ghost-current size-full" viewBox="0 0 100 63.1"><GhostCard {side} rect={{ x: 0, y: 0, w: 100, h: 63.1 }} dim={false} /></svg>
      {/if}
    </span>
    <span>
      <span class="block font-bold">{t(lang, side === 'front' ? 'tabFront' : 'tabBack')} <span class="font-mono text-xs font-normal" dir="ltr">{side === 'front' ? '1/2' : '2/2'}</span></span>
      <span class="status block font-mono text-[0.6875rem] {isCurrent ? 'text-coal' : 'text-muted'}">{progress}</span>
    </span>
  </button>
  <p class="sr-only" id="status-{side}" role={isError ? 'alert' : 'status'}>{message}</p>
</div>
