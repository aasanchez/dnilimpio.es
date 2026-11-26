<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0018. Installable app (PWA)

- Status: accepted
- Date: 2026-11-26

## Context

The owner wants people to be able to install the tool on their devices. The service worker (ADR 0004)
already makes it work offline; browsers also need a web app manifest with icons before they offer
installation. The same build runs at the root of `dnitapado.es` and under `/dnilimpio.es/` on GitHub
Pages, so no URL may be absolute. The CSP, the deny-by-default service worker and the promise that
nothing about the user is stored or sent must not change.

## Decision

- **Manifest:** `public/manifest.webmanifest`, linked as `./manifest.webmanifest`. `id`,
  `start_url` and `scope` are `./`, so they resolve to the folder the app is served from, at the
  root or under a subpath. Name `DNI Tapado.es`, short name `DT.es`, `display: standalone`, cream
  background and theme colour (`#f8f5ed`, the page's paper).
- **Icons:** the top bar's brand mark ("DT.es" in JetBrains Mono on orange `#f36716`), drawn by
  `scripts/make-icons.ts` and committed as PNG, so the build stays reproducible and needs no
  browser. `any` icons (192, 512) keep the mark's rounded ink border; `maskable` icons (192, 512) are
  full-bleed with the text inside the 40 % safe zone; `apple-touch-icon.png` (180) is opaque; the
  favicon (see below) shows "DT" only.
- **Favicon:** "DT.es" cannot be read at 16 px, so the tab icon shows "DT" in the same orange box,
  drawn as shapes on a 32-unit grid whose edges fall on whole pixels at 16 and 32 px.
  `icons/favicon.svg` is the main one and turns its border cream in a dark theme, like the top bar's
  mark; `icons/favicon-32.png`, `icons/favicon-16.png` and `favicon.ico` (16, 32 and 48 px) serve
  browsers without SVG favicons. All are linked with relative URLs. The ICO carries `sizes="32x32"`
  so browsers that read SVG do not pick it instead.
- **Offline and CSP:** the manifest and icons are ordinary build files, so the service worker caches
  them at install with their SHA-384, like the rest. `manifest-src 'self'` and `img-src 'self'` were
  already in the CSP: no directive changes.
- **Install link:** `src/offline/install.ts` and `InstallApp.svelte`, a small link in the start
  screen's footer, shown only where installing works and the app is not installed yet:
  - Chromium (Android, desktop Chrome and Edge): the `beforeinstallprompt` event is kept and the link
    opens the browser's own dialog. `main.ts` listens before the app mounts, because the event can
    fire early.
  - iOS and iPadOS (any browser, since all install through the Share menu): the link shows the
    steps, translated into every language.
  - Already installed (`display-mode: standalone` or `navigator.standalone`), or any other browser
    (Firefox, desktop Safari): nothing.

## Consequences

- Installing is a local action of the browser and the operating system. It adds no cookie, no
  storage of user data and no request. The installed app is the same page with the same service
  worker and the same update rule (`src/offline/update.ts`).
- Desktop Safari (File › Add to Dock) and Firefox for Android (menu › Install) can still install the
  app from their own menus; the start screen does not explain those.
- The manifest is not translated: the name is the brand, and the description is in Spanish, the
  source language.
