<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 1: photos of both sides. One side at a time, front first; it moves to the back by itself. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { DecodeError, DecodeResult } from '../capture/decode.ts'
  import { prefersCameraButton, wireCapture, wirePaste, type CaptureTarget } from '../capture/input.ts'
  import { t, type Key, type Lang } from '../i18n/index.ts'
  import type { CaptureState } from '../ui/capture-state.ts'
  import type { Side } from '../zones/dni.ts'
  import CaptureSide from './CaptureSide.svelte'

  const { lang, state: photos, onLoaded, onContinue }: {
    lang: Lang
    state: CaptureState
    onLoaded: (side: Side, bitmap: ImageBitmap) => void
    onContinue: () => void
  } = $props()

  const SIDES = ['front', 'back'] as const
  const ERROR_KEY: Record<DecodeError['kind'], Key> = {
    'not-an-image': 'errNotImage',
    'heic-unsupported': 'errHeic',
    'too-large': 'errTooLarge',
    'decode-failed': 'errDecode',
  }

  const withCamera = prefersCameraButton((q) => window.matchMedia(q))
  const targets: Partial<Record<Side, CaptureTarget>> = {}
  const ready = $derived(photos.front !== null && photos.back !== null)
  let current = $state<Side>(untrack(() => (photos.front === null || photos.back !== null ? 'front' : 'back')))
  // Element refs per side: the tile (drop target) and the two inputs in the action bar.
  const zones = $state<Partial<Record<Side, HTMLElement>>>({})
  const inputs = $state<Partial<Record<Side, HTMLInputElement>>>({})
  const cameras = $state<Partial<Record<Side, HTMLInputElement>>>({})
  // Message keys, not text, so a language change re-translates them.
  const errors = $state<Record<Side, Key | null>>({ front: null, back: null })
  let viewer: HTMLCanvasElement | undefined = $state()
  const bitmap = $derived(photos[current])
  const sideName = (s: Side): string => t(lang, s === 'front' ? 'tabFront' : 'tabBack')

  function onResult (side: Side, r: DecodeResult): void {
    if (!r.ok) {
      errors[side] = ERROR_KEY[r.error.kind]
      current = side
      return
    }
    errors[side] = null
    onLoaded(side, r.bitmap)
    // Move on to the other side while it is still empty.
    const other: Side = side === 'front' ? 'back' : 'front'
    current = photos[other] === null ? other : side
  }

  for (const side of SIDES) {
    $effect(() => {
      const input = inputs[side]
      const dropZone = zones[side]
      const cameraInput = cameras[side]
      if (!input || !dropZone) return
      const ac = new AbortController()
      const target: CaptureTarget = cameraInput
        ? { input, cameraInput, dropZone, onResult: (r) => { onResult(side, r) } }
        : { input, dropZone, onResult: (r) => { onResult(side, r) } }
      wireCapture(target, ac.signal)
      targets[side] = target
      return () => { ac.abort() }
    })
  }

  // Paste fills the first empty side; if both are set, it replaces the side on screen.
  $effect(() => {
    const ac = new AbortController()
    wirePaste(() => (photos.front === null ? targets.front : photos.back === null ? targets.back : targets[current]) ?? null, ac.signal)
    return () => { ac.abort() }
  })

  // Large preview of the side on screen.
  $effect(() => {
    if (!bitmap || !viewer) return
    const scale = Math.min(1, 900 / bitmap.width)
    viewer.width = Math.round(bitmap.width * scale)
    viewer.height = Math.round(bitmap.height * scale)
    viewer.getContext('2d')?.drawImage(bitmap, 0, 0, viewer.width, viewer.height)
  })
</script>

<section class="step">
  <div>
    <h2>{t(lang, current === 'front' ? 'captureFront' : 'captureBack')}</h2>
    <p class="lead">{t(lang, 'captureHint')}</p>
  </div>

  <div class="win">
    <div class="winbar"><i></i><i></i><i></i><span class="title">{sideName(current).toLowerCase()}.jpg</span></div>
    <div class="viewer">
      {#if bitmap}
        <canvas bind:this={viewer} width="0" height="0" aria-hidden="true"></canvas>
      {:else}
        <div class="frame-guide">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f36716" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          {t(lang, 'frameHint')}
        </div>
      {/if}
    </div>
  </div>

  <div class="sides">
    {#each SIDES as side (side)}
      <CaptureSide {lang} {side} loaded={photos[side] !== null} isCurrent={side === current}
        message={errors[side] ? t(lang, errors[side]) : photos[side] ? t(lang, 'loaded') : ''} isError={errors[side] !== null}
        onSelect={() => { current = side }} bind:zone={zones[side]} />
    {/each}
  </div>
  {#each SIDES as side (side)}
    {#if errors[side]}<p class="error" id="error-{side}">{sideName(side)}: {t(lang, errors[side])}</p>{/if}
  {/each}
  {#if !withCamera}<p class="hint">{t(lang, 'dropHint')}</p>{/if}

  <div class="actionbar">
    {#if ready}
      <button type="button" class="button primary" id="capture-continue" onclick={onContinue}>{t(lang, 'continue')} <span class="flip" aria-hidden="true">→</span></button>
    {/if}
    <!-- One pair of buttons per side; only the side on screen shows. The inputs sit inside their labels. -->
    {#each SIDES as side (side)}
      <div class="row" hidden={side !== current}>
        {#if withCamera}
          <label class="button" class:primary={!ready}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            {t(lang, 'takePhoto')}
            <input bind:this={cameras[side]} id="camera-{side}" class="visually-hidden" aria-describedby="status-{side}" />
          </label>
        {/if}
        <label class="button" class:primary={!ready && !withCamera}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-8 8" /></svg>
          {t(lang, withCamera ? 'gallery' : 'choosePhoto')}
          <input bind:this={inputs[side]} id="file-{side}" class="visually-hidden" aria-describedby="status-{side}" />
        </label>
      </div>
    {/each}
  </div>
</section>
