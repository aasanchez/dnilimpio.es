<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Privacy notice in the place where sites put their cookie banner. It informs only: no cookies,
     no third-party scripts in the app's page and no personal data, so there is no "accept" step
     (ADR 0023). Visits are counted by a sandboxed frame from another site that sets no cookies
     (ADR 0024; ADR 0015 records the legal reasoning).
     Closing it stores only the date (src/ui/notice-memory.ts), so it shows at most every 4 days.
     Kept short on purpose: the full list of what is sent and stored is in the README. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import AuditPrompt from './AuditPrompt.svelte'

  const { lang, onDismiss }: { lang: Lang; onDismiss: () => void } = $props()
</script>

<!-- 80 % of the screen width on every screen, centred. Phones and tablets: on top of the action bar.
     Wide screens: a banner fixed at the bottom of the window, where cookie banners go. Narrow screens:
     the button goes under the text instead of beside it. -->
<aside class="privacy-notice relative -mt-10 mb-1.5 grid w-[80vw] grid-cols-[1fr_auto] items-end gap-x-3 gap-y-[0.2rem] self-center rounded-lg border-2 border-ink bg-surface px-3.5 pt-3 pb-3.5 shadow-hard max-[30rem]:grid-cols-1 lg:fixed lg:bottom-6 lg:left-[10vw] lg:z-20 lg:m-0 *:col-start-1" id="privacy-notice" aria-labelledby="privacy-title">
  <p class="kicker text-[1.2rem]">{t(lang, 'privacyKicker')}</p>
  <h2 class="text-lg tracking-[-0.3px]" id="privacy-title">{t(lang, 'privacyTitle')}</h2>
  <p class="max-w-[72ch] text-sm text-muted">{t(lang, 'privacyBody')}</p>
  <AuditPrompt {lang} id="audit-notice" extra="mt-0.5 justify-self-start" />
  <button type="button" class="button small col-start-2! row-span-3 row-start-2 self-end max-[30rem]:col-start-1! max-[30rem]:row-auto max-[30rem]:mt-1.5 max-[30rem]:justify-self-stretch" id="privacy-ok" onclick={onDismiss}>{t(lang, 'privacyOk')}</button>
</aside>
