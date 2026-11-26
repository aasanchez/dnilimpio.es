<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Hidden visit counter (ADR 0024): a sandboxed frame from another site that loads Cloudflare Web
     Analytics there, never in this page. It receives nothing from the app. App.svelte shows it once
     per page load, on the start screen, before any photo is chosen. -->
<script lang="ts">
  import { STATS_SANDBOX, STATS_URL } from '../analytics/stats-frame.ts'
</script>

<iframe class="stats-frame" id="stats-frame" src={STATS_URL} sandbox={STATS_SANDBOX} referrerpolicy="no-referrer"
  title="" aria-hidden="true" tabindex="-1" loading="eager"></iframe>
