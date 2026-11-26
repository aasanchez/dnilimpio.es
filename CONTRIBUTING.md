# Contributing to DNI Tapado.es

Thank you for helping. This guide explains how to set up the project, how to send a change, and,
above all, how to improve the translations. The [README](README.md) describes what the app does,
the full command list, the test suites, the CI pipeline and the design decisions. This guide links
to it instead of repeating it.

## Contents

- [Ways to help](#ways-to-help)
- [Set up the project](#set-up-the-project)
- [Run the tests](#run-the-tests)
- [Send a pull request](#send-a-pull-request)
- [Rules every change must respect](#rules-every-change-must-respect)
- [Help with translations](#help-with-translations)
  - [How the language files work](#how-the-language-files-work)
  - [Fix a translation](#fix-a-translation)
  - [Translate the card guide](#translate-the-card-guide)
  - [Right-to-left languages (Arabic)](#right-to-left-languages-arabic)
  - [Test a language locally](#test-a-language-locally)
  - [Add a new language](#add-a-new-language)
- [Report a security problem](#report-a-security-problem)

## Ways to help

| You want to | Do this |
|---|---|
| Fix a wrong or unnatural translation | Edit one JSON file and open a pull request ([steps](#fix-a-translation)). If you do not use Git, open a [translation issue](https://github.com/aasanchez/dnilimpio.es/issues/new?template=translation.yml). |
| Add a language | Open a [translation issue](https://github.com/aasanchez/dnilimpio.es/issues/new?template=translation.yml) first, then follow [Add a new language](#add-a-new-language). |
| Report a bug or suggest a feature | Open an [issue](https://github.com/aasanchez/dnilimpio.es/issues/new). Never attach a photo of a real document. |
| Change code | Follow [Set up the project](#set-up-the-project) and [Send a pull request](#send-a-pull-request). |
| Report a security problem | Report it privately ([details](#report-a-security-problem)). |

## Set up the project

You need [nvm](https://github.com/nvm-sh/nvm) and pnpm. The versions are pinned: Node.js in
[`.nvmrc`](.nvmrc), pnpm in the `packageManager` field of [`package.json`](package.json).

```bash
git clone https://github.com/aasanchez/dnilimpio.es.git
cd dnilimpio.es
nvm install && nvm use                  # Node.js version from .nvmrc
npm install --global pnpm@12.23.0       # same version as packageManager in package.json
pnpm install --frozen-lockfile          # exact versions from pnpm-lock.yaml
pnpm exec playwright install chromium   # once, for the end-to-end tests
pnpm dev                                # http://localhost:5173
```

The development server has no Content Security Policy (CSP). To see the app as users get it, build
it and serve the build:

```bash
pnpm build && pnpm preview              # http://localhost:4173, with CSP
```

The [README command table](README.md#development) lists every script.

## Run the tests

Run the full check before you open a pull request. CI runs the same steps.

```bash
pnpm verify    # type check, lint, unit tests, build, end-to-end tests
```

While you work, run only what you need:

```bash
pnpm typecheck                         # svelte-check, strict TypeScript; warnings fail
pnpm lint                              # ESLint; pnpm format fixes style issues
pnpm test tests/unit/i18n.test.ts      # one unit test file (Vitest)
pnpm build && pnpm test:e2e tests/e2e/guide.spec.ts   # one end-to-end file (Playwright, needs a build)
```

The [README test section](README.md#tests) describes what each test file covers.

## Send a pull request

1. **One pull request per feature or fix.** Keep it small enough to review in one sitting. Do not
   mix a translation fix with a code change.
2. **Branch from `master`** and give the branch a short, descriptive name.
3. **Write commit messages** in the style of the history: `type(area): what changes`, for example
   `fix(i18n): correct the Catalan text of the export button`. Common types: `feat`, `fix`, `docs`,
   `test`, `build`, `ci`, `chore`.
4. **Add or update tests** for what you change.
5. **Update the README** where your change makes it wrong: the status table, the test tables, the
   ADR list, or the privacy text.
6. **Write an ADR for decisions that are costly to reverse**, such as a new dependency, a CSP change,
   a new runtime request or a new kind of storage. Add `docs/adr/NNNN-short-title.md` with the next
   free number, in the format described in [`docs/adr/README.md`](docs/adr/README.md) (context,
   decision, alternatives, consequences), and add a row to that file's table.
7. **Keep licence information complete.** The project follows [REUSE](https://reuse.software). A new
   source file starts with an `SPDX-License-Identifier: AGPL-3.0-or-later` comment. Files that
   cannot carry a comment (JSON, images) must match a path in [`REUSE.toml`](REUSE.toml).
8. **Run `pnpm verify`.** It must pass.
9. **Open the pull request** against `master`. Say what changes and why, and how you tested it.
   For visual changes, add a screenshot made with a synthetic or specimen image.

Pull requests are merged with **Squash and merge**: the whole pull request becomes one commit on
`master`, and its title becomes the commit message. Write the title accordingly.

## Rules every change must respect

DNI Tapado.es promises users that their photos never leave their device. Every change must keep that
promise. CI tests these rules, and a review rejects changes that break them.

**Privacy**

- No new network requests at runtime. The only request is the cookieless visit counter on the
  public site ([ADR 0015](docs/adr/0015-cookieless-analytics.md)). Do not add analytics, fonts,
  scripts or images from other servers.
- No new persistent storage: no cookies, no `localStorage` keys, no IndexedDB. The only stored value
  is the date the privacy notice was closed (`src/ui/notice-memory.ts`).
- Photos stay in memory and never leave the page.
- Every feature works online and offline. If a feature needs a model that is not available (for
  example offline before first use), disable it and fall back to the manual way. Never show a
  random error.
- Links that leave the app open in a new tab, because leaving the page clears the photos.
- Tests and screenshots use synthetic images or official specimens only. **Never commit a photo of
  a real person's document.**

**Content Security Policy and code safety**

- No inline scripts, no inline styles and no dynamic values in a `style` attribute. Styles are
  Tailwind CSS classes, built at build time ([ADR 0017](docs/adr/0017-tailwind-css.md)).
- No `innerHTML`, no `{@html}`, no `eval` and no `new Function`.
- Do not change the CSP, the Trusted Types policy or the service worker file list without an ADR.
- Do not add a runtime dependency without opening an issue first. Every dependency is bundled and
  served from this site.

The [README rules](README.md#development) give the exact list.

## Help with translations

The interface is available in 13 languages. Spanish is the source language. English is reviewed by
a person. The other 11 languages are **machine-assisted drafts**: Catalan, Valencian, Galician,
Basque, French, Dutch, Swedish, Finnish, Ukrainian, Romanian and Arabic. They can contain wrong,
unnatural or too long phrases. If you are a native speaker, your corrections are the most valuable
help this project can get, and you do not need to know how to code.

### How the language files work

There are two sets of files, one file per language in each:

| Folder | What it contains | Loaded |
|---|---|---|
| [`src/i18n/locales/`](src/i18n/locales/) | Every text of the interface: buttons, steps, messages | Bundled in the app |
| [`src/guide/locales/`](src/guide/locales/) | The card guide: what each element of the card is and how a copy can be misused | When the guide opens |

Each file is named by its [BCP 47 language tag](https://www.rfc-editor.org/info/bcp47), for example
`fr.json` or `ca-ES-valencia.json` (Valencian).

Each file is a flat JSON object of **keys** and **texts**:

```json
{
  "continue": "Continuar",
  "hiddenCount": "{hidden} de {total}"
}
```

- **The key** (left) is an identifier used by the code. Never change or translate it.
- **The text** (right) is what the user sees. Translate only this part.
- **Spanish (`es.json`) defines the keys.** Every other file must have exactly the same keys, no
  more and no less. A unit test checks this.
- **Placeholders** such as `{hidden}`, `{total}`, `{date}` or `{n}` are replaced by a value when
  the app runs. Keep each placeholder exactly as written, with the same name. You may move it inside
  the sentence to fit your grammar. A unit test checks that every language uses the same
  placeholders as Spanish.
- **No empty texts** in the interface files. If a key is missing at runtime, the app shows the
  Spanish text.
- Translate from Spanish (`es.json`). The English file (`en.json`) can help you understand a
  sentence, but Spanish is the reference.

Words you must **not** translate:

- **"DNI Tapado.es"** and **"NagWara"** are brand names. Keep them exactly as written, in Latin
  letters, in every language, including Arabic and Ukrainian.
- **Names of official documents and things printed on the card**, such as DNI, TIE, NIE, MRZ, CAN
  and PDF. Keep the abbreviation. You may add a short explanation in your language if the
  Spanish text has one.
- **Names of other products and services**, such as WhatsApp, iPhone or iOS.

Style:

- Address the user directly and informally, as the Spanish text does ("tú"), unless the informal
  form is unusual in your language for this kind of app.
- Use short, plain sentences. Many users read the app on a phone, in a hurry, while handling an
  identity document.
- Use the quotation marks of your language. Spanish uses «…»; English uses "…".
- Keep the same meaning. Do not add or remove information, especially in privacy and security
  texts.

### Fix a translation

You can do this entirely on the GitHub website.

1. **Find the text.** Open the app at <https://dnitapado.es>, choose your language in the selector
   at the top, and note the wrong text. Then open
   [`src/i18n/locales/`](src/i18n/locales/) and your language's file, and search for the text
   (press `Ctrl+F` or `Cmd+F`).
2. **Find the key.** The key is the word on the left of that line, for example `"continue"`.
   Open [`es.json`](src/i18n/locales/es.json) and search for the same key to read the Spanish
   original.
3. **Edit the file.** On GitHub, click the pencil icon ("Edit this file"). GitHub creates a copy of
   the project (a fork) for you. Change only the text on the right, between the quotes.
   - Keep the quotes `"`, the colon `:` and the comma `,` at the end of the line.
   - To write a quotation mark `"` inside a text, write `\"`.
   - Keep all placeholders such as `{n}`.
4. **Propose the change.** Click "Commit changes", write a short message such as
   `fix(i18n): correct the Swedish text of the export button`, and then click "Create pull
   request". In the description, say which texts you changed and why, and that you are a native
   speaker if you are.
5. **Wait for the checks.** CI runs the tests. If a check fails, it is usually a missing comma, a
   changed key or a changed placeholder. The check log names the key.

If you prefer to work locally, edit the file, run `pnpm test tests/unit/i18n.test.ts`, check the
result in the browser ([Test a language locally](#test-a-language-locally)) and open a pull request.

If you only want to point out a problem, open a
[translation issue](https://github.com/aasanchez/dnilimpio.es/issues/new?template=translation.yml)
with the current text, your proposed text and where it appears.

The repository also has a [`crowdin.yml`](crowdin.yml) file for Crowdin, a translation platform.
It covers the interface files only, not the card guide. The app itself never contacts Crowdin.

### Translate the card guide

The card guide ([ADR 0014](docs/adr/0014-card-guide.md)) explains each element of the DNI and TIE
and cites the official source of each statement: the Spanish official gazette (BOE),
dnielectronico.es, EU regulations, ICAO Doc 9303 and others. The sources are listed in
[`src/guide/sources.ts`](src/guide/sources.ts) and in
[`docs/GUIDE-SOURCES.md`](docs/GUIDE-SOURCES.md).

The files in [`src/guide/locales/`](src/guide/locales/) follow the same rules as the interface
files, plus these:

- **Stay faithful to the source.** A guide text says what the cited official text says, nothing
  more. Do not add facts, examples, advice or warnings that are not in the Spanish text, even if
  you believe they are true. Do not soften or strengthen a statement. If the Spanish says "can",
  do not write "will".
- **Keep legal and technical terms precise.** Where your country uses an official translation of
  an EU regulation, use its terms. You can find the official text in every EU language on
  [EUR-Lex](https://eur-lex.europa.eu).
- **Keep empty texts empty.** An empty text (`""`) means that no official source was found. The
  guide then says so instead of guessing. Do not fill it in. A unit test checks that a text is
  empty in every language exactly when it is empty in Spanish.
- **Keys end in `_title`, `_what` or `_risk`.** `_title` is the element's name, `_what` says what it
  is, `_risk` says how a copy of it can be misused.
- **Do not translate source titles.** The guide shows the titles of the cited documents in their
  original language. They are in `sources.ts`, not in the locale files.
- If you think the Spanish text itself does not match its source, open an issue. Do not fix it only
  in your translation.

Check your changes with `pnpm test tests/unit/guide.test.ts`.

### Right-to-left languages (Arabic)

Arabic (`ar`) is written right to left. The app is Modern Standard Arabic. When the user chooses
Arabic, the app sets `<html lang="ar" dir="rtl">` and the whole layout mirrors.

When you translate into Arabic:

- **Write the text in normal reading order.** The browser lays it out right to left. Do not reverse
  words or add direction control characters.
- **Use Arabic punctuation** where it is normal: the Arabic comma `،` and question mark `؟`.
- **Brand names and abbreviations stay in Latin letters** inside the Arabic sentence, for example
  `لا يرسل DNI Tapado.es أي شيء`. The browser places them correctly.
- **Placeholders stay as they are**, such as `{n}`. The app inserts numbers with the formatting of
  the selected language.
- **Test long sentences** that mix Arabic, Latin words and numbers in the browser. If a part shows
  in the wrong order, describe it in the pull request or issue. Do not try to fix it with special
  characters.

When you change code, keep right-to-left layouts working:

- Use logical CSS classes, which follow the text direction: `ms-*`/`me-*`, `ps-*`/`pe-*`,
  `start-*`/`end-*` and `text-start`/`text-end`. Do not use `ml-*`, `mr-*`, `left-*`, `right-*`,
  `text-left` or `text-right` for layout that depends on the reading direction.
- Wrap text that must stay left to right, such as `1/2`, citations, URLs and code, in an element with
  `dir="ltr"` (or a `<bdi dir="ltr">`), as `SideBadge.svelte` and `CardGuide.svelte` do.
- Format numbers, dates and percentages with `Intl` and the current language, never by joining
  strings.
- Check the change with Arabic selected, at phone width.

The direction of each language is set by `dir()` in [`src/i18n/index.ts`](src/i18n/index.ts). Today
only Arabic is right to left.

### Test a language locally

1. Start the app with `pnpm dev` and open <http://localhost:5173>.
2. Choose the language in the selector at the top of the page (marked `◎`). The app first uses
   your browser's language. The choice is not saved, so a reload goes back to the browser's
   language.
3. To start directly in a language, change the preferred language of your browser, or start
   Chromium with a language, for example `chromium --lang=ar`.
4. Walk through every screen: start screen, photo capture, document choice, editor, review and
   export. Open the card guide from the start screen and from the ⓘ buttons in the editor. You can
   use the synthetic card images in [`tests/fixtures/`](tests/fixtures/) instead of a real document.
5. Check for:
   - texts that are cut off or overflow their button, especially at phone width (360 pixels wide;
     use the device mode of the browser's developer tools);
   - Spanish texts that appear in your language, which means a key is missing;
   - placeholders such as `{n}` that appear as written, which means a placeholder name is wrong;
   - for Arabic, text and layout that run right to left.
6. Run the language tests:

   ```bash
   pnpm test tests/unit/i18n.test.ts tests/unit/guide.test.ts
   ```

7. Before you open the pull request, run `pnpm verify`.

### Add a new language

Open a [translation issue](https://github.com/aasanchez/dnilimpio.es/issues/new?template=translation.yml)
first, so that we can agree on the language tag and avoid duplicate work. A new language must
translate both the interface and the card guide.

1. **Choose the tag.** Use the shortest
   [BCP 47](https://www.rfc-editor.org/info/bcp47) tag that identifies the language, for example
   `pt` for Portuguese or `de` for German. Use a region or variant only when needed, as in
   `ca-ES-valencia`.
2. **Create the interface file.** Copy [`src/i18n/locales/es.json`](src/i18n/locales/es.json) to
   `src/i18n/locales/<tag>.json` and translate every text.
3. **Create the guide file.** Copy [`src/guide/locales/es.json`](src/guide/locales/es.json) to
   `src/guide/locales/<tag>.json` and translate every text. Keep empty texts empty. The guide loads
   the file automatically.
4. **Register the language** in [`src/i18n/index.ts`](src/i18n/index.ts):
   - import the file: `import pt from './locales/pt.json'`;
   - add the tag to `LANGS`, in the order the selector should show it;
   - add the language's own name to `AUTONYMS`, for example `pt: 'Português'`;
   - add the import to `translations`;
   - if the language is written right to left, update `dir()`;
   - if browsers send an unusual tag for it, update `pickLang()`.
5. **Update the tests** in [`tests/unit/i18n.test.ts`](tests/unit/i18n.test.ts): add a
   `pickLang` case for the new tag, and update the right-to-left test if needed.
6. **Update Crowdin**: add the tag to `languages_mapping` in [`crowdin.yml`](crowdin.yml).
7. **Check the fonts.** The bundled fonts cover Latin scripts only. Other scripts (for example
   Cyrillic or Arabic) use the system's fonts. Do not load fonts from another server. If a
   language needs a bundled font, open an issue first.
8. **Update the README**: the language list and count in the
   [Languages section](README.md#languages) and the language row of the status table.
9. **Test** the language as described in [Test a language locally](#test-a-language-locally), and
   run `pnpm verify`.
10. **Open one pull request** for the new language. Say in the description whether the translation is
    by a native speaker or machine-assisted.

## Report a security problem

Do not open a public issue. Report it privately through
[GitHub security advisories](https://github.com/aasanchez/dnilimpio.es/security/advisories/new).

## Licence

By contributing, you agree that your contribution is published under the
[GNU Affero General Public License v3.0 or later](LICENSE), like the rest of the code. The NagWara
name and mark have their own terms; see the [README licence section](README.md#licence).
