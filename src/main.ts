// SPDX-License-Identifier: AGPL-3.0-or-later
import { AUTONYMS, LANGS, isLang, pickLang, t, type Lang } from './i18n/index.ts';
import { el } from './ui/dom.ts';
import { renderCapture, type CaptureState } from './ui/capture-screen.ts';

const state: CaptureState = { front: null, back: null };
// The language choice lives in memory only (§2.2): it resets to the browser's language on reload.
let lang: Lang = pickLang(navigator.languages);
let controller = new AbortController();

function languageSelector(onChange: (l: Lang) => void): HTMLElement {
  const select = el('select', { id: 'lang' });
  for (const l of LANGS) {
    const option = el('option', { text: AUTONYMS[l] });
    option.value = l;
    option.lang = l;
    option.selected = l === lang;
    select.append(option);
  }
  select.addEventListener('change', () => { if (isLang(select.value)) onChange(select.value); }, { signal: controller.signal });
  const label = el('label', { text: t(lang, 'language') });
  label.htmlFor = select.id;
  return el('div', { className: 'lang' }, label, select);
}

function render(root: HTMLElement): void {
  controller.abort(); // drop listeners from the previous render
  controller = new AbortController();
  document.documentElement.lang = lang;
  document.title = t(lang, 'appTitle');
  const link = el('a', { text: t(lang, 'sourceCode') });
  link.href = __REPO_URL__;
  link.rel = 'noopener noreferrer';
  root.replaceChildren(
    languageSelector((l) => {
      lang = l;
      render(root);
      document.getElementById('lang')?.focus();
    }),
    el('h1', { text: t(lang, 'appTitle') }),
    el('p', { text: t(lang, 'tagline') }),
    renderCapture(lang, state, () => undefined, controller.signal),
    el('footer', {}, link),
  );
}

const root = document.getElementById('app');
if (root) render(root);
