<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Review before download (spec §17): final sanitised images, summary, warning, explicit confirmation.
     After the download: share (where the browser can share files) and clear everything. -->
<script lang="ts">
  import { saveFile } from '../engine/render.ts'
  import { loadExport } from '../engine/load-export.ts'
  import { normaliseWatermark } from '../engine/watermark.ts'
  import { t, tf, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, secure, phase, hiddenCount, boxCount, watermark, greyscale, onDone, onReset }: {
    lang: Lang
    secure: Readonly<Record<Side, HTMLCanvasElement>>
    phase: 'review' | 'done'
    hiddenCount: number
    boxCount: number
    watermark: string
    greyscale: boolean
    onDone: () => void
    onReset: () => void
  } = $props()

  const SIDES = ['front', 'back'] as const
  let confirmed = $state(false)
  let busy = $state(false)
  let status = $state<'idle' | 'done' | 'error'>('idle')
  /** The last PDF, kept in memory only so it can be shared; dropped with the editor. */
  let pdf: File | null = null
  let shareStatus = $state<'idle' | 'error'>('idle')
  const mark = $derived(normaliseWatermark(watermark))
  const sideName = (s: Side): string => t(lang, s === 'front' ? 'tabFront' : 'tabBack')

  /** Web Share with files: most phones, a few desktop browsers. */
  const canShareFiles = (f: File): boolean => typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] })
  let shareable = $state(false)

  /** Shows a copy of the sanitised raster: the same pixels that go into the PDF. */
  const copyOf = (s: Side) => (node: HTMLCanvasElement): () => void => {
    const src = secure[s]
    node.width = src.width
    node.height = src.height
    node.getContext('2d')?.drawImage(src, 0, 0)
    return () => {
      node.width = 0
      node.height = 0
    }
  }

  async function download (): Promise<void> {
    if (!confirmed || busy) return
    busy = true
    status = 'idle'
    try {
      const { exportPdf, PDF_FILE_NAME } = await loadExport()
      const blob = await exportPdf(SIDES.map((s) => secure[s]))
      saveFile(blob, PDF_FILE_NAME)
      pdf = new File([blob], PDF_FILE_NAME, { type: 'application/pdf' })
      shareable = canShareFiles(pdf)
      status = 'done'
      onDone()
    } catch {
      status = 'error'
    } finally {
      busy = false
    }
  }

  async function share (): Promise<void> {
    if (!pdf) return
    shareStatus = 'idle'
    try {
      await navigator.share({ files: [pdf] })
    } catch (e) {
      // Closing the share sheet is not an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) shareStatus = 'error'
    }
  }
</script>

{#if phase === 'review'}
  <section class="step review">
    <div>
      <p class="kicker">{t(lang, 'reviewKicker')}</p>
      <h2 id="review-title">{t(lang, 'reviewTitle')}</h2>
      <p class="lead">{t(lang, 'reviewLead')}</p>
    </div>
    {#each SIDES as s (s)}
      <figure class="win result">
        <figcaption class="winbar"><i></i><i></i><i></i><span class="title">{sideName(s)}</span></figcaption>
        <div class="winbody"><canvas class="card-result" id="review-{s}" {@attach copyOf(s)}></canvas></div>
      </figure>
    {/each}
    <ul class="term" id="review-summary">
      <li><span class="p">✓</span> {tf(lang, 'summaryHidden', { n: hiddenCount })}</li>
      <li><span class="p">✓</span> {tf(lang, 'summaryBoxes', { n: boxCount })}</li>
      <li><span class="p">✓</span> {mark === '' ? t(lang, 'summaryNoWatermark') : tf(lang, 'summaryWatermark', { text: mark })}</li>
      <li><span class="p">✓</span> {t(lang, greyscale ? 'summaryGreyscale' : 'summaryColour')}</li>
    </ul>
    <p class="warning" id="review-warning">{t(lang, 'reviewWarning')}</p>
    <label class="confirm"><input type="checkbox" id="review-confirm" bind:checked={confirmed} /> {t(lang, 'reviewConfirm')}</label>
    <p class="error" id="download-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? t(lang, 'errExport') : ''}</p>
    <button type="button" class="link-button" id="reset-review" onclick={onReset}>{t(lang, 'reset')}</button>

    <div class="actionbar">
      <button type="button" class="button primary" id="download" disabled={!confirmed || busy} onclick={download}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        {t(lang, 'downloadPdf')}
      </button>
    </div>
  </section>
{:else}
  <section class="step done">
    <div>
      <p class="kicker">{t(lang, 'doneKicker')}</p>
      <h2>{t(lang, 'doneTitle')}</h2>
    </div>
    <div class="win">
      <div class="winbar"><i></i><i></i><i></i><span class="title">export.log</span></div>
      <p class="term" aria-hidden="true"><span class="p">$</span> dni-limpio export<br />→ protected-document.pdf · 2 pp · ok<br />→ {t(lang, 'logSent')}<br /><span class="p">_</span></p>
    </div>
    <p class="lead" id="download-status" role="status">{status === 'done' ? t(lang, 'downloaded') : ''}</p>
    <p class="hint">{t(lang, 'doneHint')}</p>
    {#if shareStatus === 'error'}<p class="error" role="alert">{t(lang, 'errShare')}</p>{/if}

    <div class="actionbar">
      <div class="row">
        {#if shareable}
          <button type="button" class="button primary" id="share" onclick={share}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
            {t(lang, 'share')}
          </button>
        {/if}
        <button type="button" class="button" class:primary={!shareable} id="reset-done" onclick={onReset}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
          {t(lang, 'clearAll')}
        </button>
      </div>
    </div>
  </section>
{/if}
