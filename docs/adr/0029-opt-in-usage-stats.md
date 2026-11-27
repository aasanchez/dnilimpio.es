<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0029. Opt-in usage stats from a photo-free thanks page

- Status: accepted
- Date: 2026-11-27
- Decided by: Alexis
- Updated 2026-11-27 (Alexis): the done screen is gone. "Download and clear" and "Share and clear"
  on the review screen open the thanks page (point 1).

## Context

Alexis wants to know how the app is used, to improve it: which fields people cover, whether the AI
detects the right document, whether people add the back, and on which devices. The host's request
counts ([ADR 0027](0027-security-headers-from-the-host.md)) cannot tell any of this.

Collecting it must not weaken the protections around the photos:

- The app page refuses every connection (`connect-src 'none'`, `form-action 'none'`,
  [ADR 0023](0023-no-third-party-script-with-photos.md)), and from the photo step on a second policy
  adds more limits ([ADR 0025](0025-intake-lockdown.md)). A browser cannot remove a policy, so any
  path opened for stats would be open while the photos are in the page. If a library in the page
  were ever compromised, it could send the photo on that path.
- An auditor can check "no connection is possible while a photo is in the page" in the browser.
  "The server keeps only anonymous data" is a promise they cannot check from the browser.

Options considered:

1. **Send from the done screen:** open `connect-src` for `/stats` on the app page. Simplest, but it
   opens a path from the page that holds the photos.
2. **A frame on another site** (as [ADR 0024](0024-visit-counter-in-isolated-frame.md) did): the
   page has to hand the data to the frame, so the frame becomes the same exit, plus `frame-src`, a
   second site, and a third-party script.
3. **Send on "Start again" by navigation:** no CSP change, but no confirmation for the person, and no
   data from people who close the tab.
4. **Local only:** show the stats with copy and email buttons. Very little data would reach us.
5. **"Clear everything", then a separate thanks page that sends on opt-in.** Chosen.

## Decision

1. **"Download and clear" and "Share and clear" on the review screen** (`#download`,
   `#share-file`) take the session's figures once the PDF has left, clear everything (as Reset does),
   then open `thanks.html`. A download waits `DOWNLOAD_HANDOFF_MS` (1.5 s) first, so the browser can
   read the file; a closed share sheet clears nothing. (Until this update, a separate done screen had
   a "Clear everything" button, `#reset-done`.) The figures travel in the address fragment
   (after `#`), which browsers never send to a server (`src/stats/thanks-link.ts`).
2. **`thanks.html` is a page of its own.** It is a new document, so it never holds a photo. It loads
   none of the app's image, AI or PDF code: only Svelte, the translations, the stats list and its own
   component (`src/thanks/`). It reads the fragment only through `parseSession()`, then removes it
   from the address. Anything else in the fragment is dropped, and the page has nothing to send.
3. **Opt-in each time.** The page shows the exact text it would send, one `key=value` per line, and a
   "Send anonymous stats" button. One `fetch` POST goes to `./stats` only when the person taps it
   (`src/stats/send.ts`): no cookie, no referrer, no cache. Offline, the button is off and says why.
4. **A fixed list** (`src/stats/schema.ts`), the same module on the page and on the server:
   - session: document model, detection result (`right`, `wrong`, `none`, `off`), back used,
     covered field ids, number of hand-drawn boxes (capped at 50), watermark yes/no (never its text),
     greyscale yes/no, language, build (7 hex digits), photo source (`camera`, `file`, `paste`,
     `mixed`), OCR ran yes/no;
   - device, read by the thanks page itself (`src/stats/device.ts`): device type, system family,
     browser family and major version, installed as an app yes/no.

   The text has one spelling only. `parseStats()` rejects an unknown, repeated or missing key, a
   value outside its list, a number out of range and any other spelling. The user agent string,
   screen size, time zone and hardware details are never sent: together they can single out a device.
5. **Policy of the thanks page** (`THANKS_CSP` in `scripts/csp.ts`): `connect-src 'self'` and no
   worker, frame, form or WebAssembly. `'self'` and not a path, because the same build is served at
   more than one address. The host sends it as a header with `frame-ancestors 'none'`
   (`THANKS_PAGE_CSP`, `scripts/headers.ts`). **The app page's policy does not change.**
6. **Service worker** (`route()` in `src/offline/precache.ts`): a page load of `thanks.html` gets
   `thanks.html`; a POST to `stats` passes to the network only when its sender is the thanks page
   (the request's client URL). The same request from any other page is refused, as before.
7. **Server** (`worker/index.ts` with the checks in `src/stats/endpoint.ts`, `wrangler.jsonc`): a Cloudflare Worker that runs for `/stats` only
   (`run_worker_first`); every other request is a static file and runs no code. It requires
   `Sec-Fetch-Site: same-origin`, accepts only the exact list, writes one row to Workers Analytics
   Engine (dataset `dnitapado_usage`) with Cloudflare's two-letter country, and answers 204. It
   writes no IP address, sets no cookie and keeps no request log (`observability` off).
   `Sec-Fetch-Site` blocks cross-site requests from browsers only; a script outside a browser can
   set it. So a Workers rate limit (`ratelimits` in `wrangler.jsonc`, added 2026-11-27) caps valid
   rows at 60 per minute per Cloudflare location and answers 429 above that. It has one fixed key
   for every sender, so it uses no IP address; the cost is that a flood can make real sends fail
   for that minute.
8. **Wording**: the start-screen notice does not change. Its claims stay exactly true: the document
   is processed on the device and the app does not upload it, and the stats carry nothing from the
   document and are sent only on a tap (Alexis: the notice is not a disclaimer for an optional
   feature). The thanks page says what is sent and what is not, before anything is sent.
   The audit prompt describes this send and asks the auditor to verify each limit above.

## Consequences

- The app page still cannot connect anywhere, also during intake. The only page that can send is
  one that never holds a photo and runs none of the large third-party libraries.
- A compromised script in the app page could still navigate to `thanks.html` with a fragment of its
  choice. The thanks page drops anything that is not the fixed list, so no photo can reach the
  server this way. (A script could already navigate the page to any site; CSP does not cover
  top-level navigation. This decision opens no new door.)
- The stats are not authenticated: anyone can post a valid row. Treat the numbers as indications.
  The rate limit bounds how many fake rows a script can add, not whether it can add them.
- Cloudflare still sees each request's IP address and user agent at its edge, as for every page
  load; the Worker does not store them. The README says so.
- The thanks page and the app share one chunk (`app-*.js`, `app-*.css`): the Svelte runtime, the
  language code with Spanish, and the stylesheet. The service worker still imports nothing.
- The app loads its other languages on demand, checked through its import map. The thanks page has
  no import map and loads nothing on demand, so the build links all 13 dictionaries into it as
  ordinary scripts with integrity (`src/thanks/strings.ts`). They are the files the service worker
  has already cached for the app.
- The thanks page is a window of the app, so a waiting new build asks it whether it is idle
  (ADR 0030). It always answers yes: it holds no photo and has loaded all its files.
- CLAUDE.md rule 1 and ESLint have one narrow exception each: `fetch` in `src/stats/send.ts` and the
  navigation in `src/stats/thanks-link.ts`.
- Alexis turns on Workers Analytics Engine in the Cloudflare account before the first deploy with
  this change; the README has a sample query.
- Changes [ADR 0027](0027-security-headers-from-the-host.md): the host now runs Worker code for
  `/stats`. The rest of that decision stands.
