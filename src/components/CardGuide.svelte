<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Card guide: every element of each supported card, what it is and how a copy of it can be misused,
     each statement with its official source (src/guide/). A dialog, so opening it from the editor
     keeps the editor as it was. Its text loads when it first opens; it never fetches anything else,
     and source links open in a new tab. -->
<script lang="ts">
  import { tick } from 'svelte'
  import { t, type Key, type Lang } from '../i18n/index.ts'
  import type { DocModel, ZoneId } from '../zones/types.ts'
  import { DOCUMENTS, documentOf } from '../zones/documents.ts'
  import { GENERAL_RISK, GUIDE, PLACES, textOf, type Cite, type Entry } from '../guide/entries.ts'
  import { SOURCES } from '../guide/sources.ts'
  import { loadGuideText } from '../guide/text.ts'
  import { appState, entryForField, sourceOrder } from '../guide/view.ts'

  const { lang, id }: { lang: Lang; id: string } = $props()

  let dialog: HTMLDialogElement | undefined = $state()
  let body: HTMLElement | undefined = $state()
  let doc = $state<DocModel>('dni-4.0')
  /** Entry opened from the editor: expanded and scrolled into view. */
  let focused = $state<string | null>(null)
  let g = $state<((key: string) => string) | null>(null)
  let loadedLang: Lang | null = null

  const entries = $derived(GUIDE[doc])
  const order = $derived(sourceOrder(entries))
  const model = $derived(documentOf(doc))

  $effect(() => {
    // Load (or reload, after a language change) the guide text once the dialog has been opened.
    if (g === null && loadedLang === null) return
    if (loadedLang === lang) return
    const l = lang
    loadedLang = l
    void loadGuideText(l).then((fn) => { if (loadedLang === l) g = fn })
  })

  const num = (c: Cite): number => order.indexOf(c.src) + 1
  const fill = (s: string): string => s.replace('{boxes}', t(lang, 'toolBoxes'))

  /** Opens the guide, on a document and optionally on the entry of an editor field. */
  export async function show (model: DocModel = doc, field?: ZoneId): Promise<void> {
    doc = model
    const e = field ? entryForField(GUIDE[model], field) : undefined
    focused = e ? e.id : null
    if (loadedLang !== lang) {
      loadedLang = lang
      g = await loadGuideText(lang)
    }
    dialog?.showModal()
    await tick()
    // Set open on the element too: if the reader collapsed this entry before, `focused` has not
    // changed and the attribute alone would not re-expand it.
    const el = e ? body?.querySelector<HTMLDetailsElement>(`#${id}-${e.id}`) : null
    if (el) {
      el.open = true
      el.scrollIntoView({ block: 'start' })
    } else if (body) body.scrollTop = 0
  }

  function pick (d: DocModel): void {
    doc = d
    focused = null
    if (body) body.scrollTop = 0
  }

  const byPlace = (place: string): Entry[] => entries.filter((e) => e.place === place)
</script>

{#snippet cites (list: readonly Cite[])}
  {#if list.length > 0}
    <p class="guide-cites">
      {#each list as c, i (i)}<bdi class="guide-cite" dir="ltr">[{num(c)}, {c.at}]</bdi>{/each}
    </p>
  {/if}
{/snippet}

<dialog class="audit guide" bind:this={dialog} aria-labelledby="{id}-title">
  <div class="winbar"><i></i><i></i><i></i><span class="title">card.guide</span></div>
  <div class="guide-body" bind:this={body}>
    {#if g}
      {@const tx = g}
      <p class="kicker">{tx('kicker')}</p>
      <h2 id="{id}-title">{tx('title')}</h2>
      <p class="audit-lead">{tx('lead')}</p>

      <div class="tools guide-tabs" role="tablist" aria-label={tx('title')}>
        {#each DOCUMENTS as d (d.model)}
          <button type="button" role="tab" id="{id}-tab-{d.model}" aria-selected={doc === d.model} onclick={() => { pick(d.model) }}>{t(lang, `doc_${d.model}` as Key)}</button>
        {/each}
      </div>

      <section class="guide-general" aria-labelledby="{id}-general">
        <h3 id="{id}-general">{tx('generalTitle')}</h3>
        <p>{tx('generalText')}</p>
        {@render cites(GENERAL_RISK)}
      </section>

      {#each PLACES as place (place)}
        {@const list = byPlace(place)}
        {#if list.length > 0}
          <h3 class="guide-place">{tx(place === 'front' ? 'placeFront' : place === 'back' ? 'placeBack' : 'placeChip')}</h3>
          <ul class="plain guide-list">
            {#each list as e (e.id)}
              {@const key = textOf(e)}
              {@const what = tx(`${key}_what`)}
              {@const state = appState(model, e.field)}
              <li>
                <details id="{id}-{e.id}" class="guide-entry" open={focused === e.id}>
                  <summary>{tx(`${key}_title`)}</summary>
                  <h4>{tx('what')}</h4>
                  {#if e.what.length > 0 && what !== ''}
                    <p>{what}</p>
                    {@render cites(e.what)}
                  {:else}
                    <p class="guide-none">{tx('noSource')}</p>
                  {/if}
                  <h4>{tx('risk')}</h4>
                  {#if e.risk.length > 0}
                    <p>{tx(`${key}_risk`)}</p>
                    {@render cites(e.risk)}
                  {:else}
                    <p class="guide-none">{tx('noRisk')}</p>
                  {/if}
                  <p class="guide-app">{fill(tx(state === 'mandatory' ? 'appMandatory' : state === 'hidden' ? 'appHidden' : state === 'visible' ? 'appVisible' : 'appNone'))}</p>
                </details>
              </li>
            {/each}
          </ul>
        {/if}
      {/each}

      <h3 class="guide-place">{tx('sources')}</h3>
      <ol class="guide-sources">
        {#each order as s (s)}
          {@const src = SOURCES[s]}
          <li id="{id}-src-{s}">
            <cite lang={src.lang}>{src.title}</cite>. {src.publisher}. <span lang={src.lang}>{src.edition}</span>.
            {#if src.repealed}<em>{tx('repealed')}.</em>{/if}
            {tx('checked').replace('{date}', src.checked)}.
            <!-- New tab: leaving this page clears the photos (pagehide in App.svelte). -->
            <a href={src.url} target="_blank" rel="noopener noreferrer" dir="ltr">{src.url}</a>
            <span class="visually-hidden">({tx('newTab')})</span>
          </li>
        {/each}
      </ol>
    {/if}
    <div class="row">
      <button type="button" class="button" id="{id}-close" onclick={() => { dialog?.close() }}>{g ? g('close') : t(lang, 'auditClose')}</button>
    </div>
  </div>
</dialog>
