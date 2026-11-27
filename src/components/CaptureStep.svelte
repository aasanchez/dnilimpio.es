<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Step 1: photos of the card. One side at a time, front first; it moves to the back by itself.
     The back is optional: once the front is in, the person can go on without it, or remove it. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { DecodeError, DecodeResult } from '../capture/decode.ts'
  import { prefersCameraButton, wireCapture, wirePageDrop, wirePaste, type CaptureTarget } from '../capture/input.ts'
  import { canUseLiveCamera, type CameraFailure } from '../capture/live.ts'
  import { t, type Key, type Lang } from '../i18n/index.ts'
  import { canContinue, type CaptureState } from '../ui/capture-state.ts'
  import { shrink } from '../engine/wipe.ts'
  import type { Side } from '../zones/dni.ts'
  import CaptureSide from './CaptureSide.svelte'
  import LiveCamera from './LiveCamera.svelte'
  import SideBadge from './SideBadge.svelte'
  import GhostCard from './GhostCard.svelte'
  import { watchFilter } from '../offline/verify.ts'

  const { lang, state: photos, onLoaded, onRemoved, onContinue }: {
    lang: Lang
    state: CaptureState
    onLoaded: (side: Side, bitmap: ImageBitmap) => void
    /** Drops a side's photo. Only the back offers it: the front is required. */
    onRemoved: (side: Side) => void
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
  // Capture coach (live camera) on phones and tablets that allow it. If it cannot start, the plain
  // camera button takes its place for the rest of the visit, with a short note why.
  const liveSupported = withCamera && canUseLiveCamera({ isSecureContext: window.isSecureContext, mediaDevices: navigator.mediaDevices })
  let liveFailed = $state(false)
  let liveOpen = $state(false)
  let liveNote = $state<Key | null>(null)
  const useLive = $derived(liveSupported && !liveFailed)
  const targets: Partial<Record<Side, CaptureTarget>> = {}
  const ready = $derived(photos.front !== null && photos.back !== null)
  /** The front is in and the back is not: the person may go on with the front alone. */
  const frontOnly = $derived(canContinue(photos) && photos.back === null)
  let current = $state<Side>(untrack(() => (photos.front === null || photos.back !== null ? 'front' : 'back')))
  // Element refs per side: the tile (drop target) and the two inputs in the action bar.
  const zones = $state<Partial<Record<Side, HTMLElement>>>({})
  const inputs = $state<Partial<Record<Side, HTMLInputElement>>>({})
  const cameras = $state<Partial<Record<Side, HTMLInputElement>>>({})
  // Message keys, not text, so a language change re-translates them.
  const errors = $state<Record<Side, Key | null>>({ front: null, back: null })
  let viewer: HTMLCanvasElement | undefined = $state()
  // Files are being dragged over the page: the viewer shows where they will go.
  let dragging = $state(false)
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

  function onShot (bitmap: ImageBitmap): void {
    const side = current
    onResult(side, { ok: true, bitmap })
    // Stay open for the other side while it is still empty; otherwise we are done.
    if (current === side) liveOpen = false
  }

  /** Goes on without the back photo (from the action bar or the live camera). */
  function skipBack (): void {
    liveOpen = false
    errors.back = null
    onContinue()
  }

  function removeBack (): void {
    errors.back = null
    onRemoved('back')
    current = 'back'
  }

  function onLiveFail (reason: CameraFailure): void {
    liveOpen = false
    liveFailed = true
    liveNote = reason === 'denied' ? 'liveDenied' : 'liveUnavailable'
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

  // The service worker's filter (ADR 0025): null until checked, so the note does not flash.
  let filterOn = $state<boolean | null>(null)
  $effect(() => {
    const ac = new AbortController()
    watchFilter((on) => { filterOn = on }, ac.signal)
    return () => { ac.abort() }
  })

  // Paste fills the first empty side; if both are set, it replaces the side on screen.
  $effect(() => {
    const ac = new AbortController()
    wirePaste(() => (photos.front === null ? targets.front : photos.back === null ? targets.back : targets[current]) ?? null, ac.signal)
    return () => { ac.abort() }
  })

  // Drag and drop anywhere on the page loads the side on screen (a side's tile takes its own side).
  $effect(() => {
    const ac = new AbortController()
    wirePageDrop(() => targets[current] ?? null, (d) => { dragging = d }, ac.signal)
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

  // Leaving the step (Reset, Continue, leaving the page): free the preview's pixels at once.
  $effect(() => {
    const v = viewer
    return () => { shrink(v) }
  })
</script>

<section class="step split flex-1">
  <div class="area-head">
    <!-- The side to capture now, impossible to miss; it pops in again when the step moves on. -->
    {#key current}<SideBadge {lang} side={current} id="side-badge" />{/key}
    <h2>{t(lang, current === 'front' ? 'captureFront' : 'captureBack')}</h2>
    <p class="lead">{t(lang, 'captureHint')}</p>
    {#if current === 'back'}<p class="hint" id="back-optional">{t(lang, 'backOptional')}</p>{/if}
  </div>

  <div class="area-stage flex flex-col gap-3">
    <div class="win">
      <div class="winbar"><i></i><i></i><i></i><span class="title">{sideName(current).toLowerCase()}.jpg</span></div>
      <div class="viewer relative flex min-h-52 items-center justify-center bg-coal lg:min-h-96" id="viewer" class:is-dragover={dragging}>
        {#if bitmap}
          <canvas class="block h-auto max-h-[50vh] max-w-full lg:max-h-[65vh]" bind:this={viewer} width="0" height="0" aria-hidden="true"></canvas>
        {:else}
          <div class="flex aspect-[1.585] w-4/5 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent p-2 text-center font-mono text-xs text-cream lg:w-3/5">
            <svg class="h-auto w-[70%]" viewBox="0 0 100 63.1" aria-hidden="true"><GhostCard side={current} rect={{ x: 0, y: 0, w: 100, h: 63.1 }} dim={false} /></svg>
            {#if withCamera}
              {t(lang, 'frameHint')}
            {:else}
              <!-- Desktop: a classic upload area. Drag a file here, or open the file chooser. -->
              <span class="font-sans text-[1.05rem] font-bold">{t(lang, 'dropHere')}</span>
              <button type="button" class="button small border-cream bg-cream text-coal" id="drop-choose" onclick={() => inputs[current]?.click()}>{t(lang, 'chooseFile')}</button>
            {/if}
          </div>
        {/if}
        {#if dragging}
          <div class="pointer-events-none absolute inset-0 grid place-items-center bg-coal/94 text-xl font-extrabold text-cream" aria-hidden="true"><span class="rounded-lg border-2 border-dashed border-accent px-4 py-2">{t(lang, 'dropHere')}</span></div>
        {/if}
      </div>
    </div>
    <p class="m-0 flex items-center gap-1.5 font-mono text-xs text-muted" id="local-note">
      <svg class="size-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      {t(lang, 'localOnly')}
    </p>
    {#if filterOn === false}
      <!-- Without the service worker the app works the same; only its extra network filter is off. -->
      <p class="m-0 font-mono text-xs text-muted" id="filter-note" role="status">{t(lang, 'filterOff')}</p>
    {/if}
  </div>

  <div class="area-side flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-1">
      {#each SIDES as side (side)}
        <CaptureSide {lang} {side} optional={side === 'back'} loaded={photos[side] !== null} isCurrent={side === current}
          message={errors[side] ? t(lang, errors[side]) : photos[side] ? t(lang, 'loaded') : ''} isError={errors[side] !== null}
          onSelect={() => { current = side }} bind:zone={zones[side]} />
      {/each}
    </div>
    {#each SIDES as side (side)}
      {#if errors[side]}<p class="notice-warn" id="error-{side}">{sideName(side)}: {t(lang, errors[side])}</p>{/if}
    {/each}
    {#if photos.back !== null}
      <button type="button" class="link-button justify-self-start" id="capture-remove-back" onclick={removeBack}>{t(lang, 'removeBack')}</button>
    {/if}
    {#if !withCamera}<p class="hint">{t(lang, 'pasteHint')}</p>{/if}
    {#if liveNote}<p class="hint" id="live-note" role="status">{t(lang, liveNote)}</p>{/if}
  </div>

  {#if liveOpen}
    <LiveCamera {lang} side={current} {onShot} onClose={() => { liveOpen = false }} onFail={onLiveFail} onSkip={frontOnly ? skipBack : undefined} />
  {/if}

  <div class="actionbar">
    {#if ready}
      <button type="button" class="button primary" id="capture-continue" onclick={onContinue}>{t(lang, 'continue')} <span class="flip" aria-hidden="true">→</span></button>
    {:else if frontOnly}
      <!-- The back is optional: go on with the front alone. -->
      <button type="button" class="button" id="capture-skip-back" onclick={skipBack}>{t(lang, 'skipBack')} <span class="flip" aria-hidden="true">→</span></button>
    {/if}
    <!-- One pair of buttons per side; only the side on screen shows. The inputs sit inside their labels. -->
    {#each SIDES as side (side)}
      <div class="row" hidden={side !== current}>
        {#if useLive}
          <button type="button" class="button" class:primary={!ready} id="live-{side}" onclick={() => { liveNote = null; liveOpen = true }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            {t(lang, 'takePhoto')}
          </button>
        {/if}
        {#if withCamera}
          <!-- The system camera: shown when the live camera is not available; kept in the page either way. -->
          <label class="button" class:primary={!ready} hidden={useLive}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            {t(lang, 'takePhoto')}
            <input bind:this={cameras[side]} id="camera-{side}" class="sr-only" aria-describedby="status-{side}" />
          </label>
        {/if}
        <label class="button" class:primary={!ready && !withCamera}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-8 8" /></svg>
          {t(lang, withCamera ? 'gallery' : 'choosePhoto')}
          <input bind:this={inputs[side]} id="file-{side}" class="sr-only" aria-describedby="status-{side}" />
        </label>
      </div>
    {/each}
  </div>
</section>
