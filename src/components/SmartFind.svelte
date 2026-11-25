<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Smart field finding: on-device OCR reads both straightened sides and adds black boxes over the
     data the user picks (src/ocr/find.ts). Online first, offline optional: when OCR cannot run, the
     button is disabled with a short reason and the user hides the data by hand. It never shows a raw error. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { DEFAULT_KINDS, FOUND_KINDS, type FoundKind } from '../ocr/find.ts'
  import { loadOcr } from '../ocr/load-ocr.ts'
  import type { OcrStatus } from '../ocr/ocr.ts'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import type { Rect, Side } from '../zones/types.ts'

  const { lang, cards, onFound }: {
    lang: Lang
    /** Straightened sides to read. */
    cards: ReadonlyArray<readonly [Side, HTMLCanvasElement]>
    /** Receives the rectangles to cover per side and returns how many boxes were added. */
    onFound: (rects: ReadonlyArray<{ side: Side; rects: Rect[] }>) => number
  } = $props()

  const KIND_KEYS: Readonly<Record<FoundKind, Key>> = {
    name: 'find_name',
    idNumber: 'find_idNumber',
    date: 'find_date',
    supportNumber: 'field_supportNumber',
    can: 'field_can',
    mrz: 'field_mrz',
  }

  type Result = { kind: 'done'; n: number } | { kind: 'none' } | { kind: 'failed' }

  let status = $state<OcrStatus | null>(null)
  let kinds = $state<FoundKind[]>([...DEFAULT_KINDS])
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
    // On a first visit the service worker may take control after this screen opens.
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    sw?.addEventListener('controllerchange', recheck)
    return () => {
      mounted = false
      removeEventListener('online', recheck)
      removeEventListener('offline', recheck)
      sw?.removeEventListener('controllerchange', recheck)
    }
  })

  function toggleKind (k: FoundKind, on: boolean): void {
    kinds = on ? FOUND_KINDS.filter((x) => x === k || kinds.includes(x)) : kinds.filter((x) => x !== k)
  }

  async function run (): Promise<void> {
    running = true
    result = null
    try {
      const ocr = await loadOcr()
      const found = await ocr.findOnCard(cards)
      // The cards may have been re-aligned meanwhile: these boxes belong to the old alignment.
      if (!mounted) return
      const picked = found.map(({ side, found: f }) => ({ side, rects: f.filter((x) => kinds.includes(x.kind)).map((x) => x.rect) }))
      const n = onFound(picked)
      result = n > 0 ? { kind: 'done', n } : { kind: 'none' }
    } catch {
      result = { kind: 'failed' }
    } finally {
      running = false
      void check()
    }
  }

  const unavailable = $derived(status?.state === 'unavailable' ? status.reason : null)
</script>

<section class="smart-find" aria-labelledby="find-title">
  <h3 id="find-title">{t(lang, 'findTitle')}</h3>
  <p class="hint">{t(lang, 'findIntro')}</p>
  <div class="chips" role="group" aria-label={t(lang, 'findKinds')}>
    {#each FOUND_KINDS as k (k)}
      <label class="chip" class:is-on={kinds.includes(k)}>
        <input type="checkbox" class="visually-hidden" id="find-kind-{k}" checked={kinds.includes(k)} disabled={running}
          onchange={(e) => { toggleKind(k, e.currentTarget.checked) }} />{kinds.includes(k) ? '◉' : '○'} {t(lang, KIND_KEYS[k])}
      </label>
    {/each}
  </div>
  <button type="button" class="button" id="find-run" disabled={status === null || unavailable !== null || running || kinds.length === 0 || cards.length === 0}
    onclick={() => { void run() }}>{t(lang, 'findRun')}</button>
  <div aria-live="polite" id="find-status">
    {#if running}
      <p class="hint">{t(lang, 'findRunning')}</p>
    {:else if result?.kind === 'done'}
      <p class="hint">{tf(lang, 'findDone', { n: result.n })}</p>
    {:else if result?.kind === 'none'}
      <p class="hint">{t(lang, 'findNone')}</p>
    {:else if result?.kind === 'failed'}
      <p class="warning">{t(lang, 'findFailed')}</p>
    {:else if unavailable === 'offline'}
      <p class="hint">{t(lang, 'findOffline')}</p>
    {:else if unavailable !== null}
      <p class="hint">{t(lang, 'findUnsupported')}</p>
    {:else if status?.state === 'download'}
      <p class="hint">{tf(lang, 'findDownload', { mb: status.megabytes })}</p>
    {/if}
  </div>
</section>
