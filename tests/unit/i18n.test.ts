// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { es } from '../../src/i18n/es.ts';
import { en } from '../../src/i18n/en.ts';
import { pickLang } from '../../src/i18n/index.ts';

describe('i18n', () => {
  it('has the same keys in es and en', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
  it('picks the first supported language and falls back to Spanish', () => {
    expect(pickLang(['fr-FR', 'en-GB', 'es'])).toBe('en');
    expect(pickLang(['es-ES'])).toBe('es');
    expect(pickLang(['de'])).toBe('es');
    expect(pickLang([])).toBe('es');
  });
});
