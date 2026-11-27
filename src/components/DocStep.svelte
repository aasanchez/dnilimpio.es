<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- After the photos: which document is it, DNI or TIE? Each layout has its own field positions.
     When OCR can run, the photos preselect the answer; the person always confirms it. Nothing is
     preselected otherwise: Continue waits for a choice. The DNI version (3.0 or 4.0) is not asked:
     it comes from detection, or is the most common one (4.0), with a switch in the editor. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t, tf, type Key, type Lang } from '../i18n/index.ts'
  import { CHOICES, DEFAULT_DNI, choiceOf, isDni, type DniVersion, type DocChoice } from '../zones/documents.ts'
  import type { DocModel } from '../zones/types.ts'
  import type { CaptureState } from '../ui/capture-state.ts'
  import { loadDetect } from '../detect/load-detect.ts'
  import type { DetectOutcome } from '../stats/session.ts'

  let { lang, doc = $bindable(), dniFound = $bindable(), outcome = $bindable(), photos, preselect, onContinue }: {
    lang: Lang
    /** The layout to use: a DNI version or the TIE. */
    doc: DocModel | null
    /** True when the DNI version in `doc` was detected from the photos, false when it is the default. */
    dniFound: boolean
    /**
     * What detection answered, for the opt-in stats only (ADR 0029): the document it read, 'none' when
     * it read the photos and found no answer, 'off' when it could not run. Null while it runs.
     */
    outcome: DetectOutcome | null
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

  /** DNI version detection read from the photos, kept for a DNI picked by hand afterwards. */
  let detected: DniVersion | null = null
  const choice = $derived<DocChoice | null>(doc === null ? null : choiceOf(doc))

  /** Sets the layout for a picker option. A DNI takes the detected version, else the default. */
  function choose (c: DocChoice): void {
    if (c === 'tie') {
      doc = 'tie'
      return
    }
    doc = detected ?? DEFAULT_DNI
    dniFound = detected !== null
  }

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
      outcome = guess?.kind === 'dni' || guess?.kind === 'tie' ? guess.kind : 'none'
      if (guess?.model) {
        auto = { s: 'found', model: guess.model }
        if (isDni(guess.model)) detected = guess.model
      } else {
        auto = guess?.kind === 'dni' ? { s: 'dni' } : { s: 'none' }
      }
      // A DNI whose version is unknown still preselects DNI: the default version, never an error.
      if (guess?.kind === 'dni' || guess?.kind === 'tie') {
        if (!touched) choose(guess.kind)
        // DNI picked by hand while the photos were read, its version not set yet: use the version read.
        else if (guess.kind === 'dni' && doc !== null && isDni(doc) && !dniFound) choose('dni')
      }
    } catch {
      // OCR could not start (e.g. the connection dropped during the download): manual choice.
      if (alive()) {
        auto = { s: 'none' }
        outcome = 'off'
      }
    }
  }

  void (async () => {
    // A module that fails to load (offline before it was cached) means no detection, not an error.
    const status = await loadDetect().then(async (m) => await m.detectStatus()).catch(() => ({ state: 'unavailable', reason: 'unsupported' } as const))
    if (!alive()) return
    // Online first: the OCR files download by themselves (once, then they work offline too).
    if (status.state === 'ready') await run(null)
    else if (status.state === 'download') await run(status.megabytes)
    else {
      auto = { s: 'unavailable', key: status.reason === 'offline' ? 'detectOffline' : 'detectUnsupported' }
      outcome = 'off'
    }
  })()

  const message = $derived.by((): string => {
    switch (auto.s) {
      case 'reading': return auto.mb === null ? t(lang, 'detectReading') : tf(lang, 'detectDownloading', { mb: auto.mb })
      case 'unavailable': return t(lang, auto.key)
      case 'found': return tf(lang, 'detectFound', { doc: t(lang, `doc_${auto.model}`) })
      case 'dni': return t(lang, 'detectDniGuess')
      case 'none': return t(lang, 'detectNone')
      default: return ''
    }
  })
</script>

<section class="step flex flex-1 flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-2xl">
  <div>
    <h2 id="doc-title">{t(lang, 'docTitle')}</h2>
    <p class="lead">{t(lang, 'docLead')}</p>
  </div>

  <p class="hint empty:hidden [&.busy]:before:content-['◌_']" class:busy={auto.s === 'reading'} id="detect-status" role="status" data-state={auto.s}>{message}</p>

  <ul class="rows" role="radiogroup" aria-labelledby="doc-title">
    {#each CHOICES as c (c)}
      <li>
        <label class="toggle">
          <span class="h-6.75 w-10.5 flex-none rounded-sm border-[1.5px] border-ink bg-sunk" aria-hidden="true"></span>
          <span class="toggle-text">
            <span class="toggle-label">{t(lang, `doc_${c}`)}</span>
            <span class="toggle-note">{t(lang, `docHint_${c}`)}</span>
          </span>
          <input type="radio" class="radio" name="doc" id="doc-{c}" value={c} checked={choice === c}
            onclick={() => { touched = true }} onchange={() => { touched = true; choose(c) }} />
        </label>
      </li>
    {/each}
  </ul>

  <div class="actionbar">
    {#if doc === null}<p class="hint" id="doc-choose">{t(lang, 'docChoose')}</p>{/if}
    <button type="button" class="button primary" id="doc-continue" disabled={doc === null} onclick={onContinue}>{t(lang, 'continue')} <span class="flip" aria-hidden="true">→</span></button>
  </div>
</section>
