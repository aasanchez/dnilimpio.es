// SPDX-License-Identifier: AGPL-3.0-or-later
// The version of the build of the current commit (ADR 0032), from the git tags:
//
//   node scripts/release-version.ts          # prints version=1.4.8 and tag=v1.4.8, for $GITHUB_OUTPUT
//
// - The base is the highest version tag (vMAJOR.MINOR.PATCH) reachable from HEAD, so only tags of
//   commits already in this history count.
// - When HEAD carries that tag itself, the version is that tag: a manual run on a commit that is
//   already released, or a commit Alexis tagged by hand (for example v1.5.0) and then ran CI on.
// - Otherwise the patch goes up by one: v1.4.7 becomes v1.4.8.
// - With no version tag at all, the first version is v1.0.0.
// Major and minor are set by hand only, by pushing a tag such as v2.0.0. CI creates the tag of each
// patch version, after the deploy succeeded (`release` job in .github/workflows/ci.yml).
// Tags that do not match exactly vMAJOR.MINOR.PATCH (pre-releases, other names) are ignored.
import { execFileSync } from 'node:child_process'

export const FIRST_VERSION = '1.0.0'

const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

type Triple = readonly [number, number, number]

/** The numbers of a version tag, or undefined when the tag is not exactly vMAJOR.MINOR.PATCH. */
export function parseTag (tag: string): Triple | undefined {
  const m = TAG.exec(tag.trim())
  if (m === null) return undefined
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])] as const
  return parts.every(Number.isSafeInteger) ? parts : undefined
}

const compare = (a: Triple, b: Triple): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
const format = (v: Triple): string => `${String(v[0])}.${String(v[1])}.${String(v[2])}`

/** The highest version among the tags, or undefined when none is a version tag. */
export function highest (tags: readonly string[]): Triple | undefined {
  let best: Triple | undefined
  for (const tag of tags) {
    const v = parseTag(tag)
    if (v !== undefined && (best === undefined || compare(v, best) > 0)) best = v
  }
  return best
}

/**
 * The version of HEAD, without the leading "v".
 * @param reachable tags of HEAD and of its ancestors (`git tag --merged HEAD`)
 * @param atHead tags that point at HEAD itself (`git tag --points-at HEAD`)
 */
export function nextVersion (reachable: readonly string[], atHead: readonly string[]): string {
  const base = highest(reachable)
  if (base === undefined) return FIRST_VERSION
  const own = highest(atHead)
  if (own !== undefined && compare(own, base) === 0) return format(base)
  return format([base[0], base[1], base[2] + 1])
}

function gitTags (...args: string[]): string[] {
  return execFileSync('git', ['tag', ...args], { encoding: 'utf8' }).split('\n').filter((t) => t !== '')
}

function main (): void {
  const version = nextVersion(gitTags('--merged', 'HEAD'), gitTags('--points-at', 'HEAD'))
  console.log(`version=${version}`)
  console.log(`tag=v${version}`)
}

if (import.meta.main) main()
