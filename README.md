# DNI limpio

Hide the sensitive data on a photo of your Spanish identity document before you share a copy.
Everything runs in your browser, on your device. Nothing is uploaded.

**Use it:** <https://aasanchez.github.io/dnilimpio.es/> (planned move to `dnilimpio.es`).

> [!IMPORTANT]
> **Work in progress.** The full flow works for the DNI 4.0: select both sides, straighten them,
> choose the fields to hide, add a watermark, review and download the PDF. Manual black boxes,
> offline mode and automatic detection are still being built (see [Status](#status)).
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

1. **Select** a photo of the front and the back (JPEG, PNG, WebP; camera on mobile).
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
- **No storage.** Photos, fields, watermark text and PDFs are kept in memory only. The code is not
  allowed to use `localStorage`, `sessionStorage` or `indexedDB` (enforced by the linter).
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
  file is refused by the browser.

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
   select a photo. The tool keeps working.
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
| Manual black boxes with undo and redo, zoom, one-page layout | Next |
| Offline mode with service worker and integrity checks | Planned |
| Automatic detection (edges, document type, OCR) | Planned |
| 31 languages | 13 today |

## How to use it

Open the site in a current browser (Chrome, Edge, Firefox, Safari; desktop or mobile). No account,
no installation.

1. Optional: disconnect from the Internet after the page has loaded.
2. Select the front, then the back.
3. Drag the four circles onto the corners of the card. On a keyboard, arrow keys move the selected
   corner and <kbd>N</kbd> selects the next one. **Rotate** turns the frame if the photo is sideways.
4. Do the same for the back.
5. **Fields to hide:** a checked box hides that field on every side where it is printed. The
   recommended fields start checked: signature, issue and expiry dates, support number, CAN and the
   machine-readable lines (MRZ). Fields left visible get a dashed outline in the preview; tick
   **Final preview** to see the result without outlines. **Adjust corners** goes back to step 2
   and keeps your choices.
6. Optional: type a **watermark** and tick **Convert to black and white**. The preview updates as
   you type.
7. **Review and download:** check both final images and the summary, tick **I have checked both
   sides**, then **Download PDF**. The file is called `protected-document.pdf`.
8. **Start again** clears the photos and all your choices from the page.

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
  (`fragments: 'tree'`), and the CSP forbids creating any Trusted Types policy.
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
  hash, and a tampered PDF chunk refused by the browser.

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
  main.ts            mounts the app
  App.svelte         screen flow
  components/        Svelte components, one per screen or control
  capture/           file input, drag and drop, paste, decoding
  geometry/          homography, perspective warp, corner editing (pure TypeScript)
  zones/             field positions per document, from official specimens
  redact/            normalised zones to pixels, opaque fills
  engine/            fields, secure raster, watermark, JPEG filter, PDF export (TypeScript)
  i18n/              dictionaries, one JSON file per language
  ui/                corner editor (canvas widget) and in-memory state
scripts/             CSP, build plugins (CSP, SRI), test fixture generator
tests/               unit, e2e and synthetic fixtures
docs/                plan, zone measurement method, decision records
```

## Design decisions

Significant decisions are recorded in [`docs/adr/`](docs/adr/):

- [0001](docs/adr/0001-pdf-library.md): PDF export with `@cantoo/pdf-lib`.
- [0002](docs/adr/0002-no-standalone-release.md): no standalone offline release.
- [0003](docs/adr/0003-svelte-vite-pnpm.md): Svelte 5, Vite, pinned Node.js and pnpm.

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
to its users. Third-party libraries keep their own licences (`@cantoo/pdf-lib`: MIT). File-level
licence data follows [REUSE](REUSE.toml).
