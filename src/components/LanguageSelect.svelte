<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { AUTONYMS, LANGS, dir, isLang, isLoaded, loadLang, t, type Lang } from '../i18n/index.ts'

  let { lang = $bindable() }: { lang: Lang } = $props()

  // The last language picked: a slower, earlier pick must not win once its dictionary arrives.
  let wanted: Lang | null = null

  /**
   * Switches once the dictionary is in memory, so the page never shows a half-translated state. If
   * it cannot load (offline before it was cached, too slow), the page keeps its current language
   * and the selector shows it again.
   */
  async function choose (select: HTMLSelectElement): Promise<void> {
    const value = select.value
    if (!isLang(value)) return
    wanted = value
    await loadLang(value)
    if (wanted !== value) return
    if (isLoaded(value)) lang = value
    else select.value = lang
  }
</script>

<div class="lang relative flex items-center">
  <span class="pointer-events-none absolute start-2.5 font-mono" aria-hidden="true">◎</span>
  <label class="sr-only" for="lang">{t(lang, 'language')}</label>
  <select id="lang" class="min-h-11 cursor-pointer appearance-none rounded-sm border border-dashed border-dash bg-transparent ps-7.5 pe-3 font-mono text-[0.8125rem]" value={lang} onchange={(e) => { void choose(e.currentTarget) }}>
    {#each LANGS as l (l)}
      <option value={l} lang={l} dir={dir(l)}>{AUTONYMS[l]}</option>
    {/each}
  </select>
</div>
