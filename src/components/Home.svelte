<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Start screen: what the tool does, the privacy promise, one button, and the no-cookies notice. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import { langSegment } from '../i18n/url.ts'
  import BuildVersion from './BuildVersion.svelte'
  import PrivacyNotice from './PrivacyNotice.svelte'
  import AuditPrompt from './AuditPrompt.svelte'
  import GitHubMark from './GitHubMark.svelte'
  import NagwaraBand from './NagwaraBand.svelte'
  import InstallApp from './InstallApp.svelte'
  import UpdateReady from './UpdateReady.svelte'
  import { GUIDE_PAGE, GUIDE_PAGE_LANG } from '../guide/pages.ts'
  import type { DocModel } from '../zones/types.ts'

  /** The card guide pages (ADR 0040), in the order of the document picker. */
  const guidePages = Object.entries(GUIDE_PAGE) as Array<[DocModel, string]>

  /** The three steps and the common questions on the start page, in reading order. */
  const howSteps = ['howStep1', 'howStep2', 'howStep3'] as const
  const faq = [
    ['faqWhatQ', 'faqWhatA'], ['faqUploadQ', 'faqUploadA'], ['faqTieQ', 'faqTieA'], ['faqWatermarkQ', 'faqWatermarkA'],
    ['faqOfflineQ', 'faqOfflineA'], ['faqCostQ', 'faqCostA'], ['faqShareQ', 'faqShareA'], ['faqOneSideQ', 'faqOneSideA'],
  ] as const

  const { lang, onStart, notice, onNoticeDismiss, onGuide }: { lang: Lang; onStart: () => void; notice: boolean; onNoticeDismiss: () => void; onGuide: () => void } = $props()
</script>

<!-- Wide screens: the promise and the start button on the left, the sample card on the right. While the
     notice floats at the bottom, room under the footer lets every footer link scroll above it. -->
<section class="step home split flex-1 lg:grid-cols-2 lg:grid-rows-[auto_auto_1fr_auto_auto] lg:[grid-template-areas:'head_stage'_'side_stage'_'act_stage'_'info_info'_'foot_foot'] lg:pt-6 {notice ? 'lg:pb-60' : ''}">
  <div class="area-head flex flex-col gap-4">
    <div>
      <p class="kicker">{t(lang, 'kicker')}</p>
      <h1 class="text-[2.15rem] font-extrabold tracking-[-1px] lg:text-5xl lg:tracking-[-1.5px]">{t(lang, 'homeTitle')}</h1>
      <svg class="mt-0.5 block h-3 w-36" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M2 6c18-5 34 3 50-1s30-3 46 0" fill="none" stroke="#f36716" stroke-width="3.5" stroke-linecap="round" /></svg>
    </div>
    <p class="lead lg:text-xl">{t(lang, 'homeLead')}</p>
    <button type="button" class="link-btn -mt-2 self-start" id="guide-open" onclick={onGuide}>{t(lang, 'guideOpen')} <span class="flip" aria-hidden="true">→</span></button>
    <!-- Plain links to the guide pages, so search engines and readers find them from the start page.
         New tab: leaving this page clears the photos (pagehide in App.svelte). -->
    <nav class="-mt-3 text-sm text-muted" id="guide-pages" aria-labelledby="guide-pages-lead">
      <p id="guide-pages-lead">{t(lang, 'guidePagesLead')}</p>
      <ul class="flex flex-wrap gap-x-4">
        {#each guidePages as [doc, file] (doc)}
          <li><a class="inline-flex min-h-6 items-center text-accent-text underline underline-offset-3" href="./{file}" hreflang={lang === GUIDE_PAGE_LANG ? undefined : GUIDE_PAGE_LANG} target="_blank" rel="noopener">{t(lang, `doc_${doc}`)}</a></li>
        {/each}
      </ul>
    </nav>
  </div>

  <!-- Not sticky like other steps' stage (area-stage): it would ride over the questions below. -->
  <div class="panel lg:[grid-area:stage]" aria-hidden="true">
    <div class="px-4 pb-4">
      <!-- Decorative card: blue-grey blocks, three of them already blacked out (positions in styles.css). -->
      <div class="mini-card relative mx-auto mt-5 mb-3.5 aspect-[1.585] w-[min(270px,80%)] -rotate-3 rounded-[10px] border-[1.5px] border-coal bg-card lg:w-[min(360px,80%)]">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>
  </div>

  <ul class="area-side flex flex-wrap gap-2">
    <li><span class="chip">{t(lang, 'chipNoServer')}</span></li>
    <li><span class="chip">{t(lang, 'chipOffline')}</span></li>
    <li><span class="chip">{t(lang, 'chipOpenSource')}</span></li>
    <li><span class="chip">{t(lang, 'chipNoAccount')}</span></li>
  </ul>

  <!-- How it works and common questions: plain text, so people and search engines read the answers on
       the start page itself (prerendered, ADR 0041). -->
  <div class="area-info flex flex-col gap-8 border-t border-hair pt-6 lg:mt-4 lg:grid lg:grid-cols-[2fr_3fr] lg:gap-10" id="home-info">
    <div>
      <h2 id="how-title">{t(lang, 'howTitle')}</h2>
      <ol class="mt-3 flex list-decimal flex-col gap-2 ps-6 text-base" aria-labelledby="how-title">
        {#each howSteps as key (key)}
          <li>{t(lang, key)}</li>
        {/each}
      </ol>
    </div>
    <div>
      <h2 id="faq-title">{t(lang, 'faqTitle')}</h2>
      <div class="mt-3 flex flex-col gap-4">
        {#each faq as [q, a] (q)}
          <div>
            <h3 class="text-base">{t(lang, q)}</h3>
            <p class="mt-1 text-muted">{t(lang, a)}</p>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- On phones the notice reaches above the action bar: extra room keeps the last link clear of it. -->
  <footer class="area-foot p-4 text-center font-mono text-xs lg:mt-8 lg:border-t lg:border-hair lg:pt-6 {notice ? 'max-lg:pb-14' : ''}">
    <InstallApp {lang} />
    <!-- New tab: leaving this page clears the photos (pagehide in App.svelte). -->
    <!-- One row, centred, so the links share a line and a baseline. -->
    <div class="flex flex-wrap items-center justify-center gap-x-4">
      <a class="source-link inline-flex min-h-6 items-center gap-[0.4em] text-muted" id="source-link" href={__REPO_URL__} target="_blank" rel="noopener noreferrer"><GitHubMark />{t(lang, 'sourceCode')}</a>
      {#if __ARTICLE_LANGS__.includes(lang)}
        <!-- Articles (ADR 0039): only in a language that has some. -->
        <a class="inline-flex min-h-6 items-center text-muted" id="articles-link" href="./{lang === 'es' ? '' : `${langSegment(lang)}/`}articles/" target="_blank" rel="noopener">{t(lang, 'articlesTitle')}</a>
      {/if}
    </div>
    <AuditPrompt {lang} id="audit-footer" extra="mx-auto flex min-h-8 text-xs" />
    <BuildVersion {lang} />
    <NagwaraBand {lang} />
  </footer>

  <div class="actionbar lg:max-w-sm">
    {#if notice}
      <PrivacyNotice {lang} onDismiss={onNoticeDismiss} />
    {/if}
    <UpdateReady {lang} />
    <button type="button" class="button primary" id="start" onclick={onStart}>{t(lang, 'start')} <span class="flip" aria-hidden="true">→</span></button>
    <p class="hint">{t(lang, 'startHint')}</p>
  </div>
</section>
