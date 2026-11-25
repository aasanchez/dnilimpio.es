<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { prefersCameraButton, wirePaste, type CaptureTarget } from '../capture/input.ts'
  import { t, type Lang } from '../i18n/index.ts'
  import type { CaptureState } from '../ui/capture-state.ts'
  import type { Side } from '../zones/dni.ts'
  import CaptureSide from './CaptureSide.svelte'

  const { lang, state, onLoaded, onContinue }: {
    lang: Lang
    state: CaptureState
    onLoaded: (side: Side, bitmap: ImageBitmap) => void
    onContinue: () => void
  } = $props()

  const withCamera = prefersCameraButton((q) => window.matchMedia(q))
  const targets: Partial<Record<Side, CaptureTarget>> = {}
  const ready = $derived(state.front !== null && state.back !== null)

  // Paste fills the first empty side; if both are set, it replaces the front.
  $effect(() => {
    const ac = new AbortController()
    wirePaste(() => (state.front === null ? targets.front : state.back === null ? targets.back : targets.front) ?? null, ac.signal)
    return () => { ac.abort() }
  })
</script>

<section class="step">
  <h2>{t(lang, 'stepCapture')}</h2>
  {#each ['front', 'back'] as const as side (side)}
    <CaptureSide {lang} {side} bitmap={state[side]} {withCamera}
      onLoaded={(b: ImageBitmap) => { onLoaded(side, b) }} register={(target: CaptureTarget) => { targets[side] = target }} />
  {/each}
</section>
<div class="actions">
  <button type="button" class="button" id="capture-continue" disabled={!ready} aria-describedby="capture-next-hint"
    onclick={() => { if (ready) onContinue() }}>{t(lang, 'continue')}</button>
  <p class="hint" id="capture-next-hint">{ready ? '' : t(lang, 'needBothSides')}</p>
</div>
