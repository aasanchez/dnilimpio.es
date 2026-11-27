# CLAUDE.md

Instructions for AI coding agents working in this repository. `AGENTS.md` is a symlink to this
file. For how the app works, read [`README.md`](README.md); for why it works that way, read the
decision records in [`docs/adr/`](docs/adr/README.md). This file holds only what an agent needs to
change the code safely. Do not copy README content here; link to it.

## The product

**DNI Tapado.es** (short mark **DT.es**) hides sensitive data on a photo of a Spanish identity
document (DNI or TIE) and exports a redacted PDF. Everything runs in the browser, on the device.
The promise to users is: **document processing runs on your device, the app does not upload your
document, no cookies, and nothing from the document is stored.** Every rule below protects that
promise. Public wording states only what is exactly true: the browser does keep the app's files and
AI models (Cache Storage) and the notice's closing date, and the host sees each request. Say so;
never write "nothing stored" or "never leaves" without that context.

- Live site: <https://dnitapado.es> (GitHub Pages, custom domain). The old address
  <https://aasanchez.github.io/dnilimpio.es/> still exists; keep both working (see rule 6).
- The repository is still named `aasanchez/dnilimpio.es`. Do not rename repository URLs, the cache
  prefix `dnilimpio-` or the storage key `dnilimpio.noticeDismissedAt`: renaming them orphans
  caches and shows the notice again to returning users.
- The brand is the constant `BRAND` in `src/App.svelte`, not a translated string. Use
  "DNI Tapado.es" in new user-facing text.
- Owner: Alexis (`aasanchez`). Licence: AGPL-3.0-or-later, with exceptions listed in the README.

## Stack

Svelte 5 (runes) + Vite + strict TypeScript, pnpm, Tailwind CSS v4 compiled at build time only.
On-device AI runs in WebAssembly through `onnxruntime-web`: PP-OCRv6 tiny for OCR (in a worker,
`src/ocr/`) and DocCornerNet for card corners (`src/detect/`). PDF export uses `@cantoo/pdf-lib`.
The app is an installable PWA with a service worker that verifies every file by hash.
Versions are pinned exactly: Node.js in `.nvmrc`, pnpm in `package.json` `packageManager`.

## Commands

Run from the repository root. These match `package.json` and what CI runs.

```bash
pnpm install --frozen-lockfile       # install; lockfile is authoritative, install scripts are off
pnpm exec playwright install chromium   # once, before the first e2e run
pnpm dev                             # dev server, http://localhost:5173 — NO CSP, not for security checks
pnpm typecheck                       # svelte-check, strict; warnings fail
pnpm lint                            # ESLint (neostandard, typescript-eslint strict, security bans)
pnpm format                          # ESLint --fix
pnpm test                            # unit tests (Vitest), tests/unit/
pnpm build                           # production build in dist/ (CSP, SRI, import map, SW manifest)
pnpm test:e2e                        # Playwright against `pnpm preview` of dist/ (build first)
pnpm size                            # bundle size against budgets (after build)
pnpm verify                          # typecheck + lint + unit + build + e2e: run before every PR
```

Narrow runs while iterating:

```bash
pnpm test tests/unit/zones.test.ts
pnpm build && pnpm test:e2e tests/e2e/privacy.spec.ts
pnpm test:e2e -g "tampered"          # by test title
```

- e2e tests run against `dist/`, never the dev server. Rebuild after every source change, or the
  tests check stale code. Locally Playwright reuses a running preview server on port 4173; stop a
  stale one.
- Re-run only the tests that failed while you fix them; run `pnpm verify` once at the end.

## Non-negotiable rules

Breaking one of these breaks the product's promise or its security model. If a task seems to
require breaking one, stop and ask Alexis instead of finding a workaround.

1. **Photos and card data never leave the device.** Add no network request, upload, telemetry or
   remote API. ESLint bans `fetch`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection` and storage
   APIs outside the service worker; do not disable those rules. No third-party script may run in the
   page that holds the photos (ADR 0023): `connect-src` is `'none'` and `tests/e2e/third-party.spec.ts`
   fails otherwise. Visit counts come only from the sandboxed counter frame on another site
   (`src/analytics/stats-frame.ts`, ADR 0024): pass it nothing and never add `postMessage`. Never add
   Google Analytics, GTM or any cookie-based tool.
2. **Nothing of the user's persists.** No cookies, no `localStorage`/`sessionStorage`/IndexedDB, except the
   notice's closing date in `src/ui/notice-memory.ts`. Photos are cleared on `pagehide`.
3. **Strict CSP, single source.** The policy lives in `scripts/csp.ts`; the e2e test asserts the
   built page carries exactly that value. No inline scripts or styles, no `style` attributes with
   dynamic values, no `eval`/`new Function`, no `innerHTML` or `{@html}`. The only Trusted Types
   policy is `default` (`src/security/trusted-types.ts`). From the photo step on, a second, stricter
   policy is added (`src/security/intake-lockdown.ts`, ADR 0025): after the start screen the page
   cannot load any image except `blob:`/`data:`, any font, stylesheet or connection. Load such files
   before intake. Any CSP change needs an ADR and Alexis's approval.
4. **Self-hosted assets with integrity.** Every script, style, font, model and WebAssembly file is
   bundled and served from this site, checked by SHA-384 (`scripts/vite-plugins.ts`). No CDNs, no
   Google Fonts, no runtime downloads from third parties, no third-party scripts.
5. **Online first, offline optional.** Every feature works in both modes. When an AI feature cannot
   run (offline before its files are cached, an old browser, a model error), disable it visibly and
   fall back to the manual path. Never show a random error and never block the flow. Large AI
   files load on demand: `ocr/` and `assets/ml/` (`isOnDemand` in `src/offline/precache.ts`).
6. **Relative URLs only.** The same `dist/` must work at the domain root and under a subpath
   (`base: './'` in `vite.config.ts`). Never write a root-absolute path such as `/icons/x.png`.
7. **New static files need two updates.** The service worker serves only files listed in the
   build's manifest and denies everything else (`route()` in `src/offline/precache.ts`). When you
   add a file to `public/` or a new kind of served file, check it passes `route()`, and add it to
   the allowlist regex of cached paths in `tests/e2e/privacy.spec.ts`.
8. **Every user-facing string in all 13 locales.** Dictionaries are `src/i18n/locales/*.json`
   (`LANGS` in `src/i18n/index.ts`); `es.json` is the source. Card guide text is in
   `src/guide/locales/*.json`. Add each new key to every file with the same placeholders, and
   translate it; `tests/unit/i18n.test.ts` fails on missing keys, extra keys or empty strings.
   `ar` is right-to-left: check the layout.
9. **Card guide facts come only from cited official sources.** BOE, dnielectronico.es, PRADO,
   ICAO Doc 9303, EU regulations. Never guess a fact about a document. If no official source
   exists, the entry says so. Sources are in `src/guide/sources.ts` and
   [`docs/GUIDE-SOURCES.md`](docs/GUIDE-SOURCES.md); `tests/unit/guide.test.ts` fails on an
   uncited element. Field positions come from official specimens ([`docs/ZONES.md`](docs/ZONES.md)).
10. **No real documents in the repository.** Test images and screenshots use synthetic cards
    (`tests/fixtures/`, `scripts/make-fixtures.ts`) or official specimens only.
11. **Dependencies are pinned and few.** Exact versions, no install scripts
    (`pnpm-workspace.yaml`). Do not add a runtime dependency without asking Alexis first.

## Code conventions

- Image, geometry, redaction and PDF logic are plain TypeScript modules with no Svelte import, so
  unit tests run them in Node. Svelte components stay thin.
- Masked pixels must be opaque black in the exported raster; exported JPEG and PDF carry no
  metadata and no text (`src/engine/`, covered by `masks`, `jpeg` and `pdf` tests).
- AI results never act on their own: they become ordinary, undoable boxes or a preselection the
  user can change (ADR 0010, 0011).
- Styles: Tailwind utilities in markup, shared pieces as `@layer components` classes in
  `src/ui/styles.css`. Put the base style of a stateful piece in its component class, because
  utilities on the element beat component state rules. Phone layout first, then `lg:`.
- Links that leave the app open in a new tab, because leaving the page clears the photos.
- Every new file carries an SPDX licence header (copy the first line of a neighbouring file), or is
  listed in [`REUSE.toml`](REUSE.toml) if it cannot hold a comment (JSON, images). CI runs
  `reuse lint`, which also parses SPDX tags quoted in prose, so do not write one inside Markdown.
- Raise a bundle budget in `scripts/bundle-size.ts` only on purpose, and say why in the PR.
- Write documentation and UI text in plain language (ISO 24495-1): short sentences, active voice,
  concrete words. Match the tone of the README.

## Where things are

| Path | What |
|---|---|
| `src/App.svelte`, `src/main.ts` | Screen flow and brand; boot, lockdown, SW registration |
| `src/components/` | One Svelte component per screen or control |
| `src/capture/` | File input, drag and drop, paste, decoding, live camera, capture coach |
| `src/detect/` | Corner model, classic edge detection, straightening, document type detection |
| `src/ocr/` | PP-OCRv6 worker, MRZ reader, smart field finding |
| `src/zones/` | Field positions per document; `documents.ts` lists the documents |
| `src/engine/` | Fields, masks, secure raster, watermark, JPEG filter, PDF export, undo history |
| `src/guide/` | Card guide: sources, cited entries, text per language |
| `src/offline/`, `src/sw.ts` | Service worker, precache manifest and `route()`, update of idle tabs, worker check |
| `src/security/` | Trusted Types policy, WebRTC and framing lockdown, photo-step CSP (intake lockdown), audit prompt |
| `src/i18n/` | Dictionaries, language choice |
| `scripts/` | CSP, Vite plugins (SRI, import map, SW manifest), smoke test, size, icons, fixtures |
| `tests/unit/`, `tests/e2e/` | Vitest and Playwright; the README lists what each file checks |
| `docs/adr/` | Architecture decision records, with an index |
| `.github/workflows/ci.yml` | CI; `ci-ok` is the single required check; deploy runs from `master` only |

## Workflow

- **One pull request per feature.** Keep unrelated changes out of it. Merges use **Squash and
  merge**; write the PR title as the final commit subject (`feat(scope): …`, `fix(scope): …`,
  `docs(scope): …`).
- **Tests for every change.** Unit tests for logic, an e2e spec for user-visible behaviour. A
  privacy- or security-relevant change also needs a test that would fail if the protection broke.
- **An ADR for every architectural decision**: anything costly to reverse, such as a new
  dependency, CSP or service worker change, new storage, a new AI model or a change to the
  privacy promise. Use the next free number in `docs/adr/` (check the index, and open PRs, for
  numbers already taken), follow the format of the existing records (Status, Date, Decided by;
  Context, Decision, Consequences), and add a row to `docs/adr/README.md` and to the
  "Design decisions" list in `README.md`. When a decision changes an older one, update the older
  record's status line.
- **Keep the README in sync** in the same PR: the Status table, the Tests tables, the ADR list and
  any privacy wording you change.
- **Before you open the PR**, run `pnpm verify` and confirm it passes. Report failures honestly;
  never skip, disable or loosen a test, lint rule or budget to get green.
- **CI and deploy.** PRs run every check and never deploy. `master` builds, deploys, smoke-tests
  the live site and runs Lighthouse. To redeploy, run the "CI" workflow on `master`; never re-run
  the legacy "pages build and deployment" workflow, because it publishes unbuilt source. Actions
  are pinned to commit SHAs; keep them pinned.
- **Releases** (ADR 0032). Each deploy from `master` is tagged `vMAJOR.MINOR.PATCH` and gets a
  GitHub Release, after the deploy succeeds. The patch is automatic (`scripts/release-version.ts`);
  major and minor only change when Alexis pushes a tag. Never create or move a version tag yourself.

## When in doubt

Ask before you change the privacy promise, the CSP, the service worker's rules, the licence, the
brand or a decision recorded in an ADR. For anything else, follow the nearest existing pattern in
the code, and say in the PR which reading of the task you chose.
