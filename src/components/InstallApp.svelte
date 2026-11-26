<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "Install app" link on the start screen (ADR 0018). Shown only where installing works and the app is
     not installed yet: it opens the browser's dialog (Chromium) or shows the Share-menu steps (iOS). -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import { installOffer, onInstallChange, promptInstall } from '../offline/install.ts'

  const { lang }: { lang: Lang } = $props()

  let offer = $state(installOffer())
  let help = $state(false)

  $effect(() => onInstallChange(() => { offer = installOffer() }))

  function click (): void {
    if (offer === 'prompt') void promptInstall()
    else help = !help
  }
</script>

{#if offer !== 'none'}
  <button type="button" class="link-btn mx-auto flex min-h-8 text-xs" id="install" onclick={click}
    aria-expanded={offer === 'ios' ? help : undefined} aria-controls={offer === 'ios' ? 'install-help' : undefined}>{t(lang, 'installApp')}</button>
  {#if offer === 'ios' && help}
    <p class="mx-auto mb-3 max-w-96 text-muted" id="install-help">{t(lang, 'installIos')}</p>
  {/if}
{/if}
