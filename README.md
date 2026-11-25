# DNI limpio

Hide the sensitive data on a photo of your Spanish identity document before you share a copy.
Everything runs in your browser, on your device. Nothing is uploaded.

**Use it:** <https://aasanchez.github.io/dnilimpio.es/> (planned move to `dnilimpio.es`).

> [!IMPORTANT]
> **Work in progress.** Today the tool loads the front and back photos and straightens each card.
> Hiding fields, the watermark, black and white, and the PDF download are being built now (see
> [Status](#status)). Do not rely on it to share a document yet.

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
- **Verifiable code.** The production build is not minified, ships source maps, and every script and
  stylesheet has a Subresource Integrity hash.

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
| Secure raster engine: greyscale, opaque masks with margin, self-check | Done (not in the UI yet) |
| PDF engine: A4, one side per page, metadata-free | Done (not in the UI yet) |
| Move the UI to Svelte 5 and pnpm | Next |
| One-page tool: fields to hide, manual boxes, undo and redo, watermark, black and white, review, download, reset | Planned |
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
4. Check the straightened cards, then continue.

The steps for fields, watermark and download will be added here as they land.

## Languages

The interface is available in Spanish (default), Catalan, Valencian, Galician, Basque, English, French,
Dutch, Swedish, Finnish, Ukrainian, Romanian and Arabic (right to left). All languages are bundled in
the build; the page never downloads translations. The language follows the browser and can be changed
from the selector at the top.

Translations other than Spanish and English are machine-assisted drafts. Corrections are welcome: edit
one file in `src/i18n/locales/` and open a pull request. Spanish (`es.json`) defines the keys.

## Development

Requirements: Node.js (version in [`.nvmrc`](.nvmrc), managed with [nvm](https://github.com/nvm-sh/nvm))
and npm. The project moves to pnpm in the next step; this section will change with it.

```bash
nvm install && nvm use
npm ci              # install exact versions from the lockfile (install scripts are disabled)
npx playwright install chromium   # once, for the end-to-end tests
npm run dev         # development server at http://localhost:5173 (no CSP in dev mode)
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build in `dist/` (CSP and SRI injected) |
| `npm run preview` | Serve `dist/` at http://localhost:4173 |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run lint` / `npm run lint:fix` | ESLint (neostandard + typescript-eslint strict + security bans) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, against the production build) |
| `npm run check` | All of the above, in the order CI runs them |

Rules the code follows:

- No HTML strings: the DOM is built with `createElement` and `textContent` (Trusted Types is enforced).
- No `eval`, `new Function`, inline scripts or inline styles.
- No runtime requests and no persistent storage.
- Test images are synthetic or official specimens. Never commit a photo of a real person's document.

## Tests

- **Unit** (`tests/unit/`): homography and warp, corner editing, zone data, file decoding, i18n keys,
  redaction raster (every masked pixel is opaque black, input untouched), JPEG filter (metadata
  segments dropped, image data unchanged) and PDF structure (pages, images, no metadata, no text,
  deterministic output).
- **End to end** (`tests/e2e/`): photo selection, corner alignment, and security checks on the built
  page: exact CSP, referrer policy, SRI on every asset, no inline code, no CSP violations and no
  request outside the page's origin.

## Deployment

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `npm run check` on every
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
  main.ts            app entry and screen flow
  capture/           file input, drag and drop, paste, decoding
  geometry/          homography, perspective warp, corner editing (pure TypeScript)
  zones/             field positions per document, from official specimens
  redact/            normalised zones to pixels, opaque fills
  engine/            secure raster, JPEG filter, PDF export (pure TypeScript)
  i18n/              dictionaries, one JSON file per language
  ui/                screens and the corner editor
scripts/             CSP, build plugins (CSP, SRI), test fixture generator
tests/               unit, e2e and synthetic fixtures
docs/                plan, zone measurement method, decision records
```

## Design decisions

Significant decisions are recorded in [`docs/adr/`](docs/adr/):

- [0001](docs/adr/0001-pdf-library.md): PDF export with `@cantoo/pdf-lib`.
- [0002](docs/adr/0002-no-standalone-release.md): no standalone offline release.

## Contributing

Issues and pull requests are welcome. Before you open a pull request:

1. Run `npm run check`; it must pass.
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
