<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- App shell: top bar, progress, one screen at a time.
     Flow: start → photos → document → straighten (automatic) → hide → download. The corner screen opens
     only when a card is not found, when the person asks for it, or from "Adjust corners". -->
<script lang="ts">
  import { tick } from 'svelte'
  import { dir, pickLang, t, type Key, type Lang } from './i18n/index.ts'
  import { emptyAlignState, resetSide } from './ui/align-state.ts'
  import type { DocModel, Side } from './zones/types.ts'
  import { DEFAULT_DOC, documentOf, pixelSize } from './zones/documents.ts'
  import LanguageSelect from './components/LanguageSelect.svelte'
  import Home from './components/Home.svelte'
  import DocStep from './components/DocStep.svelte'
  import CaptureStep from './components/CaptureStep.svelte'
  import type { CaptureState } from './ui/capture-state.ts'
  import AlignStep from './components/AlignStep.svelte'
  import StraightenStep from './components/StraightenStep.svelte'
  import { prefetchCornerModel } from './detect/corners.ts'
  import { stopOcrIfLoaded } from './ocr/load-ocr.ts'
  import Editor from './components/Editor.svelte'
  import { emptyEditState, type Phase } from './ui/edit-state.ts'

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
  /** The no-cookies notice: shown on the start screen until dismissed. In memory only, so a reload shows it again. */
  let notice = $state(true)
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

  $effect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir(lang)
    document.title = t(lang, 'appTitle')
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

  /** Spec §20: drop photos, straightened cards and every choice, and return to the start. */
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
    // The OCR worker keeps the last card it read: stop it (a new one starts if OCR is used again).
    void stopOcrIfLoaded()
    go('capture', 'front')
  }

  /**
   * Confirms the picker. Another document has other fields and another shape, so its corners,
   * straightened images and choices start over; the photos are kept.
   */
  function chooseDoc (): void {
    const pick = docPick
    if (pick === null) return
    // Same document and both sides already straightened (e.g. back from the editor): keep them.
    if (pick === docModel && aligned.front && aligned.back) {
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

<div class="app" bind:this={root}>
  <header class="topbar">
    {#if step !== 'home'}
      <button type="button" class="icon-btn" id="back" aria-label={t(lang, 'goBack')} onclick={back}>
        <svg class="flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
    {/if}
    <div class="brand"><span class="brand-mark" aria-hidden="true">dl</span>{t(lang, 'appTitle')}</div>
    <LanguageSelect bind:lang />
  </header>

  {#if step !== 'home'}
    <ol class="progress" aria-label={t(lang, 'progress')}>
      {#each STEPS as s, i (s.key)}
        <li class:done={i < current} aria-current={i === current ? 'step' : undefined}>0{i + 1} {t(lang, s.key)}</li>
      {/each}
    </ol>
  {/if}

  <div class="content">
    {#if step === 'align' && alignBitmap}
      {@const bitmap = alignBitmap}
      {#key alignSide}
        <AlignStep {lang} side={alignSide} {size} {bitmap} {align} {aligned} missed={missed.includes(alignSide)}
          onSide={(s: Side) => { go('align', s) }} onDone={() => { onAligned(alignSide) }} />
      {/key}
    {:else if step === 'edit' && align.warped.front && align.warped.back}
      {#key docModel}
        <Editor {lang} {doc} {align} {edit} bind:phase onAdjust={(side: Side) => { go('align', side) }} onReset={reset} onPhase={focusHeading} />
      {/key}
    {:else if step === 'auto'}
      <StraightenStep {lang} {doc} {size} photos={capture} {align} onDone={onStraightened} onManual={() => { missed = []; go('align', 'front') }} />
    {:else if step === 'doc'}
      <DocStep {lang} bind:doc={docPick} photos={capture} preselect={!docConfirmed} onContinue={chooseDoc} />
    {:else if step === 'capture'}
      {#key session}
        <CaptureStep {lang} state={capture} {onLoaded} onContinue={() => { go('doc') }} />
      {/key}
    {:else}
      <Home {lang} {notice} onNoticeDismiss={() => { notice = false }} onStart={() => { go('capture', 'front') }} />
    {/if}
  </div>
</div>
