// SPDX-License-Identifier: AGPL-3.0-or-later
import { pickLang, t } from './i18n/index.ts';
import { el } from './ui/dom.ts';
import { renderCapture, type CaptureState } from './ui/capture-screen.ts';

const state: CaptureState = { front: null, back: null };
const controller = new AbortController();

function render(root: HTMLElement): void {
  const lang = pickLang(navigator.languages);
  document.documentElement.lang = lang;
  document.title = t(lang, 'appTitle');
  const link = el('a', { text: t(lang, 'sourceCode') });
  link.href = __REPO_URL__;
  link.rel = 'noopener noreferrer';
  root.replaceChildren(
    el('h1', { text: t(lang, 'appTitle') }),
    el('p', { text: t(lang, 'tagline') }),
    renderCapture(lang, state, () => undefined, controller.signal),
    el('footer', {}, link),
  );
}

const root = document.getElementById('app');
if (root) render(root);
