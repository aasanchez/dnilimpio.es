<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { AUTONYMS, LANGS, dir, isLang, t, type Lang } from '../i18n/index.ts'

  let { lang = $bindable() }: { lang: Lang } = $props()
</script>

<div class="lang relative flex items-center">
  <span class="pointer-events-none absolute start-2.5 font-mono" aria-hidden="true">◎</span>
  <label class="sr-only" for="lang">{t(lang, 'language')}</label>
  <select id="lang" class="min-h-11 cursor-pointer appearance-none rounded-sm border border-dashed border-dash bg-transparent ps-7.5 pe-3 font-mono text-[0.8125rem]" value={lang} onchange={(e) => { if (isLang(e.currentTarget.value)) lang = e.currentTarget.value }}>
    {#each LANGS as l (l)}
      <option value={l} lang={l} dir={dir(l)}>{AUTONYMS[l]}</option>
    {/each}
  </select>
</div>
