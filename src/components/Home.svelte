<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Start screen: what the tool does, the privacy promise, one button. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'

  const { lang, onStart }: { lang: Lang; onStart: () => void } = $props()
</script>

<section class="step home">
  <div>
    <p class="kicker">{t(lang, 'kicker')}</p>
    <h1>{t(lang, 'homeTitle')}</h1>
    <svg class="squiggle" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M2 6c18-5 34 3 50-1s30-3 46 0" fill="none" stroke="#f36716" stroke-width="3.5" stroke-linecap="round" /></svg>
  </div>
  <p class="lead">{t(lang, 'homeLead')}</p>

  <div class="win" aria-hidden="true">
    <div class="winbar"><i></i><i></i><i></i><span class="title">copia.preview</span></div>
    <div class="home-demo">
      <!-- Decorative card: blue-grey blocks, three of them already blacked out (positions in styles.css). -->
      <div class="mini-card">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <p class="term"><span class="p">$</span> dni-limpio --local<br />→ {t(lang, 'logSent')} · ok</p>
    </div>
  </div>

  <ul class="chips plain">
    <li><span class="chip">{t(lang, 'chipNoServer')}</span></li>
    <li><span class="chip">{t(lang, 'chipOffline')}</span></li>
    <li><span class="chip">{t(lang, 'chipOpenSource')}</span></li>
    <li><span class="chip">{t(lang, 'chipNoAccount')}</span></li>
  </ul>

  <footer><a href={__REPO_URL__} rel="noopener noreferrer">{t(lang, 'sourceCode')}</a></footer>

  <div class="actionbar">
    <button type="button" class="button primary" id="start" onclick={onStart}>{t(lang, 'start')} <span class="flip" aria-hidden="true">→</span></button>
    <p class="hint">{t(lang, 'startHint')}</p>
  </div>
</section>
