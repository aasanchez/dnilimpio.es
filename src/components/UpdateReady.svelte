<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "Update now" on the start screen (src/offline/update.ts). Shown only when a new version is
     installed but did not take over by itself, because another window of the app is open: a tab or
     the installed app, often frozen in the background where it cannot answer. -->
<script lang="ts">
  import { t, type Lang } from '../i18n/index.ts'
  import { applyUpdate, onUpdateReady, updateReady } from '../offline/update.ts'

  const { lang }: { lang: Lang } = $props()

  let ready = $state(updateReady())
  let pressed = $state(false)

  $effect(() => onUpdateReady(() => { ready = updateReady(); pressed = false }))

  function update (): void {
    pressed = true
    applyUpdate()
  }
</script>

{#if ready}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border-[1.5px] border-ink bg-surface px-3.5 py-2.5 text-sm" id="update-ready" role="status">
    <p class="min-w-0 flex-1 basis-56">{t(lang, 'updateReady')}</p>
    <button type="button" class="button small" id="update-now" disabled={pressed} onclick={update}>{t(lang, 'updateNow')}</button>
  </div>
{/if}
