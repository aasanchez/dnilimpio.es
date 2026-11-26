<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0015. Cookieless visit counts with Cloudflare Web Analytics

- Status: accepted
- Date: 2026-11-26

## Context

The owner wants to understand the site's traffic. The first proposal was Google Tag Manager. GTM
and Google Analytics set cookies and profile visitors, so Spanish law (LSSI art. 22.2, AEPD cookie
guide) would require a consent banner, and the start screen's notice ("no cookies") would become
false. The owner chose cookieless analytics instead, and picked Cloudflare Web Analytics: free, no
cookies, no local storage, no fingerprinting, no cross-site profile.

Until now the app sent no request at all (`connect-src 'none'`, a deny-by-default service worker,
lint bans on network APIs). Any analytics weakens that guarantee, so this decision limits it as far
as the browser allows.

## Decision

- **Cloudflare's beacon**, loaded from `https://static.cloudflareinsights.com/beacon.min.js` with
  the site token. The constants live in `src/analytics/endpoints.ts`; the loader is
  `src/analytics/cloudflare.ts`.
- **Only where it belongs.** It loads only on the public host names (`aasanchez.github.io`,
  `dnitapado.es`, `www.dnitapado.es`, and the earlier name `dnilimpio.es`), only in production builds, only when the browser is online,
  and never when the browser sends Global Privacy Control or Do Not Track. Local builds, previews,
  tests and forks never load it.
- **Nothing from the app.** The loader gives the beacon its site token and nothing else. The beacon
  measures the page load (address, referrer, timings, browser); Cloudflare derives the country from
  the request. The app keeps photos and fields in memory and never puts them in the address, so no
  report can carry them.
- **Smallest possible opening in each layer:**
  - CSP: `script-src` adds the beacon's exact URL (not the whole host); `connect-src` changes from
    `'none'` to `https://cloudflareinsights.com`, the only origin the page can send to.
  - Trusted Types: the `default` policy accepts the beacon's exact URL as a third script URL.
  - Service worker: lets through only GET of the beacon's exact URL and GET/POST to
    `https://cloudflareinsights.com/cdn-cgi/rum`. The build writes these two addresses into the
    worker's manifest, so the worker shares no code chunk with the page. Every other request is still
    refused.
- **Fails quietly.** Offline, blocked by an extension or with Cloudflare down, the beacon does not
  load and the app works as before. It loads when the page is idle, after the first render.
- **No SRI.** Cloudflare publishes the beacon at an unversioned address and changes it without
  notice, so it cannot carry an integrity hash. This is the one script without SRI; it is loaded
  dynamically and only on the public site.

## Legal reasoning (not legal advice)

ePrivacy art. 5(3) (LSSI art. 22.2 in Spain) requires consent to store or read information on the
user's device, except where strictly necessary. The beacon sets no cookie and stores nothing. It does
read page performance data through browser APIs. Some regulators, such as France's CNIL, exempt from consent
audience measurement that only produces anonymous statistics for the site owner, with no cross-site
tracking or profiles. This has not been checked with a lawyer or against a specific AEPD ruling. Cloudflare states that Web Analytics does not use client-side
state and does not fingerprint. The notice therefore informs and asks for no consent, and says
plainly that visits are counted anonymously. If the owner wants zero client-side code later, moving
`dnitapado.es` behind Cloudflare's proxy gives server-side traffic statistics with no script at all.

## Alternatives

- **Google Tag Manager / Google Analytics**: cookies and profiling, needs a consent banner. Rejected
  by the owner.
- **GoatCounter, Plausible**: also cookieless; Plausible is EU-hosted but paid, GoatCounter is free
  but run by one person. The owner chose Cloudflare.
- **Server logs**: GitHub Pages gives none.

## Consequences

- The public site makes up to two requests to Cloudflare per page load: the beacon script and its
  report. The privacy end-to-end test (`tests/e2e/privacy.spec.ts`) still proves that a whole
  workflow sends nothing, because it runs on `localhost`. `tests/e2e/analytics.spec.ts` serves the
  build as the public site and checks the beacon's limits: one script, one report with only the
  token and path, no cookies or storage, other addresses refused by the CSP, the service worker's
  pass-through, and no beacon offline, under GPC or DNT, or on other hosts.
- A compromised beacon could read the page, as any script in it can. It could send data only to
  `cloudflareinsights.com`, into the owner's own analytics account. This is the price of the feature;
  the README says so.
- The notice, the README and the AI audit prompt describe the analytics instead of claiming "no
  tracking" or "no requests".
