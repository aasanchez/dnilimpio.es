<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Review before download (spec §17): final sanitised images, summary, warning, explicit confirmation.
     Then Download, or Share where the browser can share files: the system share sheet gets the PDF
     on the device, and the user picks the app (WhatsApp, Telegram, Gmail, Mail…) and the person.
     The app never sends the PDF. After that: clear everything. -->
<script lang="ts">
  import { saveFile } from '../engine/render.ts'
  import { loadExport } from '../engine/load-export.ts'
  import { normaliseWatermark } from '../engine/watermark.ts'
  import { shrink } from '../engine/wipe.ts'
  import { t, tf, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, secure, sides, phase, hiddenCount, boxCount, watermark, greyscale, onDone, onReset, onFinish }: {
    lang: Lang
    secure: Readonly<Record<Side, HTMLCanvasElement>>
    /** The sides to show and export, front first, all on one PDF page. The back is optional. */
    sides: readonly Side[]
    phase: 'review' | 'done'
    hiddenCount: number
    boxCount: number
    watermark: string
    greyscale: boolean
    onDone: () => void
    onReset: () => void
    /** "Clear everything" after the download: clears the photos and opens the thanks page (ADR 0029). */
    onFinish: () => void
  } = $props()

  let confirmed = $state(false)
  let busy = $state(false)
  /** How the PDF left the review: saved to the downloads folder or handed to the share sheet. */
  let status = $state<'idle' | 'downloaded' | 'shared' | 'error'>('idle')
  let shareStatus = $state<'idle' | 'error'>('idle')
  /** The PDF, kept in memory only for this review; dropped when the review closes. */
  let pdf: File | null = null
  let pending: Promise<File> | null = null
  const mark = $derived(normaliseWatermark(watermark))
  /** The back photo was skipped: the copy has the front only. */
  const oneSide = $derived(!sides.includes('back'))
  const sideName = (s: Side): string => t(lang, s === 'front' ? 'tabFront' : 'tabBack')

  /** Web Share with files: most phones, Safari on macOS, Chrome on Windows and ChromeOS. */
  const shareable = typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([], 'protected-document.pdf', { type: 'application/pdf' })] })

  /** Shows a copy of the sanitised raster: the same pixels that go into the PDF. */
  const copyOf = (s: Side) => (node: HTMLCanvasElement): () => void => {
    const src = secure[s]
    node.width = src.width
    node.height = src.height
    node.getContext('2d')?.drawImage(src, 0, 0)
    return () => { shrink(node) }
  }

  // Leaving the review (Reset, Back, leaving the page): drop the PDF. Download URLs still open are
  // revoked by the shell's reset (downloads.ts).
  let mounted = true
  $effect(() => () => {
    mounted = false
    pdf = null
    pending = null
  })

  /** Builds the PDF once. Failure is not kept: the next click tries again. */
  function makePdf (): Promise<File> {
    pending ??= (async () => {
      const { exportPdf, PDF_FILE_NAME } = await loadExport()
      const blob = await exportPdf(sides.map((s) => secure[s]))
      const file = new File([blob], PDF_FILE_NAME, { type: 'application/pdf' })
      if (mounted) pdf = file
      return file
    })().catch((e: unknown) => {
      pending = null
      throw e
    })
    return pending
  }

  // Once the user confirms, build the PDF ahead. The share sheet must open within the click's user
  // activation, and building the PDF can take longer than that on a slow phone.
  $effect(() => {
    if (confirmed && shareable) makePdf().catch(() => { /* the click shows the error */ })
  })

  async function download (): Promise<void> {
    if (!confirmed || busy) return
    busy = true
    status = 'idle'
    try {
      const file = pdf ?? await makePdf()
      // Left meanwhile (Reset, leaving the page): the PDF is not saved.
      if (!mounted) return
      saveFile(file, file.name)
      status = 'downloaded'
      onDone()
    } catch {
      status = 'error'
    } finally {
      busy = false
    }
  }

  /** Opens the system share sheet with the PDF. Only the file and a title: no text, no link. */
  async function share (): Promise<void> {
    if (!confirmed || busy) return
    busy = true
    status = 'idle'
    shareStatus = 'idle'
    try {
      // When the PDF is ready, share() runs in the click itself, with no await before it.
      const file = pdf ?? await makePdf()
      if (!mounted) return
      await navigator.share({ files: [file], title: t(lang, 'shareSubject') })
      status = 'shared'
      onDone()
    } catch (e) {
      // Closing the share sheet is not an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) shareStatus = 'error'
    } finally {
      busy = false
    }
  }
</script>

{#if phase === 'review'}
  <section class="step review split flex-1">
    <div class="area-head">
      <p class="kicker">{t(lang, 'reviewKicker')}</p>
      <h2 id="review-title">{t(lang, 'reviewTitle')}</h2>
      <p class="lead">{t(lang, 'reviewLead')}</p>
    </div>
    <div class="area-stage flex flex-col gap-4">
      {#each sides as s (s)}
        <figure class="win m-0">
          <figcaption class="winbar"><i></i><i></i><i></i><span class="title">{sideName(s)}</span></figcaption>
          <div class="winbody"><canvas class="block h-auto w-full rounded-md" id="review-{s}" {@attach copyOf(s)}></canvas></div>
        </figure>
      {/each}
    </div>
    <div class="area-side flex flex-col gap-4">
      <ul class="term" id="review-summary">
        {#if oneSide}<li id="summary-front-only"><span class="p">✓</span> {t(lang, 'frontOnly')}</li>{/if}
        <li><span class="p">✓</span> {tf(lang, 'summaryHidden', { n: hiddenCount })}</li>
        <li><span class="p">✓</span> {tf(lang, 'summaryBoxes', { n: boxCount })}</li>
        <li><span class="p">✓</span> {mark === '' ? t(lang, 'summaryNoWatermark') : tf(lang, 'summaryWatermark', { text: mark })}</li>
        <li><span class="p">✓</span> {t(lang, greyscale ? 'summaryGreyscale' : 'summaryColour')}</li>
      </ul>
      <p class="notice-warn" id="review-warning">{t(lang, oneSide ? 'reviewWarningFront' : 'reviewWarning')}</p>
      <label class="flex min-h-14.5 items-center gap-3 rounded-lg border-2 border-ink bg-surface px-3.5 py-2.5 has-checked:bg-sunk"><input type="checkbox" class="check" id="review-confirm" bind:checked={confirmed} /> {t(lang, oneSide ? 'reviewConfirmFront' : 'reviewConfirm')}</label>
      <p class="notice-warn" id="download-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? t(lang, 'errExport') : ''}</p>
      <button type="button" class="link-button" id="reset-review" onclick={onReset}>{t(lang, 'reset')}</button>
    </div>

    <div class="actionbar">
      {#if shareStatus === 'error'}<p class="notice-warn" id="share-error" role="alert">{t(lang, 'errShare')}</p>{/if}
      <div class="flex flex-col gap-2.5 lg:flex-row lg:*:flex-1">
        {#if shareable}
          <button type="button" class="button primary" id="share-file" disabled={!confirmed || busy} onclick={share}>{@render shareIcon()}{t(lang, 'shareFile')}</button>
        {/if}
        <button type="button" class={shareable ? 'button' : 'button primary'} id="download" disabled={!confirmed || busy} onclick={download}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
          {t(lang, 'downloadPdf')}
        </button>
      </div>
    </div>
  </section>
{:else}
  <section class="step done split flex-1">
    <div class="area-head">
      <p class="kicker">{t(lang, 'doneKicker')}</p>
      <h2 class="text-[2rem] font-extrabold tracking-[-1px]">{t(lang, 'doneTitle')}</h2>
    </div>
    <div class="win area-stage">
      <div class="winbar"><i></i><i></i><i></i><span class="title">export.log</span></div>
      <p class="term" aria-hidden="true"><span class="p">$</span> dt.es export<br />→ protected-document.pdf · {sides.length} pp · ok<br />→ {t(lang, 'logSent')}<br /><span class="p">_</span></p>
    </div>
    <div class="area-side flex flex-col gap-4">
      <p class="lead" id="download-status" role="status">{status === 'downloaded' ? t(lang, 'downloaded') : status === 'shared' ? t(lang, 'shared') : ''}</p>
      <p class="hint">{t(lang, 'doneHint')}</p>
    </div>

    <div class="actionbar">
      <button type="button" class="button primary" id="reset-done" onclick={onFinish}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
        {t(lang, 'clearAll')}
      </button>
    </div>
  </section>
{/if}

{#snippet shareIcon ()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /></svg>
{/snippet}
