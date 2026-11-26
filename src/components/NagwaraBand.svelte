<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "This is a NagWara product" band at the bottom of the start screen, the same attribution as
     thelobby.bet, in this app's colours and type. NagWara is a name, not a translated string. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import NagwaraMark from './NagwaraMark.svelte'

  const { lang }: { lang: Lang } = $props()
</script>

<div class="nagwara mt-5 grid justify-items-center gap-3 border-t-3 border-nagwara pt-4 text-center font-sans sm:grid-cols-[auto_1fr] sm:items-center sm:justify-items-start sm:gap-6 sm:text-start">
  <!-- New tab: leaving this page clears the photos (pagehide in App.svelte). -->
  <a class="nagwara-brand group inline-flex items-center gap-2.5 text-ink no-underline" id="nagwara-link" href="https://www.nagwara.com/" target="_blank" rel="noopener noreferrer" aria-label={t(lang, 'nagwaraVisit')}><NagwaraMark /><span class="text-[1.75rem] font-extrabold tracking-[-0.5px] group-hover:text-nagwara">NagWara</span></a>
  <div class="nagwara-claim">
    <p class="nagwara-product text-[0.9375rem] font-bold text-nagwara">{t(lang, 'nagwaraProduct')}</p>
    <p class="nagwara-tagline text-xl leading-[1.2] font-extrabold tracking-[-0.3px] text-ink">{t(lang, 'nagwaraMachines')} <span class="text-nagwara">{t(lang, 'nagwaraPeople')}</span></p>
  </div>
</div>
