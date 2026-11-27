// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { FIRST_VERSION, highest, nextVersion, parseTag } from '../../scripts/release-version.ts'

describe('parseTag', () => {
  it('reads exactly vMAJOR.MINOR.PATCH', () => {
    expect(parseTag('v1.4.7')).toEqual([1, 4, 7])
    expect(parseTag('v0.0.0')).toEqual([0, 0, 0])
    expect(parseTag('v10.20.300')).toEqual([10, 20, 300])
  })
  it('ignores pre-releases, other names and leading zeros', () => {
    for (const bad of ['1.4.7', 'v1.4', 'v1.4.7-rc.1', 'v1.4.7+build', 'v01.4.7', 'v1.04.7', 'release-1', 'latest', '', 'v1.4.7.1', `v${'9'.repeat(20)}.0.0`]) {
      expect(parseTag(bad)).toBeUndefined()
    }
  })
})

describe('highest', () => {
  it('compares numerically, not as text', () => {
    expect(highest(['v1.9.0', 'v1.10.0', 'v1.2.30'])).toEqual([1, 10, 0])
    expect(highest(['v2.0.0', 'v1.99.99'])).toEqual([2, 0, 0])
  })
  it('is undefined without a version tag', () => {
    expect(highest([])).toBeUndefined()
    expect(highest(['latest', 'v1.0.0-beta'])).toBeUndefined()
  })
})

describe('nextVersion', () => {
  it('starts at 1.0.0 when no version tag exists', () => {
    expect(FIRST_VERSION).toBe('1.0.0')
    expect(nextVersion([], [])).toBe('1.0.0')
    expect(nextVersion(['old-name'], [])).toBe('1.0.0')
  })
  it('raises the patch of the highest reachable tag', () => {
    expect(nextVersion(['v1.4.6', 'v1.4.7'], [])).toBe('1.4.8')
    expect(nextVersion(['v1.4.7', 'v1.10.2', 'v1.9.9'], [])).toBe('1.10.3')
  })
  it('starts the patch count again from a major or minor tag set by hand', () => {
    expect(nextVersion(['v1.4.7', 'v1.5.0'], [])).toBe('1.5.1')
    expect(nextVersion(['v1.4.7', 'v2.0.0'], [])).toBe('2.0.1')
  })
  it('keeps the tag already on the commit: a re-run, or a version set by hand on that commit', () => {
    expect(nextVersion(['v1.4.7', 'v1.4.8'], ['v1.4.8'])).toBe('1.4.8')
    expect(nextVersion(['v1.4.7', 'v1.4.8', 'v1.5.0'], ['v1.4.8', 'v1.5.0'])).toBe('1.5.0')
  })
  it('raises the patch when the tag on the commit is not the highest', () => {
    expect(nextVersion(['v1.4.7', 'v2.0.0'], ['v1.4.7'])).toBe('2.0.1')
  })
})
