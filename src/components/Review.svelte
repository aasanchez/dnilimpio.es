<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Review before download (spec §17): final sanitised images, summary, warning, explicit confirmation.
     After the download: send it yourself (WhatsApp, Telegram, Gmail, mail app) and clear everything.
     The app never sends the PDF: the system share sheet does, with the file, or an app opened by a
     link does, with a fixed message and no file (src/engine/share-links.ts). Only when the user acts. -->
<script lang="ts">
  import { saveFile } from '../engine/render.ts'
  import { loadExport } from '../engine/load-export.ts'
  import { normaliseWatermark } from '../engine/watermark.ts'
  import { SHARE_TARGETS, opensNewTab, shareHref, type ShareTarget } from '../engine/share-links.ts'
  import { shrink } from '../engine/wipe.ts'
  import { t, tf, type Lang } from '../i18n/index.ts'
  import type { Side } from '../zones/dni.ts'

  const { lang, secure, sides, phase, hiddenCount, boxCount, watermark, greyscale, onDone, onReset }: {
    lang: Lang
    secure: Readonly<Record<Side, HTMLCanvasElement>>
    /** The sides to show and export, front first: one page each. The back is optional. */
    sides: readonly Side[]
    phase: 'review' | 'done'
    hiddenCount: number
    boxCount: number
    watermark: string
    greyscale: boolean
    onDone: () => void
    onReset: () => void
  } = $props()

  let confirmed = $state(false)
  let busy = $state(false)
  let status = $state<'idle' | 'done' | 'error'>('idle')
  /** The last PDF, kept in memory only so it can be shared; dropped with the editor. */
  let pdf: File | null = null
  let shareStatus = $state<'idle' | 'error'>('idle')
  const mark = $derived(normaliseWatermark(watermark))
  /** The back photo was skipped: the copy has the front only. */
  const oneSide = $derived(!sides.includes('back'))
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
      const blob = await exportPdf(sides.map((s) => secure[s]))
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

  /** Text for the links: a fixed message that names the file. No file can travel in a link. */
  const message = $derived(t(lang, 'shareMessage'))
  const subject = $derived(t(lang, 'shareSubject'))
  /** App names are brands, not translated. The mail link opens the default mail app (Apple Mail, Outlook…), so it has a generic name. */
  const targetName = (target: ShareTarget): string =>
    target === 'whatsapp' ? 'WhatsApp' : target === 'telegram' ? 'Telegram' : target === 'gmail' ? 'Gmail' : t(lang, 'shareEmail')

  /** Opens the system share sheet with the PDF; the user picks WhatsApp, Telegram, Gmail, Mail or another app there. */
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
      <p class="term" aria-hidden="true"><span class="p">$</span> dt.es export<br />→ protected-document.pdf · {sides.length} pp · ok<br />→ {t(lang, 'logSent')}<br /><span class="p">_</span></p>
    </div>
    <div class="area-side flex flex-col gap-4">
      <p class="lead" id="download-status" role="status">{status === 'done' ? t(lang, 'downloaded') : ''}</p>

      <section class="send grid gap-2.5 rounded-lg border-2 border-ink bg-surface p-3.5" aria-labelledby="send-title">
        <h3 class="text-lg font-extrabold" id="send-title">{t(lang, 'sendTitle')}</h3>
        <p class="hint" id="send-lead">{t(lang, shareable ? 'sendLeadShare' : 'sendLeadManual')}</p>
        {#if shareable}
          <button type="button" class="button primary" id="share-file" onclick={share}>{@render shareIcon()}{t(lang, 'shareFile')}</button>
          <p class="hint" id="send-links-lead">{t(lang, 'sendLinksLead')}</p>
        {/if}
        <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]" id="share-links">
          {#each SHARE_TARGETS as target (target)}
            <a class="button" id="share-{target}" href={shareHref(target, message, subject)} target={opensNewTab(target) ? '_blank' : undefined} rel={opensNewTab(target) ? 'noopener noreferrer' : undefined}>{@render targetIcon(target)}{targetName(target)}</a>
          {/each}
        </div>
        {#if shareStatus === 'error'}<p class="notice-warn" role="alert">{t(lang, 'errShare')}</p>{/if}
      </section>
      <p class="hint">{t(lang, 'doneHint')}</p>
    </div>

    <div class="actionbar">
      <button type="button" class="button primary" id="reset-done" onclick={onReset}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
        {t(lang, 'clearAll')}
      </button>
    </div>
  </section>
{/if}

{#snippet shareIcon ()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /></svg>
{/snippet}

{#snippet targetIcon (target: ShareTarget)}
  {#if target === 'whatsapp'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-4A8 8 0 1 1 8.4 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" /></svg>
  {:else if target === 'telegram'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4L3 11l6 2.5M21 4l-3 16-9-6.5M21 4L9 13.5V19l3-3" /></svg>
  {:else if target === 'gmail'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18V7l9 6.5L21 7v11" /><path d="M3 7a2 2 0 0 1 3.2-1.6L12 9.8l5.8-4.4A2 2 0 0 1 21 7" /></svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></svg>
  {/if}
{/snippet}
