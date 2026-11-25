# DNI limpio

Hide the sensitive data on a photo of your Spanish identity document before you share a copy.
Everything runs in your browser, on your device. Nothing is uploaded.

**Use it:** <https://aasanchez.github.io/dnilimpio.es/> (planned move to `dnilimpio.es`).

> [!IMPORTANT]
> **Work in progress.** The full flow works for the DNI 4.0: select both sides, straighten them,
> choose the fields to hide, draw extra black boxes, add a watermark, review and download the PDF.
> Automatic detection is still being built (see [Status](#status)).
> Always check the result before you share it.

## Contents

- [What it does](#what-it-does)
- [Privacy](#privacy)
- [Supported documents](#supported-documents)
- [Status](#status)
- [How to use it](#how-to-use-it)
- [Languages](#languages)
- [Development](#development)
- [Tests](#tests)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Design decisions](#design-decisions)
- [Contributing](#contributing)
- [Licence](#licence)

## What it does

When a landlord, employer or company asks for a copy of your DNI, they usually need only some of the data.
This tool makes a copy that shows only what you choose:

1. **Select** a photo of the front and the back (JPEG, PNG, WebP; camera on mobile). On a phone,
   the **capture coach** gives live tips and takes the photo by itself when the card is sharp.
2. **Straighten** each side by marking its four corners.
3. **Choose the fields to hide** (signature, dates, support number, CAN, MRZ and others), and draw
   extra black boxes over anything else.
4. **Add a watermark** (optional), for example `COPY ONLY FOR RENTAL APPLICATION`.
5. **Convert to black and white** (optional).
6. **Review** both sides and **download a PDF**: `protected-document.pdf`.

The PDF holds new images in which the hidden pixels are replaced with solid black. It is not the
original photo with boxes on top: the hidden data is gone from the file.

The tool does not make an official document, and a redacted copy does not replace the original.
Whether a recipient accepts a redacted copy is up to them.

## Privacy

### What the tool guarantees

- **No upload.** Photos are processed in the browser with the Canvas API. The page has no server side.
- **No network access from the page.** The Content Security Policy sets `connect-src 'none'`: the page
  cannot send requests with `fetch`, `XMLHttpRequest`, WebSocket or beacons. It loads scripts, styles
  and images only from its own origin.
- **No storage of your data.** Photos, fields, watermark text and PDFs are kept in memory only. The
  code is not allowed to use `localStorage`, `sessionStorage` or `indexedDB` (enforced by the linter).
  The only thing the browser stores is the app itself (its HTML, scripts and styles), for offline use.
- **Works offline.** After one visit, a service worker keeps a copy of the app's files, and the tool
  works with no network. Each file is checked against the SHA-384 hash recorded at build time before
  it is stored; if one does not match, nothing is stored ([ADR 0004](docs/adr/0004-offline-service-worker.md)).
- **Camera stays on the device.** The live camera (capture coach) is analysed frame by frame in
  memory. No frame is stored or sent, and the camera turns off when you close the view, finish both
  sides or leave the tab.
- **No tracking.** No analytics, telemetry, cookies, fonts or scripts from third parties.
- **Real redaction.** Hidden areas are painted as opaque black pixels on a new image, with a margin
  around each field. Blur and pixelation are not offered, because they can be reversed.
- **Clean PDF.** Each image is re-encoded, and the JPEG is rebuilt with only the data a decoder needs:
  no EXIF, GPS, camera model, thumbnail or comments. The PDF has no metadata, no text, no
  annotations, no scripts and no attachments. Tests check this object by object.
- **Verifiable code.** The production build is minified but ships source maps (`.map` files) that
  map every line back to the source in this repository. Every script and stylesheet has a
  Subresource Integrity hash, including the PDF code that loads in the background after the page
  appears (its hash is in an import map, allowed by the CSP through its own SHA-256 hash). A changed
  file is refused by the browser, both when the page loads it and when it is saved for offline use.

### What it cannot guarantee

- **Automatic detection can miss data.** Always check both sides before you download.
- **The browser, extensions and operating system are outside the tool's control.** A malicious
  extension or a compromised device can read what the page shows.
- **Memory is released, not wiped.** The tool drops its references and clears canvases, but cannot
  force the browser to erase memory.
- **A watermark discourages reuse but cannot prevent identity fraud.**
- **Greyscale is not a security measure.**

### Check it yourself

1. Open the browser's developer tools, **Network** tab, before you select a photo.
2. Use the tool to the end. The only requests are the page's own files, all from the same origin,
   and none of them is sent after you select a photo.
3. For the strongest check, load the page, then disconnect from the Internet (airplane mode) before you
   select a photo. The tool keeps working, including after a reload.
4. Read the policy in the page source: `<meta http-equiv="Content-Security-Policy">`.

## Supported documents

| Document | Status |
|---|---|
| DNI 4.0 (2021 onwards), front and back | Field positions measured on the official specimen ([method](docs/ZONES.md)) |
| DNI 3.0 | Planned |
| TIE (foreigner identity card) | Planned |
| Certificate with NIE (EU citizen registration) | Planned |

Any other photo can be redacted by hand once manual boxes are available.

## Status

The project follows [docs/PLAN.md](docs/PLAN.md). Summary:

| Part | State |
|---|---|
| Select front and back photos (file, drag and drop, paste, camera) | Done |
| Straighten each side by its corners | Done |
| Secure raster engine: greyscale, opaque masks with margin, self-check | Done |
| PDF engine: A4, one side per page, metadata-free | Done |
| Move the UI to Svelte 5 and pnpm | Done |
| Fields to hide, live preview, watermark, black and white, review, PDF download, reset | Done |
| Extra black boxes: draw, move, resize, delete, undo and redo (mouse, touch, keyboard) | Done |
| Offline mode with service worker and integrity checks | Done |
| Redesign of the workflow and interface: guided phone-first flow, new visual style | Done |
| Capture coach: live camera tips (framing, tilt, light, glare, blur, movement) and automatic shot | Done |
| Automatic card edge detection (engine, classic image processing) | Done, not yet in the interface |
| Document type detection, OCR, smart field finding | Planned |
| 31 languages | 13 today |

## How to use it

Open the site in a current browser (Chrome, Edge, Firefox, Safari; desktop or mobile). No account,
no installation. The layout is built for a phone first: one step per screen, the main button always
at the bottom within thumb reach, and a progress bar at the top (**Photos**, **Corners**, **Hide**,
**Download**). The back arrow in the top bar returns to the previous step without losing work.

1. Optional: disconnect from the Internet after the page has loaded. After the first visit, the
   tool also opens with no connection.
2. **Start.** The first screen explains what the tool does. Press **Start**.
3. **Photos.** Take or choose a photo of the front. The app then moves to the back by itself. On a
   phone, **Take photo** opens the capture coach (see below) and **Gallery** opens your pictures; on
   a computer, **Choose image**, drag and drop, or paste (<kbd>Ctrl</kbd>+<kbd>V</kbd>) also work.
   Tap a side's tile to replace its photo.

   **Capture coach.** A live camera view with a card-shaped frame. Below it, one tip at a time:
   *Fit the card inside the frame*, *Move a little closer*, *Hold the card straight*, *Too dark*,
   *Glare: tilt the card slightly*, *Hold the phone still*, *Blurry: wait for it to focus*. When
   every check passes for about half a second, the photo is taken by itself, and the view moves to
   the back: turn the card over and it takes that one too. The round button takes the photo at any
   moment, **Automatic shot** turns the automatic photo off, and ✕ closes the camera.

   The coach uses no model and no network, so it works the same online and offline. It needs a
   browser that gives web pages a live camera, and your permission. If either is missing (permission
   refused, no camera, an old browser, the page opened from a file), the coach does not open: a
   short note appears, and **Take photo** opens the phone's own camera app instead, as before.
4. **Corners.** Drag the four circles onto the corners of the card; a magnifier shows the area under
   your finger. On a keyboard, arrow keys move the selected corner and <kbd>N</kbd> selects the next
   one. **Rotate** turns the frame if the photo is sideways, **Reset** puts the circles back. The
   button takes you from the front to the back, then on to the next step.
5. **Hide.** The card stays on screen. Choose **Front** or **Back**; the list below shows that
   side's fields as switches. You can also tap a field on the card itself to cover or uncover it.
   The recommended fields start covered: signature, issue and expiry dates, support number, CAN and
   the machine-readable lines (MRZ). Fields left visible get a dashed orange outline; **Final
   preview** hides the outlines. **Adjust corners** goes back to step 4 and keeps your choices.
   Three tabs:
   - **Data:** the field switches and quick choices (**Recommended**, **Hide all**, **Show all**).
   - **Boxes:** extra black boxes for anything the list does not cover. Turn on **Draw black box**
     and drag on the card. Select a box to move it, or drag its corners to resize it. **Undo** and
     **Redo** (<kbd>Ctrl</kbd>+<kbd>Z</kbd>, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>) work on
     boxes. With a keyboard: **Add box**, then arrow keys move it, <kbd>Shift</kbd>+arrows resize it,
     <kbd>N</kbd> selects the next box and <kbd>Delete</kbd> removes it.
   - **Watermark:** type what the copy is for, or pick a suggestion (rental, bank, dated copy), and
     turn on **Convert to black and white** if you like. The card updates as you type.
6. **Download.** Check both final images and the summary, tick **I have checked both sides**, then
   **Download PDF**. The file is called `protected-document.pdf`.
7. **Done.** On phones that support it, **Share** sends the PDF through the system share sheet.
   **Clear everything** removes the photos and all your choices from the page; closing the tab does
   the same.

## Languages

The interface is available in Spanish (default), Catalan, Valencian, Galician, Basque, English, French,
Dutch, Swedish, Finnish, Ukrainian, Romanian and Arabic (right to left). All languages are bundled in
the build; the page never downloads translations. The language follows the browser and can be changed
from the selector at the top.

Translations other than Spanish and English are machine-assisted drafts. Corrections are welcome: edit
one file in `src/i18n/locales/` and open a pull request. Spanish (`es.json`) defines the keys.

## Development

Requirements: [nvm](https://github.com/nvm-sh/nvm) and pnpm. Exact versions are pinned:
Node.js in [`.nvmrc`](.nvmrc) (latest stable when last updated) and pnpm in the `packageManager` field
of [`package.json`](package.json). End users need neither: the site is static.

```bash
nvm install && nvm use                       # Node.js version from .nvmrc
npm install --global pnpm@12.23.0            # or any official pnpm install method, same version
pnpm install --frozen-lockfile               # exact versions from pnpm-lock.yaml; no install scripts run
pnpm exec playwright install chromium        # once, for the end-to-end tests
pnpm dev                                     # http://localhost:5173 (no CSP in dev mode)
```

| Command | What it does |
|---|---|
| `pnpm dev` | Development server with hot reload |
| `pnpm build` | Production build in `dist/` (CSP and SRI injected) |
| `pnpm preview` | Serve `dist/` at http://localhost:4173 |
| `pnpm typecheck` | `svelte-check`: TypeScript strict mode in `.ts` and `.svelte` files |
| `pnpm lint` | ESLint: neostandard style, typescript-eslint strict, Svelte rules, security bans |
| `pnpm format` | Fix style issues automatically (ESLint `--fix`) |
| `pnpm test` / `pnpm test:unit` | Unit tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright, against the production build) |
| `pnpm verify` | All of the above, in the order CI runs them |

Stack: [Svelte 5](https://svelte.dev) with runes for the interface, Vite, strict TypeScript, native
CSS and the Canvas API. Image, geometry, redaction and PDF logic are plain TypeScript modules that do
not depend on Svelte. See [ADR 0003](docs/adr/0003-svelte-vite-pnpm.md).

Rules the code follows:

- No HTML strings: no `innerHTML` and no `{@html}`. Svelte builds DOM nodes directly
  (`fragments: 'tree'`). The CSP allows one Trusted Types policy, `dnilimpio-sw`, which only
  accepts the service worker's URL ([ADR 0004](docs/adr/0004-offline-service-worker.md)).
- No `eval`, `new Function`, inline scripts or inline styles.
- No runtime requests and no persistent storage.
- Test images are synthetic or official specimens. Never commit a photo of a real person's document.

## Tests

- **Unit** (`tests/unit/`): homography and warp, corner editing, zone data, file decoding, i18n keys,
  redaction raster (every masked pixel is opaque black, input untouched), JPEG filter (metadata
  segments dropped, image data unchanged) and PDF structure (pages, images, no metadata, no text,
  deterministic output).
- **End to end** (`tests/e2e/`): photo selection, corner alignment, the field checklist and its
  warnings, review, a real PDF download (decoded in the browser to check that hidden areas are black
  and that the file has no metadata, no source file name and no watermark text), reset, and
  security checks on the built page: exact CSP, referrer policy, SRI on every asset, no inline code, no CSP violations and no
  request outside the page's origin, every on-demand chunk listed in the import map with the right
  hash, a tampered PDF chunk refused by the browser, and offline mode (reload and full flow to the
  PDF with the network off; a tampered file stops the service worker install).

## Deployment

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `pnpm verify` on every
pull request and on `master`. On `master` it publishes the tested `dist/` to GitHub Pages. Actions are
pinned to commit SHAs and run with read-only permissions, except the deploy job.

The build uses relative paths, so `dist/` works at a domain root, under a subpath and on any static
server (Nginx, Caddy, Cloudflare Pages). Moving to the `dnilimpio.es` domain needs no code change:
set the custom domain in the repository's Pages settings and point DNS at GitHub Pages. To redeploy without a new commit, run the **CI** workflow on
`master` from the Actions tab.

There is no downloadable offline package ([ADR 0002](docs/adr/0002-no-standalone-release.md)).

## Project layout

```text
src/
  main.ts            mounts the app, registers the service worker
  sw.ts              service worker: verified offline cache of the build
  offline/           service worker registration and precache helpers
  App.svelte         screen flow
  components/        Svelte components, one per screen or control
  capture/           file input, drag and drop, paste, decoding, live camera and capture coach
  geometry/          homography, perspective warp, corner editing (pure TypeScript)
  zones/             field positions per document, from official specimens
  redact/            normalised zones to pixels, opaque fills
  engine/            fields, secure raster, watermark, JPEG filter, PDF export (TypeScript)
  detect/            automatic card edge detection (Sobel + Hough, no model)
  i18n/              dictionaries, one JSON file per language
  ui/                styles, self-hosted fonts, corner editor (canvas widget), in-memory state
scripts/             CSP, build plugins (CSP, SRI, offline file list), test fixture generator
tests/               unit, e2e and synthetic fixtures
docs/                plan, zone measurement method, decision records
```

## Design decisions

Significant decisions are recorded in [`docs/adr/`](docs/adr/):

- [0001](docs/adr/0001-pdf-library.md): PDF export with `@cantoo/pdf-lib`.
- [0002](docs/adr/0002-no-standalone-release.md): no standalone offline release.
- [0003](docs/adr/0003-svelte-vite-pnpm.md): Svelte 5, Vite, pinned Node.js and pnpm.
- [0004](docs/adr/0004-offline-service-worker.md): offline mode with a verified service worker.
- [0005](docs/adr/0005-guided-flow-and-visual-style.md): guided phone-first flow and visual style.
- [0008](docs/adr/0008-capture-coach.md): capture coach with classical image metrics, no model.

## Contributing

Issues and pull requests are welcome. Before you open a pull request:

1. Run `pnpm verify`; it must pass.
2. Add or update tests for what you change.
3. Do not add runtime dependencies, network requests or storage without discussing it in an issue first.
4. Use only synthetic images or official specimens in tests and screenshots.

Security problems: please report them privately through GitHub's
[security advisories](https://github.com/aasanchez/dnilimpio.es/security/advisories/new),
not in a public issue.

## Licence

[AGPL-3.0-or-later](LICENSE). If you run a modified version as a website, you must offer its source code
to its users. Third-party libraries keep their own licences (`@cantoo/pdf-lib`: MIT). The bundled
fonts (Bricolage Grotesque, JetBrains Mono, Caveat) are under the [SIL Open Font Licence
1.1](LICENSES/OFL-1.1.txt). File-level
licence data follows [REUSE](REUSE.toml).
