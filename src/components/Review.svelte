<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Review before download (spec §17): final sanitised images, summary, warning, explicit confirmation. -->
<script lang="ts">
  import { saveFile } from '../engine/render.ts'
  import { loadExport } from '../engine/load-export.ts'
  import { normaliseWatermark } from '../engine/watermark.ts'
  import { t, tf, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, secure, hiddenCount, watermark, greyscale, onBack, onReset }: {
    lang: Lang
    secure: Readonly<Record<Side, HTMLCanvasElement>>
    hiddenCount: number
    watermark: string
    greyscale: boolean
    onBack: () => void
    onReset: () => void
  } = $props()

  const SIDES = ['front', 'back'] as const
  let confirmed = $state(false)
  let busy = $state(false)
  let status = $state<'idle' | 'done' | 'error'>('idle')
  const mark = $derived(normaliseWatermark(watermark))

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
      saveFile(await exportPdf(SIDES.map((s) => secure[s])), PDF_FILE_NAME)
      status = 'done'
    } catch {
      status = 'error'
    } finally {
      busy = false
    }
  }
</script>

<div class="review">
  <h3 id="review-title" tabindex="-1">{t(lang, 'reviewTitle')}</h3>
  <p class="warning" id="review-warning">{t(lang, 'reviewWarning')}</p>
  {#each SIDES as s (s)}
    <figure class="result">
      <figcaption>{t(lang, s === 'front' ? 'tabFront' : 'tabBack')}</figcaption>
      <canvas class="card-result" id="review-{s}" {@attach copyOf(s)}></canvas>
    </figure>
  {/each}
  <ul class="summary" id="review-summary">
    <li>{tf(lang, 'summaryHidden', { n: hiddenCount })}</li>
    <li>{mark === '' ? t(lang, 'summaryNoWatermark') : tf(lang, 'summaryWatermark', { text: mark })}</li>
    <li>{t(lang, greyscale ? 'summaryGreyscale' : 'summaryColour')}</li>
  </ul>
  <label class="check"><input type="checkbox" id="review-confirm" bind:checked={confirmed} /> {t(lang, 'reviewConfirm')}</label>
  <div class="actions">
    <button type="button" class="button" id="download" disabled={!confirmed || busy} onclick={download}>{t(lang, 'downloadPdf')}</button>
    <button type="button" class="button secondary" id="back-to-edit" onclick={onBack}>{t(lang, 'backToEdit')}</button>
    <button type="button" class="button secondary" id="reset-review" onclick={onReset}>{t(lang, 'reset')}</button>
  </div>
  <p class="status" id="download-status" role={status === 'error' ? 'alert' : 'status'}>
    {status === 'done' ? t(lang, 'downloaded') : status === 'error' ? t(lang, 'errExport') : ''}
  </p>
</div>
