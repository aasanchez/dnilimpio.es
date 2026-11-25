<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { tick } from 'svelte'
  import { dir, pickLang, t, type Lang } from './i18n/index.ts'
  import { emptyAlignState, resetSide } from './ui/align-state.ts'
  import type { Side } from './zones/dni.ts'
  import LanguageSelect from './components/LanguageSelect.svelte'
  import CaptureStep from './components/CaptureStep.svelte'
  import type { CaptureState } from './ui/capture-state.ts'
  import AlignStep from './components/AlignStep.svelte'
  import Editor from './components/Editor.svelte'
  import { emptyEditState } from './ui/edit-state.ts'

  type Step = 'capture' | 'align-front' | 'align-back' | 'edit'

  // The language choice lives in memory only: it resets to the browser's language on reload.
  let lang = $state<Lang>(pickLang(navigator.languages))
  let step = $state<Step>('capture')
  // ImageBitmaps are not proxied by $state (only plain objects and arrays are).
  const capture = $state<CaptureState>({ front: null, back: null })
  // Large canvases: kept out of reactivity on purpose.
  const align = emptyAlignState()
  // Field choices, watermark and greyscale survive going back to adjust corners; Reset clears them.
  let edit = $state(emptyEditState())
  let root: HTMLElement | undefined = $state()

  $effect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir(lang)
    document.title = t(lang, 'appTitle')
  })

  /** Changes step, then moves focus to the new step's heading so screen readers announce it. */
  async function go (s: Step): Promise<void> {
    step = s
    await tick()
    const h = root?.querySelector('h2')
    if (h) {
      h.tabIndex = -1
      h.focus()
      h.scrollIntoView({ block: 'start' })
    }
  }

  /** Spec §20: drop photos, straightened cards and every choice, and return to the start. */
  function reset (): void {
    for (const s of ['front', 'back'] as const) {
      capture[s]?.close()
      capture[s] = null
      resetSide(align, s)
    }
    edit = emptyEditState()
    void go('capture')
  }

  /** A new photo for a side invalidates that side's corners and straightened card. */
  function onLoaded (side: Side, bitmap: ImageBitmap): void {
    if (capture[side] !== bitmap) capture[side]?.close()
    capture[side] = bitmap
    resetSide(align, side)
  }
</script>

<div bind:this={root}>
  <LanguageSelect bind:lang />
  <h1>{t(lang, 'appTitle')}</h1>
  <p>{t(lang, 'tagline')}</p>

  {#if step === 'align-front' && capture.front}
    <AlignStep {lang} side="front" bitmap={capture.front} {align}
      onBack={() => go('capture')} onDone={() => go(align.warped.back ? 'edit' : 'align-back')} />
  {:else if step === 'align-back' && capture.back}
    <AlignStep {lang} side="back" bitmap={capture.back} {align}
      onBack={() => go('align-front')} onDone={() => go('edit')} />
  {:else if step === 'edit' && align.warped.front && align.warped.back}
    <Editor {lang} {align} {edit} onAdjust={(side: Side) => go(side === 'front' ? 'align-front' : 'align-back')} onReset={reset} />
  {:else}
    <CaptureStep {lang} state={capture} {onLoaded} onContinue={() => go('align-front')} />
  {/if}

  <footer><a href={__REPO_URL__} rel="noopener noreferrer">{t(lang, 'sourceCode')}</a></footer>
</div>
