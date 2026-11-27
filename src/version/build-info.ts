// SPDX-License-Identifier: AGPL-3.0-or-later
// The version this page runs: its release version (ADR 0032), the commit it was built from and when it
// was built. All are fixed at build time (vite.config.ts), inside the page's own code, so the footer shows the build that is
// actually running, online or offline. After a service worker update, the new build's code brings
// its own values. Nothing is fetched.

/** Characters of the commit SHA shown, as on GitHub. */
export const SHORT_SHA_LENGTH = 7

/** Accepts a full 40 (SHA-1) or 64 (SHA-256) hex digit commit hash; anything else becomes ''. */
export function normalizeSha (raw: string | undefined): string {
  const sha = (raw ?? '').trim().toLowerCase()
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha) ? sha : ''
}

export const shortSha = (sha: string): string => sha.slice(0, SHORT_SHA_LENGTH)

/** Link to the commit on GitHub, or undefined when the commit is unknown. */
export function commitUrl (repo: string, sha: string): string | undefined {
  return sha === '' ? undefined : `${repo.replace(/\/+$/, '')}/commit/${sha}`
}

/** Accepts a release version MAJOR.MINOR.PATCH (no "v", no pre-release); anything else becomes ''. */
export function normalizeVersion (raw: string | undefined): string {
  const version = (raw ?? '').trim()
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version) ? version : ''
}

/** Link to the version's GitHub Release (tag vMAJOR.MINOR.PATCH), or undefined when there is none. */
export function releaseUrl (repo: string, version: string): string | undefined {
  return version === '' ? undefined : `${repo.replace(/\/+$/, '')}/releases/tag/v${version}`
}

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/**
 * `then` relative to `now` in the given language ("hace 5 minutos", "5 minutes ago"). Picks the
 * largest whole unit; under a minute it says "now". A build time slightly in the future (device clock
 * behind) also says "now", so the text never claims a deployment that has not happened.
 */
export function relativeTime (locale: string, then: number, now: number): string {
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  for (const [unit, size] of UNITS) {
    if (unit === 'second') break
    if (seconds >= size) return fmt.format(-Math.floor(seconds / size), unit)
  }
  return fmt.format(0, 'second')
}
