<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { AUTONYMS, LANGS, dir, isLang, t, type Lang } from '../i18n/index.ts'

  let { lang = $bindable() }: { lang: Lang } = $props()
</script>

<div class="lang">
  <label for="lang">{t(lang, 'language')}</label>
  <select id="lang" value={lang} onchange={(e) => { if (isLang(e.currentTarget.value)) lang = e.currentTarget.value }}>
    {#each LANGS as l (l)}
      <option value={l} lang={l} dir={dir(l)}>{AUTONYMS[l]}</option>
    {/each}
  </select>
</div>
