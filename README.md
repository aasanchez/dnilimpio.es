# DNI limpio

Hide the sensitive data on a photo of your Spanish identity document before you share a copy.
Everything runs in your browser, on your device. Nothing is uploaded.

**Use it:** <https://aasanchez.github.io/dnilimpio.es/> (planned move to `dnilimpio.es`).

> [!IMPORTANT]
> **Work in progress.** The full flow works for the DNI 4.0, DNI 3.0 and TIE: select both sides, confirm the document
> (detected automatically when possible), straighten them, choose the fields to hide, draw extra black boxes, add a
> watermark, review and download the PDF. Smart field finding is still being built (see [Status](#status)).
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
- [Continuous integration](#continuous-integration)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Design decisions](#design-decisions)
- [Contributing](#contributing)
- [Licence](#licence)

## What it does

When a landlord, employer or company asks for a copy of your DNI or TIE, they usually
need only some of the data. This tool makes a copy that shows only what you choose:

1. **Select** a photo of the front and the back (JPEG, PNG, WebP; camera on mobile). On a phone,
   the **capture coach** gives live tips and takes the photo by itself when the card is sharp.
2. **Confirm the document**: DNI 4.0, DNI 3.0 or TIE. When possible, the app reads the code on the
   back (MRZ) on your device and preselects it.
3. **Straighten**: the app finds the card in each photo, turns it the right way up (sideways or
   upside down) and straightens it by itself. You can adjust the corners by hand if needed.
4. **Choose the fields to hide** (signature, dates, support number, CAN, MRZ and others), and draw
   extra black boxes over anything else.
5. **Add a watermark** (optional), for example `COPY ONLY FOR RENTAL APPLICATION`. The text is
   repeated in small, faint diagonal rows over the whole card, so every part of it carries the text
   and the card stays readable.
6. **Convert to black and white** (optional).
7. **Review** both sides and **download a PDF**: `protected-document.pdf`.

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
- **On-device AI only.** The corner finder is a small model that runs in the page with WebAssembly.
  The photo goes to it in memory, scaled to 224 × 224 pixels, and nowhere else. The CSP allows
  WebAssembly (`'wasm-unsafe-eval'`) but still no `eval()` and no connections
  ([ADR 0007](docs/adr/0007-corner-model.md)).
- **No storage of your data.** Photos, fields, watermark text and PDFs are kept in memory only. The
  code is not allowed to use `localStorage`, `sessionStorage` or `indexedDB` (enforced by the linter).
  The only thing the browser stores is the app itself (its HTML, scripts and styles), for offline use.
- **Text recognition (OCR) on the device.** When OCR is used, the image is read by a Web Worker in
  your browser. The OCR engine and Spanish language data (about 8 MB) come from this site, never from
  a third party, are downloaded only the first time OCR is used, and are checked against their hash
  before use. The worker runs under its own strict CSP: it can read its own files in `ocr/` and
  cannot send requests anywhere. If OCR cannot run (offline before the first download, or no service worker), it is
  switched off and you choose the document by hand ([ADR 0009](docs/adr/0009-on-device-ocr.md)).
- **Works offline.** After one visit, a service worker keeps a copy of the app's files, and the tool
  works with no network. Each file is checked against the SHA-384 hash recorded at build time before
  it is stored; if one does not match, nothing is stored ([ADR 0004](docs/adr/0004-offline-service-worker.md)).
  The corner model (about 2.6 MB) is not part of that first copy: it is stored the first time you use
  it online. Offline before that, classic edge detection places the corners, or you place them by hand.
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
2. Use the tool to the end. The only requests are the page's own files, all from the same origin.
   The first time you select a photo, the page also downloads the corner model (`assets/ml/`) from
   the same origin; these are plain downloads of the app's files and carry nothing from you.
3. For the strongest check, load the page, then disconnect from the Internet (airplane mode) before you
   select a photo. The tool keeps working, including after a reload.
4. Read the policy in the page source: `<meta http-equiv="Content-Security-Policy">`.
5. Check which code you run: the start screen's footer shows the short commit SHA of the build, linked
   to that commit on GitHub (see [Deployment](#deployment)).

## Supported documents

| Document | Shape | Source of the field positions | Hidden by default | Optional |
|---|---|---|---|---|
| DNI 4.0 (August 2021 onwards) | card, 85.6 × 54 mm | Policía Nacional specimen | CAN, signature, issue and expiry dates, support number (3 places), MRZ | date and place of birth, address, parents |
| DNI 3.0 (2015 to 2021) | card, 85.6 × 54 mm | PRADO ESP-BO-05001 | CAN, signature, issue date (laser text by the small photo), expiry date, support number (3 places), MRZ | date and place of birth, address, parents |
| TIE, foreigner identity card (2020 model) | card, 85.6 × 54 mm | PRADO ESP-HO-03001 | CAN, signature, issue and expiry dates, card number (2 places), MRZ | date and place of birth, address, permit type |

Positions were measured on official specimens ([method and findings](docs/ZONES.md)). The name, the
photo and the DNI or NIE number stay visible by design; cover them with a black box if needed. Any
other document can be redacted by hand with black boxes.

The document is detected from the machine-readable lines (MRZ) on the back, and you always confirm
it ([ADR 0011](docs/adr/0011-document-detection.md)):

- Code `IR` → TIE. Code `ID` → DNI.
- DNI 3.0 or 4.0: both have the same MRZ, so the version comes from the issue date. It is worked out
  from the dates of birth and expiry (a DNI is valid 2 years under age 5, 5 years under 30 and
  10 years under 70; the DNI 4.0 is issued from 2 August 2021). When the dates fit both versions, or
  for a permanent DNI (holder 70 or over), the app says it is a DNI and asks you to choose the version.
- Nothing is preselected until detection answers or you choose: **Continue** waits for a document,
  so a TIE is never handled with DNI positions by mistake.
- Detection needs OCR. Online, the first time, it downloads the OCR files by itself (about 8 MB, the
  status line says so); after that it also runs offline. When OCR cannot run (offline before the first download, no
  service worker, an old browser), a note says so and you choose by hand. A choice you make yourself
  is never changed.

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
| DNI 3.0 and TIE, with a document picker | Done |
| Find the card's corners automatically: on-device model, then classic edge detection, then manual; sides snapped onto the card's real edges | Done |
| Automatic straightening: find, turn (sideways, upside down) and straighten both sides; corners only on request | Done |
| On-device OCR engine and MRZ reader (Tesseract.js, self-hosted, loaded on first use) | Done |
| Smart field finding: OCR covers names, DNI/NIE number, dates, support number, CAN and MRZ | Done |
| Document type detection from the MRZ (preselects the picker) | Done |
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

   **Capture coach.** A live camera view with a card-shaped frame. Inside the frame, a faint
   drawing shows which side to hold up: a photo and text lines for the front, text lines and the
   three machine-readable lines for the back. It fades once the card is in place. Below it, one tip at a time:
   *Fit the card inside the frame*, *Move a little closer*, *Hold the card straight*, *Too dark*,
   *Glare: tilt the card slightly*, *Hold the phone still*, *Blurry: wait for it to focus*. When
   every check passes for about half a second, the photo is taken by itself, and the view moves to
   the back: turn the card over and it takes that one too. The round button takes the photo at any
   moment, **Automatic shot** turns the automatic photo off, and ✕ closes the camera.

   The coach uses no model and no network, so it works the same online and offline. It needs a
   browser that gives web pages a live camera, and your permission. If either is missing (permission
   refused, no camera, an old browser, the page opened from a file), the coach does not open: a
   short note appears, and **Take photo** opens the phone's own camera app instead, as before.
4. **Document.** Confirm DNI 4.0, DNI 3.0 or TIE, then **Continue**. Each one has its own field
   positions. The app reads the code on the back (MRZ) on your device and preselects the document:
   *Document detected: TIE. Check it before you continue.* The first time, it downloads the OCR files
   (about 8 MB) once; you can choose by hand at any moment. Until a document is chosen, **Continue**
   stays off. Detection runs
   only in your browser and the photos never leave the device. To change the document later, go
   back from the editor: your photos are kept, the corners and choices start again.
5. **Straighten (automatic).** After **Continue**, the app looks for the card in each photo (with the
   on-device model, or classic edge detection), turns it the right way up, whether the photo was
   taken sideways or upside down, and straightens it. It then opens step 6 with both sides already
   corrected. You only see the corner screen when:
   - the card was not found in a photo ("We could not find the document in this photo. Place the
     corners by hand."),
   - you tap **Place the corners myself** while it works, or
   - you tap **Adjust corners** in step 6.

   **Corner screen.** The four circles sit on the corners that were found. To correct them, drag
   them onto the corners of the card; a magnifier shows the area under
   your finger. On a keyboard, arrow keys move the selected corner and <kbd>N</kbd> selects the next
   one. **Rotate** turns the frame a quarter turn (use it if a card still shows sideways or upside
   down), **Reset** puts the circles back. The button straightens the card again and takes you on.
6. **Hide.** The card stays on screen. Choose **Front** or **Back**; the list below shows that
   side's fields as switches. You can also tap a field on the card itself to cover or uncover it.
   The recommended fields start covered: signature, issue and expiry dates, support number, CAN and
   the machine-readable lines (MRZ), as far as the document has them (see
   [Supported documents](#supported-documents)). Fields left visible get a dashed orange outline; **Final
   preview** hides the outlines. **Adjust corners** goes back to step 5 and keeps your choices.
   Three tabs:
   - **Data:** the field switches and quick choices (**Recommended**, **Hide all**, **Show all**).
     Below them, **Find automatically** reads both sides with OCR on your device and adds a black
     box over each piece of data you pick: name and surnames, DNI/NIE number, dates, support number,
     CAN and MRZ lines. Dates, support number, CAN and MRZ are picked to start with; name and number
     are not. It works from the text itself, so it also finds data on layouts the app has not
     measured. A DNI/NIE number or a date counts only when its check letter or calendar date is
     valid. The boxes it adds are ordinary boxes: check them in **Boxes**, move or delete them, or
     undo them all in one step. The first use downloads about 8 MB. If finding cannot run (offline
     before that download, or a browser without a service worker), the button is disabled with a
     short note and you hide the data by hand.
   - **Boxes:** extra black boxes for anything the list does not cover. Turn on **Draw black box**
     and drag on the card. Select a box to move it, or drag its corners to resize it. **Undo** and
     **Redo** (<kbd>Ctrl</kbd>+<kbd>Z</kbd>, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>) work on
     boxes. With a keyboard: **Add box**, then arrow keys move it, <kbd>Shift</kbd>+arrows resize it,
     <kbd>N</kbd> selects the next box and <kbd>Delete</kbd> removes it.
   - **Watermark:** type what the copy is for, or pick a suggestion (rental, bank, dated copy), and
     turn on **Convert to black and white** if you like. The card updates as you type. The text is
     drawn small and light, repeated in staggered diagonal rows across the whole card, so a cropped
     part of the image still shows it. Long text wraps onto a few short lines (at most 120
     characters).
7. **Download.** Check both final images and the summary, tick **I have checked both sides**, then
   **Download PDF**. The file is called `protected-document.pdf`.
8. **Done.** On phones that support it, **Share** sends the PDF through the system share sheet.
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
| `pnpm test:coverage` | Unit tests with a coverage report in `coverage/` |
| `pnpm test:e2e` | End-to-end tests (Playwright, against the production build) |
| `pnpm size` | Bundle size against its budgets (after `pnpm build`) |
| `pnpm verify` | Type check, lint, unit tests, build and end-to-end tests, as CI runs them |

Stack: [Svelte 5](https://svelte.dev) with runes for the interface, Vite, strict TypeScript, native
CSS and the Canvas API. Image, geometry, redaction and PDF logic are plain TypeScript modules that do
not depend on Svelte. See [ADR 0003](docs/adr/0003-svelte-vite-pnpm.md).

Rules the code follows:

- No HTML strings: no `innerHTML` and no `{@html}`. Svelte builds DOM nodes directly
  (`fragments: 'tree'`). The CSP allows one Trusted Types policy, `default`, which only accepts
  two script URLs: the service worker and the OCR worker ([ADR 0009](docs/adr/0009-on-device-ocr.md)).
- No `eval`, `new Function`, inline scripts or inline styles. WebAssembly is allowed only for the
  corner model's runtime ([ADR 0007](docs/adr/0007-corner-model.md)).
- No runtime requests and no persistent storage.
- Test images are synthetic or official specimens. Never commit a photo of a real person's document.

## Tests

- **Unit** (`tests/unit/`): edge snapping (sides 7 % outside or inside a card on woven fabric come back onto it, past a printed band; a weak border on a light table is kept even when a band inside is much stronger), upright check (anchor boxes, upright and upside-down cards for every document), document type from the MRZ (code, issue date from birth and expiry dates), homography and warp, corner editing, zone data for every document (inside
  the card, sources, defaults, sizes), file decoding, i18n keys, build version (commit SHA checks,
  commit link, relative time in several languages),
  redaction raster (every masked pixel is opaque black, input untouched), JPEG filter (metadata
  segments dropped, image data unchanged), corner model answer checks, and PDF structure (pages, images, no metadata, no text,
  deterministic output).
- **End to end** (`tests/e2e/`): document picker (each document's size, fields and warnings; changing
  it keeps the photos), document detection (synthetic MRZ backs: TIE and DNI 4.0 preselected, nothing preselected without a result, a sideways
  photo, a manual choice never overridden, a note and the manual picker when offline or without a service
  worker), photo selection, automatic straightening (photos turned 0°, 90°, 180° and 270° come out
upright, front and back), corner alignment from **Adjust corners**, the corner model (real model under the
  real CSP on generated cluttered photos and on dark woven fabric in portrait phone photos, edge detection when the model is unavailable, the manual
  corner screen with a note when nothing is found, never overriding the user, cached after first use and working
  offline, a tampered model refused), the field checklist and its
  warnings, review, a real PDF download (decoded in the browser to check that hidden areas are black
  and that the file has no metadata, no source file name and no watermark text), reset,
  the footer version (short SHA linked to the commit, relative deploy time that updates and follows
  the language, same version after an offline reload), and
  security checks on the built page: exact CSP, referrer policy, SRI on every asset, no inline code, no CSP violations and no
  request outside the page's origin, every on-demand chunk listed in the import map with the right
  hash, a tampered PDF chunk refused by the browser, and offline mode (reload and full flow to the
  PDF with the network off; a tampered file stops the service worker install).

## Continuous integration

Every pull request and every push to `master` runs the **CI** workflow
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). It is split into small jobs, each with one
purpose, grouped in logical stages (the layout follows the
[to-be-continuous](https://gitlab.com/to-be-continuous/samples/svelte-on-s3) GitLab templates).
GitHub Actions has no stages: a job starts as soon as the jobs it `needs` have passed, so
independent checks run in parallel and a failure shows exactly which check failed.

The work is split by where the code is:

- **Pull request: validate.** Every check runs. Nothing is deployed.
- **`master`: release.** The code was already validated on its pull request, so the checks do not
  run again. `master` builds, deploys and then checks the live site.

This is safe because pull requests are squash-merged and branch protection requires the branch to be
up to date with `master` before merging: the tree that lands on `master` is the tree that passed.

```text
Pull request
changes ─ install ─┬─ build ──────┬─ e2e (2 shards) ─┐
                   ├─ typecheck   ├─ bundle-size     │
                   ├─ lint        ├─ reproducible    │
                   │              └─ lighthouse      │
                   └─ unit                           ├─ ci-ok
reuse · audit · dependency-review · workflow-lint ───┘

master (push, or a manual run of CI)
changes ─ install ─ build ─ ci-ok ─ deploy ─┬─ smoke ─ lighthouse-live
                                            └─ attest (build provenance)
```

| Stage | Job | What it does | Runs on | Fails the pipeline |
|---|---|---|---|---|
| changes | `changes` | Decides what the run does: release on `master`; on a pull request, whether it touches code. A change to only Markdown, `docs/` or `LICENSES/` skips the code jobs | Both | No |
| setup | `install` | `pnpm install --frozen-lockfile`. Saves the `node_modules` and pnpm store caches that every later job restores | Both | Yes |
| build | `build` | `pnpm build` with `SOURCE_DATE_EPOCH` set to the commit time, so the build is reproducible. Uploads `dist/` once; every later job tests or deploys that same build. Also uploads a CycloneDX SBOM of the runtime dependencies (`sbom` artifact, from `pnpm sbom`) | Both | Yes |
| build | `typecheck` | `pnpm typecheck` (svelte-check, strict TypeScript) | PR | Yes |
| build | `lint` | `pnpm lint` (ESLint) | PR | Yes |
| build | `unit` | `pnpm test:coverage` (Vitest). Coverage table in the job summary, HTML report as an artifact. No threshold yet | PR | Yes |
| test | `e2e (1/2)`, `e2e (2/2)` | `pnpm test:e2e`, split in two shards, against the built `dist/` | PR | Yes |
| test | `reproducible` | Builds the same commit again on a fresh runner and compares the SHA-384 of every file with the `dist/` artifact ([`scripts/build-manifest.ts`](scripts/build-manifest.ts)). Any difference fails | PR | Yes |
| test | `bundle-size` | `pnpm size`: gzip size of the start page, PDF chunk, corner model and OCR files against budgets in [`scripts/bundle-size.ts`](scripts/bundle-size.ts) | PR | No, warns (`--strict` makes it fail) |
| code analysis | `reuse` | Every file has copyright and licence information ([REUSE](https://reuse.software)) | PR | Yes |
| code analysis | `audit` | `pnpm audit --prod`: known high or critical vulnerabilities in the code that ships | PR | Yes |
| code analysis | `dependency-review` | A new or updated dependency with a known moderate or worse vulnerability | PR | Yes |
| code analysis | `workflow-lint` | [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh) on the workflows (syntax, script injection, permissions, pinning). Rules turned off are explained in [`.github/zizmor.yml`](.github/zizmor.yml) | PR | Yes |
| acceptance | `lighthouse` | Lighthouse on the built site (performance, accessibility, best practices, SEO), thresholds in [`lighthouserc.json`](lighthouserc.json). Reports are a workflow artifact; nothing is uploaded elsewhere | PR | No, warns |
| gate | `ci-ok` | Passes when every job above passed or was skipped on purpose | Both | Yes |
| deploy | `deploy` | Publishes the built `dist/` to GitHub Pages. Only a push or manual run on `master`, never a pull request or another branch. A running deploy is never cancelled | `master` | Yes |
| post-deploy | `smoke` | [`scripts/smoke.ts`](scripts/smoke.ts): the live site serves exactly this run's build: the exact CSP and referrer policy, the entry script's SRI and commit, every file of the service worker's manifest, and every file of the `dist` artifact byte for byte. Retries for up to 5 minutes while Pages updates | `master` | Yes |
| post-deploy | `attest` | Signed build provenance for every deployed file ([artifact attestations](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)). Check a file with `gh attestation verify <file> --repo aasanchez/dnilimpio.es` | `master` | Yes |
| post-deploy | `lighthouse-live` | Lighthouse on the live site, with real hosting (compression, cache headers). Thresholds in [`lighthouserc.live.json`](lighthouserc.live.json) | `master` | No, warns |

**Caching.** Each job starts from caches instead of downloading again:

- `node_modules`, keyed on `.nvmrc`, `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`. A
  hit skips `pnpm install` entirely. Pull requests also read the caches that `master` saved.
- The pnpm store, used only when `node_modules` misses (a dependency changed).
- Playwright's Chromium headless shell (smaller than full Chromium), keyed on the Playwright version.
- `dist/` is built once per run and passed to the jobs that need it as an artifact.

The **CodeQL** workflow ([`.github/workflows/codeql.yml`](.github/workflows/codeql.yml)) runs static
security analysis of the TypeScript and Svelte code and of the workflows, on pull requests, on
`master` and every Monday. Results appear under **Security > Code scanning**. GitGuardian scans for
secrets.

Rules the workflows follow:

- Actions are pinned to full commit SHAs; the comment gives the release tag.
- Every job has read-only permissions, except `deploy` (Pages), `attest` (signing the provenance) and
  CodeQL (code scanning results).
- Checkout never keeps the token (`persist-credentials: false`).
- Node, pnpm and Playwright versions come from `.nvmrc`, `package.json` and `pnpm-lock.yaml`, set up
  by one shared action ([`.github/actions/setup`](.github/actions/setup/action.yml)).
- A new push to a pull request cancels its previous run. On `master` runs queue instead.

**Rebuild and check it yourself.** The build is reproducible: the same commit gives the same bytes.

```sh
git checkout <commit>
export SOURCE_DATE_EPOCH="$(git log -1 --format=%ct)" GITHUB_SHA="$(git rev-parse HEAD)"
pnpm install --frozen-lockfile && pnpm build
node scripts/build-manifest.ts dist   # SHA-384 of every file, to compare with the live site
```

**Branch protection** for `master`:

- Require a pull request before merging, so every change is validated.
- Require status checks: only `ci-ok`. It covers every other job, so adding or renaming a job does
  not need a settings change.
- Require branches to be up to date before merging, so the merged tree is the tested tree.
- Environment `github-pages`: deployment branches limited to `master`.

To run the same checks locally: `pnpm verify`, then `pnpm size` and `pnpm test:coverage`. The CI
tools that are not npm packages (REUSE, actionlint, zizmor) can be run with `pipx run reuse lint`,
`pipx run zizmor .github/` and the actionlint binary.

## Deployment

On `master`, the `deploy` job publishes the freshly built `dist/` to GitHub Pages (the same code
that passed every check on its pull request). `smoke` then checks that the live site serves it, and
`lighthouse-live` measures it. To redeploy without a new commit, run the **CI** workflow on
`master` from the Actions tab.

Do not re-run the old **pages build and deployment** workflow if it appears in the Actions tab. It
publishes the raw, unbuilt source of an old commit over the real site.

The build uses relative paths, so `dist/` works at a domain root, under a subpath and on any static
server (Nginx, Caddy, Cloudflare Pages). Moving to the `dnilimpio.es` domain needs no code change:
set the custom domain in the repository's Pages settings and point DNS at GitHub Pages.

### Version shown in the app

The start screen's footer shows the running build: `Versión 2a07023 · desplegado hace 5 minutos`.

- The SHA is the commit the build comes from, shortened to 7 characters and linked to
  `<REPO_URL>/commit/<full SHA>`. CI takes it from `GITHUB_SHA`; a local build takes it from
  `git rev-parse HEAD`. Without either, the footer says `desarrollo` and shows no link.
- The time is when `dist/` was built. On `master` the `deploy` job publishes that build once every check
  has passed, so it is the deploy time to within minutes. It is shown as relative time in the page's
  language (`Intl.RelativeTimeFormat`), updates every 30 seconds, and shows the exact date on hover.
  Set `SOURCE_DATE_EPOCH` (seconds) to fix it, for example for a reproducible build.
- Both values are written into the JavaScript bundle at build time (Vite `define`, see
  [`vite.config.ts`](vite.config.ts) and [`src/version/build-info.ts`](src/version/build-info.ts)).
  The page fetches nothing, so the footer works offline. A tab always shows the build it runs: after a
  service worker update, the new build brings its own values.
- Consequence: every deploy changes the bundle, so every deploy is a new offline build, even when only
  documentation changed. The service worker then downloads the app files once more (on-demand files
  already saved, OCR data and the corner model, are kept when their bytes match).

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
  zones/             field positions and size per document, from official specimens; documents.ts lists them
  redact/            normalised zones to pixels, opaque fills
  engine/            fields, secure raster, watermark, JPEG filter, PDF export (TypeScript)
  detect/            corner finding: on-device model (loaded on demand), classic edge detection
                     (Sobel + Hough), answer checks, fallback order; document type from the MRZ
  ocr/               on-device OCR (Tesseract.js, loaded on demand), MRZ reader, smart field finding
  security/          Trusted Types policy
  version/           commit SHA and build time shown in the footer, relative time
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
- [0006](docs/adr/0006-document-types.md): several document types, chosen by the user.
- [0007](docs/adr/0007-corner-model.md): corner finding with a small on-device model, and the CSP change it needs.
- [0008](docs/adr/0008-capture-coach.md): capture coach with classical image metrics, no model.
- [0009](docs/adr/0009-on-device-ocr.md): on-device OCR with Tesseract.js, self-hosted and loaded on demand.
- [0010](docs/adr/0010-smart-field-finding.md): smart field finding from OCR text; results become ordinary boxes.
- [0011](docs/adr/0011-document-detection.md): document type detected from the MRZ, after the photos; it only preselects.
- [0012](docs/adr/0012-automatic-straightening.md): automatic straightening (find, turn, straighten); the corner screen only on request.
- [0013](docs/adr/0013-ci-pipeline.md): CI split into small, single-purpose jobs in logical stages, with one required check.

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
to its users. Third-party libraries keep their own licences (`@cantoo/pdf-lib`, `onnxruntime-web` and
the `scanic-ml` model and runtime: MIT; Tesseract.js and its core and language data: Apache-2.0;
`wasm-feature-detect`: Apache-2.0). The bundled
fonts (Bricolage Grotesque, JetBrains Mono, Caveat) are under the [SIL Open Font Licence
1.1](LICENSES/OFL-1.1.txt). File-level
licence data follows [REUSE](REUSE.toml).
