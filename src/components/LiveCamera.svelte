<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  Capture coach: live rear-camera view with a card guide, one tip at a time, and an automatic shot
  when the card is framed, lit, steady and sharp. Frames are analysed in memory and never leave
  the device. If the camera cannot start, it reports why through onFail and the step falls back
  to the plain camera and gallery buttons.
-->
<script lang="ts">
  import { onMount } from 'svelte'
  import { Coach, guideRect, toGray, type Tip } from '../capture/coach.ts'
  import { openCamera, stopStream, type CameraFailure } from '../capture/live.ts'
  import { shrink } from '../engine/wipe.ts'
  import { t, type Key, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'
  import GhostCard from './GhostCard.svelte'
  import SideBadge from './SideBadge.svelte'

  const { lang, side, onShot, onClose, onFail, onSkip }: {
    lang: Lang
    side: Side
    onShot: (bitmap: ImageBitmap) => void
    onClose: () => void
    onFail: (reason: CameraFailure) => void
    /** Set when the front is in and the back is not: closes the camera and goes on without the back. */
    onSkip?: (() => void) | undefined
  } = $props()

  /** Analysis frames: about 8 per second, 480 px on the long side. */
  const ANALYSE_EVERY_MS = 125
  const ANALYSIS_SIZE = 480
  /** If the camera gives no picture this long after permission, give up quietly. */
  const START_TIMEOUT_MS = 6000

  const TIP_KEY: Record<Tip, Key> = {
    frame: 'tipFrame',
    closer: 'tipCloser',
    tilt: 'tipTilt',
    dark: 'tipDark',
    glare: 'tipGlare',
    steady: 'tipSteady',
    blur: 'tipBlur',
    ready: 'tipReady',
  }

  let dialog: HTMLDialogElement | undefined = $state()
  let video: HTMLVideoElement | undefined = $state()
  let size = $state<{ w: number; h: number } | null>(null)
  let tip = $state<Tip | null>(null)
  let auto = $state(true)
  let busy = $state(false)
  let flash = $state(false)
  /** Short message after a shot, e.g. "now turn the card over". */
  let notice = $state<Key | null>(null)

  const guide = $derived(size ? guideRect(size.w, size.h) : null)
  const message = $derived.by(() => {
    if (notice) return t(lang, notice)
    if (!size) return t(lang, 'liveStarting')
    if (tip === 'ready' && !auto) return t(lang, 'tipReadyManual')
    return t(lang, TIP_KEY[tip ?? 'frame'])
  })

  let stream: MediaStream | null = null
  let closed = false
  const coach = new Coach()

  function fail (reason: CameraFailure): void {
    if (closed) return
    closed = true
    stopStream(stream)
    onFail(reason)
  }

  async function shoot (): Promise<void> {
    if (!video || !size || busy) return
    busy = true
    coach.shotTaken(performance.now())
    try {
      // Full camera resolution, straight from the current video frame.
      const bitmap = await createImageBitmap(video)
      if (closed) { bitmap.close(); return }
      flash = true
      setTimeout(() => { flash = false }, 180)
      onShot(bitmap)
    } catch {
      fail('unavailable')
    } finally {
      busy = false
    }
  }

  // After a shot the parent moves on to the other side: say so for a moment.
  let lastSide: Side | null = null
  $effect(() => {
    if (lastSide !== null && side !== lastSide) {
      notice = 'liveFlip'
      const id = setTimeout(() => { notice = null }, 2200)
      lastSide = side
      return () => { clearTimeout(id) }
    }
    lastSide = side
    return undefined
  })

  onMount(() => {
    dialog?.showModal()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    let shownTip: Tip | null = null
    let pendingTip: Tip | null = null

    const analyse = (): void => {
      timer = setTimeout(analyse, ANALYSE_EVERY_MS)
      if (!video || !ctx || closed || busy || video.readyState < 2 || video.videoWidth === 0) return
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!size || size.w !== vw || size.h !== vh) size = { w: vw, h: vh }
      const scale = ANALYSIS_SIZE / Math.max(vw, vh)
      const w = Math.max(1, Math.round(vw * scale))
      const h = Math.max(1, Math.round(vh * scale))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      ctx.drawImage(video, 0, 0, w, h)
      const frame = ctx.getImageData(0, 0, w, h).data
      const advice = coach.feed(toGray(frame, w, h), performance.now())
      frame.fill(0)
      // Change the tip only when it holds for two frames, so it does not flicker; "ready" shows at once.
      if (advice.tip === 'ready' || advice.tip === pendingTip) {
        if (advice.tip !== shownTip) { shownTip = advice.tip; tip = advice.tip }
      }
      pendingTip = advice.tip
      if (advice.shoot && auto) void shoot()
    }

    const onVisibility = (): void => {
      // Leaving the tab turns the camera off; the user can open it again.
      if (document.visibilityState === 'hidden') { closed = true; stopStream(stream); onClose() }
    }
    document.addEventListener('visibilitychange', onVisibility)

    void (async () => {
      const result = await openCamera({ isSecureContext: window.isSecureContext, mediaDevices: navigator.mediaDevices })
      if (!result.ok) { fail(result.reason); return }
      stream = result.stream
      if (closed || !video) { stopStream(stream); return }
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => { fail('unavailable') })
      video.srcObject = stream
      const started = await Promise.race([
        video.play().then(() => true, () => false),
        new Promise<false>((resolve) => { setTimeout(() => { resolve(false) }, START_TIMEOUT_MS) }),
      ])
      if (!started) { fail('unavailable'); return }
      analyse()
    })()

    return () => {
      closed = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      stopStream(stream)
      if (video) video.srcObject = null
      // The last frames of the camera: the analysis canvas and the coach's previous frame.
      shrink(canvas)
      coach.dispose()
      if (dialog?.open) dialog.close()
    }
  })
</script>

<dialog class="live m-0 h-dvh max-h-none w-full max-w-none border-0 bg-coal p-0 text-cream backdrop:bg-coal open:flex open:flex-col" bind:this={dialog} aria-labelledby="live-title"
  oncancel={(e) => { e.preventDefault(); onClose() }}>
  <div class="flex items-center gap-2 border-b-2 border-cream py-2 ps-4 pe-2">
    <h2 id="live-title" class="sr-only">{t(lang, side === 'front' ? 'captureFront' : 'captureBack')}</h2>
    <div class="min-w-0 flex-1 overflow-hidden" aria-hidden="true">{#key side}<SideBadge {lang} {side} id="live-side" live />{/key}</div>
    <button type="button" class="icon-btn text-cream" id="live-close" aria-label={t(lang, 'liveClose')} onclick={onClose}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>
  <div class="relative min-h-0 flex-1 [&.flash]:after:absolute [&.flash]:after:inset-0 [&.flash]:after:bg-white [&.flash]:after:opacity-70 [&.flash]:after:content-[''] motion-reduce:[&.flash]:after:hidden" class:flash>
    <video class="absolute inset-0 size-full bg-black object-contain" bind:this={video} muted playsinline autoplay disablepictureinpicture aria-hidden="true"></video>
    {#if size && guide}
      <!-- Same box and fit as the video, so the guide sits exactly where the coach looks. -->
      <svg class="live-guide absolute inset-0 size-full" viewBox="0 0 {size.w} {size.h}" aria-hidden="true">
        <!-- Faint drawing of the side to show; it fades once the card sits in the frame. -->
        <GhostCard {side} rect={guide} dim={tip !== null && tip !== 'frame' && tip !== 'closer'} />
        <rect class="frame" x={guide.x} y={guide.y} width={guide.w} height={guide.h} rx={guide.w * 0.04} class:ok={tip === 'ready'} />
      </svg>
    {/if}
  </div>
  {#if notice === 'liveFlip'}
    <!-- Big, short-lived banner when the camera moves on to the back. -->
    <p class="live-flip pointer-events-none absolute inset-0 m-0 grid animate-live-flip place-items-center motion-reduce:animate-none" aria-hidden="true"><span class="rounded-lg border-3 border-coal bg-orange px-5 py-2 text-4xl font-extrabold text-coal uppercase shadow-[6px_6px_0_var(--color-coal)]">{t(lang, side === 'front' ? 'tabFront' : 'tabBack')}</span></p>
  {/if}
  <p class="mx-4 mt-3 min-h-11 rounded-md border-2 border-cream px-3 py-2 text-center text-sm font-semibold [&.ok]:border-ok [&.ok]:text-ok" class:ok={tip === 'ready' && !notice} id="live-tip" role="status">{message}</p>
  <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
    <button type="button" class="chip col-start-1 row-start-1 min-h-11 justify-self-start border-cream text-center whitespace-normal text-cream aria-pressed:bg-cream aria-pressed:text-coal" id="live-auto" aria-pressed={auto} onclick={() => { auto = !auto }}>{t(lang, 'liveAuto')}</button>
    <button type="button" class="col-start-2 row-start-1 size-18 rounded-full border-4 border-cream bg-orange shadow-[inset_0_0_0_3px_var(--color-coal)] focus-visible:outline-cream disabled:cursor-not-allowed disabled:opacity-40" id="live-shutter" disabled={!size || busy} onclick={() => { void shoot() }}>
      <span class="sr-only">{t(lang, 'liveShutter')}</span>
    </button>
    {#if onSkip && side === 'back'}
      <!-- The back is optional: go on with the front alone. -->
      <button type="button" class="chip col-start-3 row-start-1 min-h-11 justify-self-end border-cream text-center whitespace-normal text-cream" id="live-skip-back" onclick={onSkip}>{t(lang, 'skipBack')}</button>
    {/if}
  </div>
</dialog>
