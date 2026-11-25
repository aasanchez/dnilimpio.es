// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { configureFileInput } from '../../src/capture/input.ts'

/** Minimal stand-in for HTMLInputElement: the unit tests run in Node, without a DOM. */
function fakeInput (attrs: Record<string, string> = {}): HTMLInputElement & { attrs: Record<string, string> } {
  const fake = {
    type: 'text',
    accept: '',
    attrs: { ...attrs },
    setAttribute (name: string, value: string) { fake.attrs[name] = value },
    removeAttribute (name: string) { Reflect.deleteProperty(fake.attrs, name) },
    hasAttribute (name: string) { return name in fake.attrs },
  }
  return fake as unknown as HTMLInputElement & { attrs: Record<string, string> }
}

describe('configureFileInput', () => {
  it('makes an image file picker', () => {
    const input = fakeInput()
    configureFileInput(input)
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
  })

  it('does not force the camera, so the gallery stays available on mobile', () => {
    const input = fakeInput({ capture: 'environment' })
    configureFileInput(input)
    expect(input.hasAttribute('capture')).toBe(false)
  })
})
