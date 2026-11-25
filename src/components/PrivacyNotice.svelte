<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Privacy notice in the place where sites put their cookie banner. It informs only: nothing is
     stored, so EU rules (ePrivacy art. 5(3), GDPR) require no consent and there is no "accept" step.
     Its dismissal is not stored either (storage is banned, §2.2): it lasts until the page is reloaded. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'

  const { lang, onDismiss }: { lang: Lang; onDismiss: () => void } = $props()
</script>

<aside class="privacy-notice" id="privacy-notice" aria-labelledby="privacy-title">
  <p class="kicker">{t(lang, 'privacyKicker')}</p>
  <h2 id="privacy-title">{t(lang, 'privacyTitle')}</h2>
  <p>{t(lang, 'privacyBody')}</p>
  <button type="button" class="button small" id="privacy-ok" onclick={onDismiss}>{t(lang, 'privacyOk')}</button>
</aside>
