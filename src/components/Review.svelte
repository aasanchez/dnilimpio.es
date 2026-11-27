<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Review before download (spec §17): final sanitised images, summary, warning, explicit confirmation.
     After the download: send it yourself (WhatsApp, email) and clear everything.
     The app never sends the PDF: the system share sheet or a wa.me or mailto: link does, and only when
     the user acts. -->
<script lang="ts">
  import { saveFile } from '../engine/render.ts'
  import { loadExport } from '../engine/load-export.ts'
  import { normaliseWatermark } from '../engine/watermark.ts'
  import { shrink } from '../engine/wipe.ts'
  import { t, tf, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, secure, phase, hiddenCount, boxCount, watermark, greyscale, onDone, onReset, onFinish }: {
    lang: Lang
    secure: Readonly<Record<Side, HTMLCanvasElement>>
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
    return () => { shrink(node) }
  }

  // Leaving the review (Reset, Back, leaving the page): drop the PDF kept for sharing. Download URLs
  // still open are revoked by the shell's reset (downloads.ts).
  let mounted = true
  $effect(() => () => {
    mounted = false
    pdf = null
    shareable = false
  })

  async function download (): Promise<void> {
    if (!confirmed || busy) return
    busy = true
    status = 'idle'
    try {
      const { exportPdf, PDF_FILE_NAME } = await loadExport()
      const blob = await exportPdf(SIDES.map((s) => secure[s]))
      // Left meanwhile (Reset, leaving the page): the PDF is not saved and not kept.
      if (!mounted) return
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

  /** Text for the manual links (no file can travel in a wa.me or mailto: link). */
  const message = $derived(t(lang, 'shareMessage'))
  const whatsappHref = $derived(`https://wa.me/?text=${encodeURIComponent(message)}`)
  const mailHref = $derived(`mailto:?subject=${encodeURIComponent(t(lang, 'shareSubject'))}&body=${encodeURIComponent(message)}`)

  /** Opens the system share sheet with the PDF; the user picks WhatsApp, Mail or another app there. */
  async function share (): Promise<void> {
    if (!pdf) return
    shareStatus = 'idle'
    try {
      await navigator.share({ files: [pdf], title: t(lang, 'shareSubject') })
    } catch (e) {
      // Closing the share sheet is not an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) shareStatus = 'error'
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
      {#each SIDES as s (s)}
        <figure class="win m-0">
          <figcaption class="winbar"><i></i><i></i><i></i><span class="title">{sideName(s)}</span></figcaption>
          <div class="winbody"><canvas class="block h-auto w-full rounded-md" id="review-{s}" {@attach copyOf(s)}></canvas></div>
        </figure>
      {/each}
    </div>
    <div class="area-side flex flex-col gap-4">
      <ul class="term" id="review-summary">
        <li><span class="p">✓</span> {tf(lang, 'summaryHidden', { n: hiddenCount })}</li>
        <li><span class="p">✓</span> {tf(lang, 'summaryBoxes', { n: boxCount })}</li>
        <li><span class="p">✓</span> {mark === '' ? t(lang, 'summaryNoWatermark') : tf(lang, 'summaryWatermark', { text: mark })}</li>
        <li><span class="p">✓</span> {t(lang, greyscale ? 'summaryGreyscale' : 'summaryColour')}</li>
      </ul>
      <p class="notice-warn" id="review-warning">{t(lang, 'reviewWarning')}</p>
      <label class="flex min-h-14.5 items-center gap-3 rounded-lg border-2 border-ink bg-surface px-3.5 py-2.5 has-checked:bg-sunk"><input type="checkbox" class="check" id="review-confirm" bind:checked={confirmed} /> {t(lang, 'reviewConfirm')}</label>
      <p class="notice-warn" id="download-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? t(lang, 'errExport') : ''}</p>
      <button type="button" class="link-button" id="reset-review" onclick={onReset}>{t(lang, 'reset')}</button>
    </div>

    <div class="actionbar">
      <button type="button" class="button primary" id="download" disabled={!confirmed || busy} onclick={download}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        {t(lang, 'downloadPdf')}
      </button>
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
      <p class="term" aria-hidden="true"><span class="p">$</span> dt.es export<br />→ protected-document.pdf · 2 pp · ok<br />→ {t(lang, 'logSent')}<br /><span class="p">_</span></p>
    </div>
    <div class="area-side flex flex-col gap-4">
      <p class="lead" id="download-status" role="status">{status === 'done' ? t(lang, 'downloaded') : ''}</p>

      <section class="send grid gap-2.5 rounded-lg border-2 border-ink bg-surface p-3.5" aria-labelledby="send-title">
        <h3 class="text-lg font-extrabold" id="send-title">{t(lang, 'sendTitle')}</h3>
        <p class="hint" id="send-lead">{t(lang, shareable ? 'sendLeadShare' : 'sendLeadManual')}</p>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2.5">
          {#if shareable}
            <button type="button" class="button" id="share-whatsapp" onclick={share}>{@render whatsappIcon()}{t(lang, 'shareWhatsApp')}</button>
            <button type="button" class="button" id="share-email" onclick={share}>{@render mailIcon()}{t(lang, 'shareEmail')}</button>
          {:else}
            <a class="button" id="share-whatsapp" href={whatsappHref} target="_blank" rel="noopener noreferrer">{@render whatsappIcon()}{t(lang, 'shareWhatsApp')}</a>
            <a class="button" id="share-email" href={mailHref}>{@render mailIcon()}{t(lang, 'shareEmail')}</a>
          {/if}
        </div>
        {#if shareStatus === 'error'}<p class="notice-warn" role="alert">{t(lang, 'errShare')}</p>{/if}
      </section>
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

{#snippet whatsappIcon ()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8.4 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" /></svg>
{/snippet}

{#snippet mailIcon ()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></svg>
{/snippet}
