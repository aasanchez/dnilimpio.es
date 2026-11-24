// SPDX-License-Identifier: AGPL-3.0-or-later
import { pickLang, t } from './i18n/index.ts';

// DOM is built with createElement/textContent only: no innerHTML, so Trusted Types needs no policy.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(root: HTMLElement): void {
  const lang = pickLang(navigator.languages);
  document.documentElement.lang = lang;
  document.title = t(lang, 'appTitle');
  const footer = el('footer');
  const link = el('a', t(lang, 'sourceCode'));
  link.href = __REPO_URL__;
  link.rel = 'noopener noreferrer';
  footer.append(link);
  root.replaceChildren(el('h1', t(lang, 'appTitle')), el('p', t(lang, 'tagline')), footer);
}

const root = document.getElementById('app');
if (root) render(root);
