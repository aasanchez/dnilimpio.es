// SPDX-License-Identifier: AGPL-3.0-or-later
// Plain string dictionary (spec §4.11). Spanish is the reference; English must have the same keys (enforced by the type).
import { es } from './es.ts';
import { en } from './en.ts';

export type Key = keyof typeof es;
export type Dictionary = Record<Key, string>;
export type Lang = 'es' | 'en';

const dictionaries: Record<Lang, Dictionary> = { es, en };

export function pickLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'es' || base === 'en') return base;
  }
  return 'es';
}

export function t(lang: Lang, key: Key): string {
  return dictionaries[lang][key];
}
