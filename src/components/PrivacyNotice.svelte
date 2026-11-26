<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Privacy notice in the place where sites put their cookie banner. It informs only: no cookies,
     no storage for analytics and no personal data, so there is no "accept" step. The public site
     counts visits anonymously with Cloudflare Web Analytics, which sets no cookies and stores nothing
     (ADR 0015 records the legal reasoning).
     Closing it stores only the date (src/ui/notice-memory.ts), so it shows at most every 4 days. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import AuditPrompt from './AuditPrompt.svelte'

  const { lang, onDismiss }: { lang: Lang; onDismiss: () => void } = $props()
</script>

<aside class="privacy-notice" id="privacy-notice" aria-labelledby="privacy-title">
  <p class="kicker">{t(lang, 'privacyKicker')}</p>
  <h2 id="privacy-title">{t(lang, 'privacyTitle')}</h2>
  <p>{t(lang, 'privacyBody')}</p>
  <AuditPrompt {lang} id="audit-notice" />
  <button type="button" class="button small" id="privacy-ok" onclick={onDismiss}>{t(lang, 'privacyOk')}</button>
</aside>
