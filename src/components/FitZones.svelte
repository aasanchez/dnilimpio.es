<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Fit to the text (ADR 0019): on-device OCR finds where the text is on both straightened sides and
     the boxes of the ticked fields grow to cover it (src/engine/snap.ts). Only word boxes reach the
     editor; the text read is dropped in the OCR module. When OCR cannot run, the button is disabled
     with a short reason and the user adjusts the boxes by hand. It never shows a raw error. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { loadOcr } from '../ocr/load-ocr.ts'
  import type { OcrStatus } from '../ocr/ocr.ts'
  import { t, tf, type Lang } from '../i18n/index.ts'
  import type { Rect, Side } from '../zones/types.ts'

  const { lang, cards, disabled, onFit }: {
    lang: Lang
    /** Straightened sides to read. */
    cards: ReadonlyArray<readonly [Side, HTMLCanvasElement]>
    /** True when no field is ticked or the final preview is shown. */
    disabled: boolean
    /** Receives the word boxes per side and returns how many field boxes grew. */
    onFit: (words: ReadonlyArray<{ side: Side; words: Rect[] }>) => number
  } = $props()

  type Result = { kind: 'done'; n: number } | { kind: 'none' } | { kind: 'failed' }

  let status = $state<OcrStatus | null>(null)
  let running = $state(false)
  let result = $state<Result | null>(null)
  /** False once the editor is left (e.g. Adjust corners): a run still in progress then discards its results. */
  let mounted = true

  async function check (): Promise<void> {
    try {
      status = await (await loadOcr()).ocrStatus()
    } catch {
      status = { state: 'unavailable', reason: navigator.onLine ? 'unsupported' : 'offline' }
    }
  }

  onMount(() => {
    void check()
    const recheck = (): void => { if (!running) void check() }
    addEventListener('online', recheck)
    addEventListener('offline', recheck)
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    sw?.addEventListener('controllerchange', recheck)
    return () => {
      mounted = false
      removeEventListener('online', recheck)
      removeEventListener('offline', recheck)
      sw?.removeEventListener('controllerchange', recheck)
    }
  })

  async function run (): Promise<void> {
    running = true
    result = null
    try {
      const words = await (await loadOcr()).wordBoxesOnCard(cards)
      // The cards may have been re-aligned meanwhile: these boxes belong to the old alignment.
      if (!mounted) return
      const n = onFit(words)
      result = n > 0 ? { kind: 'done', n } : { kind: 'none' }
    } catch {
      result = { kind: 'failed' }
    } finally {
      running = false
      void check()
    }
  }

  const unavailable = $derived(status?.state === 'unavailable')
</script>

<div class="fit-zones">
  <p class="hint">{t(lang, 'fitHint')}</p>
  <button type="button" class="button small" id="fit-zones" disabled={disabled || status === null || unavailable || running || cards.length === 0}
    onclick={() => { void run() }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M8 12h8" /></svg>
    {t(lang, 'fitZones')}
  </button>
  <div aria-live="polite" id="fit-status">
    {#if running}
      <p class="hint">{t(lang, 'findRunning')}</p>
    {:else if result?.kind === 'done'}
      <p class="hint">{tf(lang, 'fitDone', { n: result.n })}</p>
    {:else if result?.kind === 'none'}
      <p class="hint">{t(lang, 'fitNone')}</p>
    {:else if result?.kind === 'failed'}
      <p class="warning">{t(lang, 'fitFailed')}</p>
    {:else if unavailable}
      <p class="hint">{t(lang, 'fitUnavailable')}</p>
    {:else if status?.state === 'download'}
      <p class="hint">{tf(lang, 'findDownload', { mb: status.megabytes })}</p>
    {/if}
  </div>
</div>
