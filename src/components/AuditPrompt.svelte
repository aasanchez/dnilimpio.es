<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "Check it with your AI": a link-style button that opens a dialog with an audit prompt to copy
     into an AI coding agent. Copying uses the clipboard only; nothing is sent. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import { AUDIT_PROMPT } from '../security/audit-prompt.ts'

  const { lang, id }: { lang: Lang; id: string } = $props()

  let dialog: HTMLDialogElement | undefined = $state()
  let text: HTMLTextAreaElement | undefined = $state()
  let copyBtn: HTMLButtonElement | undefined = $state()
  let copied = $state<'idle' | 'done' | 'failed'>('idle')

  function open (): void {
    copied = 'idle'
    dialog?.showModal()
    if (text) text.scrollTop = 0
    copyBtn?.focus()
  }

  async function copy (): Promise<void> {
    try {
      await navigator.clipboard.writeText(AUDIT_PROMPT)
      copied = 'done'
    } catch {
      // No clipboard permission (or an old browser): select the text so it can be copied by hand.
      text?.focus()
      text?.select()
      copied = 'failed'
    }
  }
</script>

<button type="button" class="link-btn" {id} onclick={open}>{t(lang, 'auditOpen')} <span class="flip" aria-hidden="true">→</span></button>

<dialog class="audit" bind:this={dialog} aria-labelledby="{id}-title">
  <div class="winbar"><i></i><i></i><i></i><span class="title">audit.prompt</span></div>
  <div class="audit-body">
    <p class="kicker">{t(lang, 'auditKicker')}</p>
    <h2 id="{id}-title">{t(lang, 'auditTitle')}</h2>
    <p class="audit-lead">{t(lang, 'auditLead')}</p>
    <textarea bind:this={text} class="audit-text" readonly rows="10" dir="ltr" lang="en" aria-label={t(lang, 'auditTitle')}>{AUDIT_PROMPT}</textarea>
    <p class="audit-status" role="status">{copied === 'done' ? t(lang, 'auditCopied') : copied === 'failed' ? t(lang, 'auditCopyFailed') : ''}</p>
    <div class="row">
      <button type="button" class="button" id="{id}-close" onclick={() => { dialog?.close() }}>{t(lang, 'auditClose')}</button>
      <button type="button" class="button primary" id="{id}-copy" bind:this={copyBtn} onclick={copy}>{t(lang, 'auditCopy')}</button>
    </div>
  </div>
</dialog>
