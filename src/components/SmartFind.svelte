<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Smart field finding: on-device OCR reads both straightened sides and adds black boxes over the
     data of the fields switched to hidden in the fields list above (src/ocr/find.ts). The switches are
     the only choice: there is no second list of what to look for (ADR 0043). Online first, offline optional: when OCR cannot run, the
     button is disabled with a short reason and the user hides the data by hand. It never shows a raw error. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { coverFor, isFindable } from '../ocr/find.ts'
  import { loadOcr } from '../ocr/load-ocr.ts'
  import type { OcrStatus } from '../ocr/ocr.ts'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import type { ModelZones, Rect, Side, ZoneId } from '../zones/types.ts'

  const { lang, cards, doc, fields, hidden, onFound }: {
    lang: Lang
    /** Straightened sides to read. */
    cards: ReadonlyArray<readonly [Side, HTMLCanvasElement]>
    /** The document's zones as placed now: they tell which date field a found date is. */
    doc: ModelZones
    /** The fields of the list, in its order. */
    fields: readonly ZoneId[]
    /** The fields switched to hidden: the search covers what it finds of these. */
    hidden: ReadonlySet<ZoneId>
    /** Receives the rectangles to cover per side and returns how many boxes were added. */
    onFound: (rects: ReadonlyArray<{ side: Side; rects: Rect[] }>) => number
  } = $props()

  const fieldName = (id: ZoneId): string => t(lang, `field_${id}` as Key)
  const list = (ids: readonly ZoneId[]): string => new Intl.ListFormat(lang, { type: 'conjunction' }).format(ids.map(fieldName))
  /** Hidden fields the search looks for, and hidden fields only their fixed box covers. */
  const sought = $derived(fields.filter((id) => hidden.has(id) && isFindable(id)))
  const boxOnly = $derived(fields.filter((id) => hidden.has(id) && !isFindable(id)))

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

  async function run (): Promise<void> {
    running = true
    result = null
    try {
      const ocr = await loadOcr()
      const found = await ocr.findOnCard(cards)
      // The cards may have been re-aligned meanwhile: these boxes belong to the old alignment.
      if (!mounted) return
      const zonesOf = (side: Side): ModelZones['zones'] => doc.zones.filter((z) => z.side === side)
      const picked = coverFor(found.map(({ side, found: f }) => ({ side, found: f, zones: zonesOf(side) })), hidden)
      const n = onFound(picked.map(({ side, rects }) => ({ side: side as Side, rects })))
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

<section class="mt-4 grid gap-2 border-t border-dashed border-dash pt-4" aria-labelledby="find-title">
  <h3 class="text-base" id="find-title">{t(lang, 'findTitle')}</h3>
  <p class="hint">{t(lang, 'findIntro')}</p>
  {#if sought.length > 0}
    <p class="hint" id="find-sought">{tf(lang, 'findSought', { fields: list(sought) })}</p>
  {:else}
    <p class="hint" id="find-sought">{t(lang, 'findNothing')}</p>
  {/if}
  {#if boxOnly.length > 0}<p class="hint" id="find-box-only">{tf(lang, 'findBoxOnly', { fields: list(boxOnly) })}</p>{/if}
  <button type="button" class="button justify-self-start" id="find-run" disabled={status === null || unavailable !== null || running || sought.length === 0 || cards.length === 0}
    onclick={() => { void run() }}>{t(lang, 'findRun')}</button>
  <div aria-live="polite" id="find-status">
    {#if running}
      <p class="hint">{t(lang, 'findRunning')}</p>
    {:else if result?.kind === 'done'}
      <p class="hint">{tf(lang, 'findDone', { n: result.n })}</p>
    {:else if result?.kind === 'none'}
      <p class="hint">{t(lang, 'findNone')}</p>
    {:else if result?.kind === 'failed'}
      <p class="notice-warn">{t(lang, 'findFailed')}</p>
    {:else if unavailable === 'offline'}
      <p class="hint">{t(lang, 'findOffline')}</p>
    {:else if unavailable !== null}
      <p class="hint">{t(lang, 'findUnsupported')}</p>
    {:else if status?.state === 'download'}
      <p class="hint">{tf(lang, 'findDownload', { mb: status.megabytes })}</p>
    {/if}
  </div>
</section>
