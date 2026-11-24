// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MAX_BYTES, firstImageFile, isHeic, precheck } from '../../src/capture/decode.ts';

describe('precheck', () => {
  it('accepts JPEG, PNG and HEIC', () => {
    expect(precheck({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(precheck({ type: 'image/png', size: 1000 })).toBeNull();
    expect(precheck({ type: 'image/heic', size: 1000 })).toBeNull();
  });
  it('accepts HEIC with an empty MIME type by extension', () => {
    expect(precheck({ type: '', size: 1000 }, 'IMG_0001.HEIC')).toBeNull();
  });
  it('rejects non-images', () => {
    expect(precheck({ type: 'application/pdf', size: 1000 })).toEqual({ kind: 'not-an-image', type: 'application/pdf' });
    expect(precheck({ type: '', size: 1000 }, 'notes.txt')).toEqual({ kind: 'not-an-image', type: '' });
  });
  it('rejects files over the size limit', () => {
    expect(precheck({ type: 'image/jpeg', size: MAX_BYTES + 1 })).toEqual({ kind: 'too-large', bytes: MAX_BYTES + 1 });
  });
});

describe('isHeic / firstImageFile', () => {
  it('detects HEIC by type or name', () => {
    expect(isHeic({ type: 'image/HEIF' })).toBe(true);
    expect(isHeic({ type: '' }, 'a.heic')).toBe(true);
    expect(isHeic({ type: 'image/png' }, 'a.png')).toBe(false);
  });
  it('picks the first image file', () => {
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
    const png = new File(['x'], 'b.png', { type: 'image/png' });
    expect(firstImageFile([txt, png])).toBe(png);
    expect(firstImageFile([txt])).toBeNull();
  });
});
