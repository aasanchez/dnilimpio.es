<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Card guide: every element of each supported card, what it is and how a copy of it can be misused,
     each statement with its official source (src/guide/). One tab per picker option (DNI, TIE); the
     DNI tab has a switch between its two versions, as their elements differ. A dialog, so opening it from the editor
     keeps the editor as it was. Its text loads when it first opens; it never fetches anything else,
     and source links open in a new tab. -->
<script lang="ts">
  import { tick } from 'svelte'
  import { t, type Key, type Lang } from '../i18n/index.ts'
  import type { DocModel, ZoneId } from '../zones/types.ts'
  import { CHOICES, DNI_VERSIONS, choiceOf, documentOf, isDni, type DniVersion, type DocChoice } from '../zones/documents.ts'
  import { GENERAL_RISK, GUIDE, PLACES, textOf, type Cite, type Entry } from '../guide/entries.ts'
  import { SOURCES } from '../guide/sources.ts'
  import { loadGuideText } from '../guide/text.ts'
  import { appState, entryForField, sourceOrder } from '../guide/view.ts'

  const { lang, id }: { lang: Lang; id: string } = $props()

  let dialog: HTMLDialogElement | undefined = $state()
  let body: HTMLElement | undefined = $state()
  let doc = $state<DocModel>('dni-4.0')
  /** DNI version shown on the DNI tab; kept when the reader looks at the TIE and comes back. */
  let dniVersion = $state<DniVersion>('dni-4.0')
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
    if (isDni(model)) dniVersion = model
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
    if (isDni(d)) dniVersion = d
    focused = null
    if (body) body.scrollTop = 0
  }

  /** The layout a tab opens: the DNI version last shown, or the TIE. */
  const choiceTarget = (c: DocChoice): DocModel => (c === 'dni' ? dniVersion : 'tie')

  const byPlace = (place: string): Entry[] => entries.filter((e) => e.place === place)
</script>

{#snippet cites (list: readonly Cite[])}
  {#if list.length > 0}
    <p class="guide-cites mt-0.5 flex flex-wrap gap-x-2 font-mono text-xs text-muted">
      {#each list as c, i (i)}<bdi class="guide-cite" dir="ltr">[{num(c)}, {c.at}]</bdi>{/each}
    </p>
  {/if}
{/snippet}

<dialog class="guide dialog-panel w-[min(44rem,calc(100%-2rem))] open:flex open:flex-col open:overflow-hidden" bind:this={dialog} aria-labelledby="{id}-title">
  <div class="flex min-h-0 flex-col gap-2.5 overflow-y-auto p-4 text-start font-sans text-base leading-normal *:shrink-0" bind:this={body}>
    {#if g}
      {@const tx = g}
      <p class="kicker">{tx('kicker')}</p>
      <h2 id="{id}-title">{tx('title')}</h2>
      <p class="text-sm text-muted">{tx('lead')}</p>

      <div class="tabs flex-wrap" role="tablist" aria-label={tx('title')}>
        {#each CHOICES as c (c)}
          <button type="button" role="tab" id="{id}-tab-{c}" aria-selected={choiceOf(doc) === c} onclick={() => { pick(choiceTarget(c)) }}>{t(lang, `doc_${c}` as Key)}</button>
        {/each}
      </div>
      {#if isDni(doc)}
        <div class="segmented" role="group" aria-label={t(lang, 'doc_dni')}>
          {#each DNI_VERSIONS as v (v)}
            <button type="button" id="{id}-ver-{v}" aria-pressed={doc === v} onclick={() => { pick(v) }}>{t(lang, `doc_${v}`)}</button>
          {/each}
        </div>
      {/if}

      <section class="rounded-md border border-dashed border-dash bg-sunk p-3" aria-labelledby="{id}-general">
        <h3 class="text-[1.05rem]" id="{id}-general">{tx('generalTitle')}</h3>
        <p>{tx('generalText')}</p>
        {@render cites(GENERAL_RISK)}
      </section>

      {#each PLACES as place (place)}
        {@const list = byPlace(place)}
        {#if list.length > 0}
          <h3 class="mt-3 text-[1.05rem]">{tx(place === 'front' ? 'placeFront' : place === 'back' ? 'placeBack' : 'placeChip')}</h3>
          <ul class="overflow-hidden rounded-lg border border-line bg-surface [&>li+li]:border-t [&>li+li]:border-hair">
            {#each list as e (e.id)}
              {@const key = textOf(e)}
              {@const what = tx(`${key}_what`)}
              {@const state = appState(model, e.field)}
              <li>
                <details id="{id}-{e.id}" class="px-3.5 open:pb-3 [&_h4]:mt-2.5 [&_h4]:mb-0.5 [&_h4]:font-mono [&_h4]:text-xs [&_h4]:tracking-[0.04em] [&_h4]:text-muted [&_h4]:uppercase" open={focused === e.id}>
                  <summary class="flex min-h-12 cursor-pointer items-center font-semibold">{tx(`${key}_title`)}</summary>
                  <h4>{tx('what')}</h4>
                  {#if e.what.length > 0 && what !== ''}
                    <p>{what}</p>
                    {@render cites(e.what)}
                  {:else}
                    <p class="guide-none text-muted italic">{tx('noSource')}</p>
                  {/if}
                  <h4>{tx('risk')}</h4>
                  {#if e.risk.length > 0}
                    <p>{tx(`${key}_risk`)}</p>
                    {@render cites(e.risk)}
                  {:else}
                    <p class="guide-none text-muted italic">{tx('noRisk')}</p>
                  {/if}
                  <p class="mt-2 text-sm text-accent-text">{fill(tx(state === 'mandatory' ? 'appMandatory' : state === 'hidden' ? 'appHidden' : state === 'visible' ? 'appVisible' : 'appNone'))}</p>
                </details>
              </li>
            {/each}
          </ul>
        {/if}
      {/each}

      <h3 class="mt-3 text-[1.05rem]">{tx('sources')}</h3>
      <ol class="guide-sources m-0 list-decimal ps-6 text-[0.8125rem] wrap-anywhere [&_a]:text-accent-text [&>li+li]:mt-1.5">
        {#each order as s (s)}
          {@const src = SOURCES[s]}
          <li id="{id}-src-{s}">
            <cite lang={src.lang}>{src.title}</cite>. {src.publisher}. <span lang={src.lang}>{src.edition}</span>.
            {#if src.repealed}<em>{tx('repealed')}.</em>{/if}
            {tx('checked').replace('{date}', src.checked)}.
            <!-- New tab: leaving this page clears the photos (pagehide in App.svelte). -->
            <a href={src.url} target="_blank" rel="noopener noreferrer" dir="ltr">{src.url}</a>
            <span class="sr-only">({tx('newTab')})</span>
          </li>
        {/each}
      </ol>
    {/if}
    <div class="row">
      <button type="button" class="button" id="{id}-close" onclick={() => { dialog?.close() }}>{g ? g('close') : t(lang, 'auditClose')}</button>
    </div>
  </div>
</dialog>
