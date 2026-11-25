<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Before the photos: which document is it? Each document has its own field positions and shape. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import { DOCUMENTS } from '../zones/documents.ts'
  import type { DocModel } from '../zones/types.ts'

  let { lang, doc = $bindable(), onContinue }: {
    lang: Lang
    doc: DocModel
    onContinue: () => void
  } = $props()
</script>

<section class="step">
  <div>
    <h2 id="doc-title">{t(lang, 'docTitle')}</h2>
    <p class="lead">{t(lang, 'docLead')}</p>
  </div>

  <ul class="fields doc-list" role="radiogroup" aria-labelledby="doc-title">
    {#each DOCUMENTS as d (d.model)}
      <li>
        <label class="toggle">
          <span class="doc-shape" aria-hidden="true"></span>
          <span class="toggle-text">
            <span class="toggle-label">{t(lang, `doc_${d.model}`)}</span>
            <span class="toggle-note">{t(lang, `docHint_${d.model}`)}</span>
          </span>
          <input type="radio" class="radio" name="doc" id="doc-{d.model}" value={d.model} bind:group={doc} />
        </label>
      </li>
    {/each}
  </ul>

  <div class="actionbar">
    <button type="button" class="button primary" id="doc-continue" onclick={onContinue}>{t(lang, 'continue')} <span class="flip" aria-hidden="true">→</span></button>
  </div>
</section>
