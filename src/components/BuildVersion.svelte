<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The running build: release version (linked to its GitHub Release, ADR 0030), short commit SHA
     (linked to the commit) and how long ago it was deployed. -->
<script lang="ts">
  import { t, tf, type Lang } from '../i18n/index.ts'
  import { commitUrl, relativeTime, releaseUrl, shortSha } from '../version/build-info.ts'

  const { lang }: { lang: Lang } = $props()

  const sha = __BUILD_SHA__
  const built = __BUILD_TIME__
  const href = commitUrl(__REPO_URL__, sha)
  const version = __BUILD_VERSION__
  const release = releaseUrl(__REPO_URL__, version)
  let now = $state(Date.now())

  // Refresh the relative time every 30 s, and at once when the tab comes back to the front.
  $effect(() => {
    const tickNow = (): void => { now = Date.now() }
    const timer = setInterval(tickNow, 30_000)
    const onVisible = (): void => { if (document.visibilityState === 'visible') tickNow() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  const when = $derived(relativeTime(lang, built, now))
  const exact = $derived(new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' }).format(built))
</script>

<p class="build-version mt-1.5 text-[0.6875rem] text-muted" id="build-version">
  {t(lang, 'buildVersion')}
  {#if release}
    <a href={release} rel="noopener noreferrer" target="_blank" translate="no" data-version={version}>{version}</a> ·
  {/if}
  {#if href}
    <a {href} rel="noopener noreferrer" translate="no" data-sha={sha}>{shortSha(sha)}</a>
  {:else}
    <span>{t(lang, 'buildDev')}</span>
  {/if}
  · <time datetime={new Date(built).toISOString()} title={exact}>{tf(lang, 'buildDeployed', { when })}</time>
</p>
