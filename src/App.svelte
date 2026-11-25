<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- App shell: top bar, progress, one screen at a time. Flow: start → photos → corners → hide → download. -->
<script lang="ts">
  import { tick } from 'svelte'
  import { dir, pickLang, t, type Key, type Lang } from './i18n/index.ts'
  import { emptyAlignState, resetSide } from './ui/align-state.ts'
  import type { Side } from './zones/dni.ts'
  import LanguageSelect from './components/LanguageSelect.svelte'
  import Home from './components/Home.svelte'
  import CaptureStep from './components/CaptureStep.svelte'
  import type { CaptureState } from './ui/capture-state.ts'
  import AlignStep from './components/AlignStep.svelte'
  import { prefetchCornerModel } from './detect/corners.ts'
  import Editor from './components/Editor.svelte'
  import { emptyEditState, type Phase } from './ui/edit-state.ts'

  type Step = 'home' | 'capture' | 'align' | 'edit'

  // The language choice lives in memory only: it resets to the browser's language on reload.
  let lang = $state<Lang>(pickLang(navigator.languages))
  let step = $state<Step>('home')
  let alignSide = $state<Side>('front')
  /** Sub-screen of the editor: choosing, reviewing, or done. */
  let phase = $state<Phase>('edit')
  // ImageBitmaps are not proxied by $state (only plain objects and arrays are).
  const capture = $state<CaptureState>({ front: null, back: null })
  // Large canvases: kept out of reactivity on purpose. `aligned` mirrors which sides are done.
  const align = emptyAlignState()
  const aligned = $state<Record<Side, boolean>>({ front: false, back: false })
  // Field choices, watermark and greyscale survive going back to adjust corners; Reset clears them.
  let edit = $state(emptyEditState())
  let root: HTMLElement | undefined = $state()
  const alignBitmap = $derived(capture[alignSide])

  const STEPS: ReadonlyArray<{ key: Key; at: Step | Phase }> = [
    { key: 'stepPhotos', at: 'capture' },
    { key: 'stepCorners', at: 'align' },
    { key: 'stepHide', at: 'edit' },
    { key: 'stepDownload', at: 'review' },
  ]
  const current = $derived(step === 'edit' && phase !== 'edit' ? 3 : ['capture', 'align', 'edit'].indexOf(step))

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
    void focusHeading()
  }

  function back (): void {
    if (step === 'edit' && phase === 'done') phase = 'review'
    else if (step === 'edit' && phase === 'review') phase = 'edit'
    else if (step === 'edit') { go('align', 'back'); return } else if (step === 'align' && alignSide === 'back') { go('align', 'front'); return } else if (step === 'align') { go('capture'); return } else { go('home'); return }
    void focusHeading()
  }

  /** Spec §20: drop photos, straightened cards and every choice, and return to the start. */
  function reset (): void {
    for (const s of ['front', 'back'] as const) {
      capture[s]?.close()
      capture[s] = null
      resetSide(align, s)
      aligned[s] = false
    }
    edit = emptyEditState()
    go('capture', 'front')
  }

  /** A new photo for a side invalidates that side's corners and straightened card. */
  function onLoaded (side: Side, bitmap: ImageBitmap): void {
    if (capture[side] !== bitmap) capture[side]?.close()
    capture[side] = bitmap
    resetSide(align, side)
    aligned[side] = false
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
        <AlignStep {lang} side={alignSide} {bitmap} {align} {aligned}
          onSide={(s: Side) => { go('align', s) }} onDone={() => { onAligned(alignSide) }} />
      {/key}
    {:else if step === 'edit' && align.warped.front && align.warped.back}
      <Editor {lang} {align} {edit} bind:phase onAdjust={(side: Side) => { go('align', side) }} onReset={reset} onPhase={focusHeading} />
    {:else if step === 'capture'}
      <CaptureStep {lang} state={capture} {onLoaded} onContinue={() => { go('align', 'front') }} />
    {:else}
      <Home {lang} onStart={() => { go('capture') }} />
    {/if}
  </div>
</div>
