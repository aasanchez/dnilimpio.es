<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- App shell: top bar, progress, one screen at a time.
     Flow: start → photos → document → straighten (automatic) → hide → download. The corner screen opens
     only when a card is not found, when the person asks for it, or from "Adjust corners". -->
<script lang="ts">
  import { tick } from 'svelte'
  import { dir, pickLang, t, type Key, type Lang } from './i18n/index.ts'
  import { emptyAlignState, resetSide } from './ui/align-state.ts'
  import type { DocModel, Side, ZoneId } from './zones/types.ts'
  import { DEFAULT_DOC, choiceOf, documentOf, pixelSize, type DniVersion } from './zones/documents.ts'
  import LanguageSelect from './components/LanguageSelect.svelte'
  import Home from './components/Home.svelte'
  import DocStep from './components/DocStep.svelte'
  import CaptureStep from './components/CaptureStep.svelte'
  import type { CaptureState } from './ui/capture-state.ts'
  import AlignStep from './components/AlignStep.svelte'
  import StraightenStep from './components/StraightenStep.svelte'
  import { prefetchCornerModel } from './detect/corners.ts'
  import { stopOcrIfLoaded } from './ocr/load-ocr.ts'
  import { revokeDownloads } from './engine/downloads.ts'
  import { noticeDue, rememberNoticeClosed } from './ui/notice-memory.ts'
  import { setAppIdle } from './offline/update.ts'
  import { lockIntake, prepareIntake } from './security/intake-lockdown.ts'
  import { statsAllowedHere } from './analytics/stats-frame.ts'
  import StatsFrame from './components/StatsFrame.svelte'
  import Editor from './components/Editor.svelte'
  import type CardGuideT from './components/CardGuide.svelte'
  import { emptyEditState, type Phase } from './ui/edit-state.ts'

  /** The product name. Not translated: it is the brand and the domain (dnitapado.es). */
  const BRAND = 'DNI Tapado.es'

  type Step = 'home' | 'doc' | 'capture' | 'auto' | 'align' | 'edit'

  // The language choice lives in memory only: it resets to the browser's language on reload.
  let lang = $state<Lang>(pickLang(navigator.languages))
  let step = $state<Step>('home')
  /** Chosen document; the one whose zones, shape and straightened size are in use. */
  let docModel = $state<DocModel>(DEFAULT_DOC)
  /**
   * Picker value: becomes `docModel` on Continue, so going back without continuing changes nothing.
   * Null until detection or the person picks one: a silent default put DNI boxes on a TIE.
   */
  let docPick = $state<DocModel | null>(null)
  /**
   * True when the DNI version in use was detected from the photos or chosen in the editor; false
   * when it is the default (4.0) because detection could not tell. The editor then says so.
   */
  let dniFound = $state(false)
  /** True once the person confirmed a document for the current photos; automatic detection then stops preselecting. */
  let docConfirmed = $state(false)
  const doc = $derived(documentOf(docModel))
  const size = $derived(pixelSize(doc.size))
  let alignSide = $state<Side>('front')
  /** Sub-screen of the editor: choosing, reviewing, or done. */
  let phase = $state<Phase>('edit')
  // ImageBitmaps are not proxied by $state (only plain objects and arrays are).
  const capture = $state<CaptureState>({ front: null, back: null })
  // Large canvases: kept out of reactivity on purpose. `aligned` mirrors which sides are done.
  const align = emptyAlignState()
  const aligned = $state<Record<Side, boolean>>({ front: false, back: false })
  /** Sides whose card automatic straightening did not find: their corner screen says so. */
  let missed = $state<Side[]>([])
  // Field choices, watermark and greyscale survive going back to adjust corners; Reset clears them.
  let edit = $state(emptyEditState(documentOf(DEFAULT_DOC)))
  let root: HTMLElement | undefined = $state()
  let guide: { show: (model?: DocModel, field?: ZoneId) => Promise<void> } | undefined = $state()
  /**
   * The card guide is its own chunk, loaded the first time it opens (it is precached for offline use
   * like the rest of the build), so the start page does not carry it.
   */
  let CardGuide = $state<typeof CardGuideT | null>(null)

  async function openGuide (model?: DocModel, field?: ZoneId): Promise<void> {
    if (!CardGuide) {
      CardGuide = (await import('./components/CardGuide.svelte')).default
      await tick()
    }
    await guide?.show(model, field)
  }
  /** The no-cookies notice: shown on the start screen at most once every 4 days (see notice-memory.ts). */
  let notice = $state(noticeDue())
  const alignBitmap = $derived(capture[alignSide])

  const STEPS: ReadonlyArray<{ key: Key; at: Step | Phase }> = [
    { key: 'stepPhotos', at: 'capture' },
    { key: 'stepCorners', at: 'align' },
    { key: 'stepHide', at: 'edit' },
    { key: 'stepDownload', at: 'review' },
  ]
  // The document choice belongs to the Photos step.
  const current = $derived(step === 'edit' && phase !== 'edit' ? 3 : step === 'doc' ? 0 : step === 'auto' ? 1 : ['capture', 'align', 'edit'].indexOf(step))

  // Leaving the page (another site, closing the tab, a reload): drop the photos and stop OCR, so a
  // page kept in the back-forward cache holds no document when the user comes back.
  $effect(() => {
    const leave = (): void => { reset() }
    addEventListener('pagehide', leave)
    return () => { removeEventListener('pagehide', leave) }
  })

  // Visit counter (ADR 0024): an isolated frame, once per page load, on the start screen only and only
  // until the first time the person leaves it. Production builds on the public site only.
  let statsShown = $state(false)
  const stats = $derived(import.meta.env.PROD && !statsShown && step === 'home' && capture.front === null && capture.back === null && statsAllowedHere())
  $effect(() => { if (step !== 'home') statsShown = true })

  // Idle (start screen, no photos): a new build of the app may replace this one (offline/update.ts).
  $effect(() => {
    setAppIdle(step === 'home' && capture.front === null && capture.back === null)
  })

  $effect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir(lang)
    document.title = BRAND
  })

  /** Moves focus to the new screen's heading so screen readers announce it, and scrolls to the top. */
  async function focusHeading (): Promise<void> {
    await tick()
    const h = root?.querySelector<HTMLElement>('.content h1, .content h2')
    if (h) {
      h.tabIndex = -1
      h.focus({ preventScroll: true })
    }
    window.scrollTo({ top: 0 })
  }

  function go (s: Step, side: Side = alignSide): void {
    // Every screen after the start one can hold photos: the intake policy is in force there (ADR 0025).
    // Start (below) loads the fonts first; this is the safety net for any other way in. Production
    // builds only: the dev server has no CSP, no import map and needs its HMR connection.
    if (s !== 'home' && import.meta.env.PROD) lockIntake()
    step = s
    alignSide = side
    if (s === 'edit') phase = 'edit'
    if (s === 'doc') docPick = docConfirmed ? docModel : null
    void focusHeading()
  }

  function back (): void {
    if (step === 'edit' && phase === 'done') phase = 'review'
    else if (step === 'edit' && phase === 'review') phase = 'edit'
    else if (step === 'edit' || step === 'auto') { go('doc'); return } else if (step === 'align') { go(aligned.front && aligned.back ? 'edit' : 'doc'); return } else if (step === 'doc') { go('capture'); return } else { go('home'); return }
    void focusHeading()
  }

  // Bumped by reset(): the capture step is rebuilt, which cancels photos it is still decoding.
  let session = $state(0)

  /** Start: loads what the page still needs, locks the network channels, then opens the photo step. */
  async function startCapture (): Promise<void> {
    if (import.meta.env.PROD) await prepareIntake()
    go('capture', 'front')
  }

  /**
   * Spec §20: drop photos, straightened cards and every choice, and return to the start.
   * Work still running for the old photos cannot bring them back: the screens that started it close
   * (the capture step is re-created through `session`) and check that they are still open before
   * they write, and OCR jobs end with OcrStopped. Memory is freed as far as a web page can (src/engine/wipe.ts).
   */
  function reset (): void {
    session++
    for (const s of ['front', 'back'] as const) {
      capture[s]?.close()
      capture[s] = null
      resetSide(align, s)
      aligned[s] = false
    }
    edit = emptyEditState(doc)
    docConfirmed = false
    dniFound = false
    // The OCR worker keeps the last card it read: stop it (a new one starts if OCR is used again).
    void stopOcrIfLoaded()
    // The PDF's download link, if it is still open (downloads.ts).
    revokeDownloads()
    go('capture', 'front')
  }

  /**
   * Confirms the picker. Another document has other fields and another shape, so its corners,
   * straightened images and choices start over; the photos are kept.
   */
  function chooseDoc (): void {
    const pick = docPick
    if (pick === null) return
    // Same card and both sides already straightened (e.g. back from the editor): keep them. The two
    // DNI versions are the same card shape, so only the field positions change.
    if (choiceOf(pick) === choiceOf(docModel) && aligned.front && aligned.back) {
      if (pick !== docModel) setDniVersion(pick as DniVersion)
      docConfirmed = true
      go('edit')
      return
    }
    if (pick !== docModel) {
      docModel = pick
      for (const s of ['front', 'back'] as const) {
        resetSide(align, s)
        aligned[s] = false
      }
      edit = emptyEditState(documentOf(pick))
    }
    docConfirmed = true
    missed = []
    go('auto')
  }

  /**
   * The editor's "Older DNI (3.0)" switch: the other DNI layout. Same card shape, so the straightened
   * photos and the choices stay; only box positions moved by hand start over, as they belong to a layout.
   */
  function setDniVersion (version: DniVersion): void {
    docModel = version
    edit.placement = {}
  }

  /** Automatic straightening finished: on to the editor, or to the corners of a card it missed. */
  function onStraightened (notFound: Side[]): void {
    missed = notFound
    for (const s of ['front', 'back'] as const) aligned[s] = !notFound.includes(s)
    const first = notFound[0]
    if (first) go('align', first)
    else go('edit')
  }

  /** A new photo for a side invalidates that side's corners and straightened card. */
  function onLoaded (side: Side, bitmap: ImageBitmap): void {
    if (capture[side] !== bitmap) capture[side]?.close()
    capture[side] = bitmap
    resetSide(align, side)
    aligned[side] = false
    docConfirmed = false
    // Online: start loading the corner model now, so it is ready on the corners step.
    prefetchCornerModel()
  }

  function onAligned (side: Side): void {
    aligned[side] = true
    const other: Side = side === 'front' ? 'back' : 'front'
    if (!aligned[other]) go('align', other)
    else go('edit')
  }
</script>

<div class="app mx-auto flex min-h-dvh max-w-[40rem] flex-col lg:max-w-6xl" bind:this={root}>
  <header class="sticky top-0 z-5 flex min-h-[58px] items-center gap-2 border-b border-hair bg-paper px-3 lg:px-6">
    {#if step !== 'home'}
      <button type="button" class="icon-btn" id="back" aria-label={t(lang, 'goBack')} onclick={back}>
        <svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
    {/if}
    <!-- The logo returns to the start screen. Photos and choices stay, as with Back; Reset clears them.
         preventDefault: following href would reload the page, and pagehide drops the photos. -->
    <a class="brand flex min-h-11 flex-1 items-center lg:me-auto lg:flex-none gap-2 text-lg font-bold tracking-[-0.3px] text-inherit no-underline hover:underline hover:underline-offset-3" id="brand" href="./" aria-current={step === 'home' ? 'page' : undefined}
      onclick={(e: MouseEvent) => { e.preventDefault(); if (step !== 'home') go('home') }}><span class="brand-mark inline-flex h-6 items-center justify-center rounded-sm border-2 border-ink bg-accent px-1.25 font-mono text-xs font-bold text-on-accent" aria-hidden="true">DT.es</span>{BRAND}</a>
    <LanguageSelect bind:lang />
  </header>

  {#if step !== 'home'}
    <!-- Phones: a row under the top bar. Wide screens: in the top bar itself, centred, and as sticky. -->
    <ol class="progress grid grid-cols-4 gap-1.5 px-4 pt-3 pb-2 lg:pointer-events-none lg:sticky lg:top-0 lg:z-6 lg:mx-auto lg:-mt-[58px] lg:h-[58px] lg:w-[26rem] lg:content-center lg:py-0 xl:w-[32rem]" aria-label={t(lang, 'progress')}>
      {#each STEPS as s, i (s.key)}
        <li class:done={i < current} aria-current={i === current ? 'step' : undefined}>0{i + 1} {t(lang, s.key)}</li>
      {/each}
    </ol>
  {/if}

  <div class="content flex flex-1 flex-col gap-4 px-4 pt-3 pb-6 lg:px-6 lg:pt-8 lg:pb-10">
    {#if step === 'align' && alignBitmap}
      {@const bitmap = alignBitmap}
      {#key alignSide}
        <AlignStep {lang} side={alignSide} {size} {bitmap} {align} {aligned} missed={missed.includes(alignSide)}
          onSide={(s: Side) => { go('align', s) }} onDone={() => { onAligned(alignSide) }} />
      {/key}
    {:else if step === 'edit' && align.warped.front && align.warped.back}
      {#key docModel}
        <Editor {lang} {doc} {align} {edit} {dniFound} bind:phase onDniVersion={(v: DniVersion) => { setDniVersion(v); dniFound = true }} onAdjust={(side: Side) => { go('align', side) }} onReset={reset} onPhase={focusHeading}
          onGuide={(field: ZoneId) => { void openGuide(docModel, field) }} />
      {/key}
    {:else if step === 'auto'}
      <StraightenStep {lang} {doc} {size} photos={capture} {align} onDone={onStraightened} onManual={() => { missed = []; go('align', 'front') }} />
    {:else if step === 'doc'}
      <DocStep {lang} bind:doc={docPick} bind:dniFound photos={capture} preselect={!docConfirmed} onContinue={chooseDoc} />
    {:else if step === 'capture'}
      {#key session}
        <CaptureStep {lang} state={capture} {onLoaded} onContinue={() => { go('doc') }} />
      {/key}
    {:else}
      <Home {lang} {notice} onGuide={() => { void openGuide() }} onNoticeDismiss={() => { notice = false; rememberNoticeClosed() }} onStart={() => { void startCapture() }} />
      {#if stats}<StatsFrame />{/if}
    {/if}
  </div>
  {#if CardGuide}<CardGuide {lang} id="guide" bind:this={guide} />{/if}
</div>
