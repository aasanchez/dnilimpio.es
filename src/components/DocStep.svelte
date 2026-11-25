<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- After the photos: which document is it? Each document has its own field positions and shape.
     When OCR can run, the MRZ on the back preselects the answer; the person always confirms it.
     Nothing is preselected otherwise: Continue waits for a choice. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import { DOCUMENTS } from '../zones/documents.ts'
  import type { DocModel } from '../zones/types.ts'
  import type { CaptureState } from '../ui/capture-state.ts'
  import { loadDetect } from '../detect/load-detect.ts'

  let { lang, doc = $bindable(), photos, preselect, onContinue }: {
    lang: Lang
    doc: DocModel | null
    photos: CaptureState
    /** False once the person confirmed a document for these photos: then detection only informs. */
    preselect: boolean
    onContinue: () => void
  } = $props()

  /** What automatic detection is doing. Every state leaves the manual choice available. */
  type Auto =
    | { s: 'checking' }
    | { s: 'reading'; mb: number | null }
    | { s: 'unavailable'; key: Key }
    | { s: 'found'; model: DocModel }
    | { s: 'dni' }
    | { s: 'none' }

  let auto = $state<Auto>({ s: 'checking' })
  /** Set when the person picks a radio themselves, even the one already selected: detection then never overrides it. */
  let touched = $state(!untrack(() => preselect))
  // The screen can close while OCR runs (Continue or Back): late results are then ignored.
  let closed = false
  $effect(() => () => { closed = true })
  const alive = (): boolean => !closed

  /** Reads the photos. `mb` is the OCR download it starts first, when the files are not cached yet. */
  async function run (mb: number | null): Promise<void> {
    auto = { s: 'reading', mb }
    try {
      const guess = await (await loadDetect()).detectDocument({ front: photos.front, back: photos.back })
      if (!alive()) return
      if (guess?.model) {
        auto = { s: 'found', model: guess.model }
        if (!touched) doc = guess.model
      } else {
        auto = guess?.kind === 'dni' ? { s: 'dni' } : { s: 'none' }
      }
    } catch {
      // OCR could not start (e.g. the connection dropped during the download): manual choice.
      if (alive()) auto = { s: 'none' }
    }
  }

  void (async () => {
    // A module that fails to load (offline before it was cached) means no detection, not an error.
    const status = await loadDetect().then(async (m) => await m.detectStatus()).catch(() => ({ state: 'unavailable', reason: 'unsupported' } as const))
    if (!alive()) return
    // Online first: the OCR files download by themselves (once, then they work offline too).
    if (status.state === 'ready') await run(null)
    else if (status.state === 'download') await run(status.megabytes)
    else auto = { s: 'unavailable', key: status.reason === 'offline' ? 'detectOffline' : 'detectUnsupported' }
  })()

  const message = $derived.by((): string => {
    switch (auto.s) {
      case 'reading': return auto.mb === null ? t(lang, 'detectReading') : tf(lang, 'detectDownloading', { mb: auto.mb })
      case 'unavailable': return t(lang, auto.key)
      case 'found': return tf(lang, 'detectFound', { doc: t(lang, `doc_${auto.model}`) })
      case 'dni': return t(lang, 'detectDniVersion')
      case 'none': return t(lang, 'detectNone')
      default: return ''
    }
  })
</script>

<section class="step">
  <div>
    <h2 id="doc-title">{t(lang, 'docTitle')}</h2>
    <p class="lead">{t(lang, 'docLead')}</p>
  </div>

  <p class="hint" class:busy={auto.s === 'reading'} id="detect-status" role="status" data-state={auto.s}>{message}</p>

  <ul class="fields doc-list" role="radiogroup" aria-labelledby="doc-title">
    {#each DOCUMENTS as d (d.model)}
      <li>
        <label class="toggle">
          <span class="doc-shape" aria-hidden="true"></span>
          <span class="toggle-text">
            <span class="toggle-label">{t(lang, `doc_${d.model}`)}</span>
            <span class="toggle-note">{t(lang, `docHint_${d.model}`)}</span>
          </span>
          <input type="radio" class="radio" name="doc" id="doc-{d.model}" value={d.model} bind:group={doc} onclick={() => { touched = true }} onchange={() => { touched = true }} />
        </label>
      </li>
    {/each}
  </ul>

  <div class="actionbar">
    {#if doc === null}<p class="hint" id="doc-choose">{t(lang, 'docChoose')}</p>{/if}
    <button type="button" class="button primary" id="doc-continue" disabled={doc === null} onclick={onContinue}>{t(lang, 'continue')} <span class="flip" aria-hidden="true">→</span></button>
  </div>
</section>
