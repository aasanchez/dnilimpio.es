<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Thanks page (ADR 0029): the photos are gone. Shows the anonymous usage stats, exactly as they would
     be sent, and sends them only when the person taps Send. Offline, nothing can be sent. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { dir, isLang, pickLang, t, type Lang } from '../i18n/index.ts'
  import { deviceStats } from '../stats/device.ts'
  import { encodeStats, type SessionStats } from '../stats/schema.ts'
  import { sendStats } from '../stats/send.ts'

  const { session: initial }: { session: SessionStats | undefined } = $props()
  // Read once: the page shows and sends the figures it opened with.
  const session = untrack(() => initial)

  /** The product name, as in App.svelte. */
  const BRAND = 'DNI Tapado.es'

  const lang: Lang = session !== undefined && isLang(session.lang) ? session.lang : pickLang(navigator.languages)
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const text = session === undefined
    ? undefined
    : encodeStats({ ...session, ...deviceStats({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone }) })
  const lines = text?.split('&') ?? []

  let online = $state(navigator.onLine)
  let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle')

  $effect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir(lang)
    const update = (): void => { online = navigator.onLine }
    addEventListener('online', update)
    addEventListener('offline', update)
    return () => {
      removeEventListener('online', update)
      removeEventListener('offline', update)
    }
  })

  async function send (): Promise<void> {
    if (text === undefined || status === 'sending' || status === 'sent' || !online) return
    status = 'sending'
    status = await sendStats(text) ? 'sent' : 'error'
  }
</script>

<div class="app mx-auto flex min-h-dvh max-w-[40rem] flex-col">
  <header class="flex min-h-[58px] items-center gap-2 border-b border-hair bg-paper px-3">
    <a class="brand flex min-h-11 flex-1 items-center gap-2 text-lg font-bold tracking-[-0.3px] text-inherit no-underline" href="./"><span class="brand-mark inline-flex h-6 items-center justify-center rounded-sm border-2 border-ink bg-accent px-1.25 font-mono text-xs font-bold text-on-accent" aria-hidden="true">DT.es</span>{BRAND}</a>
  </header>

  <section class="content flex flex-1 flex-col gap-4 px-4 pt-6 pb-6">
    <div>
      <p class="kicker">{t(lang, 'thanksKicker')}</p>
      <h1 class="text-[2rem] font-extrabold tracking-[-1px]" id="thanks-title">{t(lang, 'thanksTitle')}</h1>
    </div>
    <p class="lead">{t(lang, 'thanksLead')}</p>

    {#if text !== undefined}
      <section class="grid gap-2.5 rounded-lg border-2 border-ink bg-surface p-3.5" id="stats" aria-labelledby="stats-title">
        <h2 class="text-lg font-extrabold" id="stats-title">{t(lang, 'statsTitle')}</h2>
        <p class="hint">{t(lang, 'statsLead')}</p>
        <p class="hint">{t(lang, 'statsPayload')}</p>
        <pre class="term whitespace-pre-wrap break-all" id="stats-payload" dir="ltr">{lines.join('\n')}</pre>
        {#if status === 'sent'}
          <p class="lead" id="stats-status" role="status">{t(lang, 'statsSent')}</p>
        {:else}
          <button type="button" class="button" id="stats-send" disabled={!online || status === 'sending'} onclick={send}>{t(lang, 'statsSend')}</button>
          <p class="notice-warn empty:hidden" id="stats-status" role={status === 'error' ? 'alert' : 'status'}>{status === 'error' ? t(lang, 'statsError') : online ? '' : t(lang, 'statsOffline')}</p>
        {/if}
      </section>
    {/if}

    <div class="actionbar">
      <a class="button primary" id="start-again" href="./">{t(lang, 'reset')}</a>
    </div>
  </section>
</div>
