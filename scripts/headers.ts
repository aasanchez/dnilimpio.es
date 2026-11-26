// SPDX-License-Identifier: AGPL-3.0-or-later
// HTTP security headers sent by the host (ADR 0027). Cloudflare Workers reads them from a `_headers`
// file next to the site's files. On a host that sends no headers (a fork, a local copy) the <meta>
// CSP and the service worker's PAGE_HEADERS remain the only policy (fallback).
//
//   node scripts/headers.ts <dist dir>    writes <dist dir>/_headers for the build in that folder
//
// The file is written at deploy time only, not by `pnpm build`: the tested, attested `dist` artifact
// stays exactly the files that are served, and `_headers` is never itself a page of the site.
// The page CSP comes from scripts/csp.ts plus the hash of the build's import map, so it always equals
// the <meta> CSP of that build, with frame-ancestors added (a <meta> CSP ignores frame-ancestors).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cspWithScriptHashes } from './csp.ts'
import { SECURITY_HEADERS, SW_FILE, WORKER_SCRIPTS } from '../src/offline/precache.ts'

/** One rule of the `_headers` file: a path, headers it removes (set by an earlier rule), headers it adds. */
export interface HeaderRule {
  readonly path: string
  readonly detach?: readonly string[]
  readonly headers: Readonly<Record<string, string>>
}

/** The file the host reads its headers from. */
export const HEADERS_FILE = '_headers'

/** Sent with every file: HSTS and the security headers the service worker also sets (SECURITY_HEADERS). */
export const COMMON_HEADERS: Readonly<Record<string, string>> = {
  // One year, also for subdomains. No `preload`: getting off the browsers' preload list takes months.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  ...SECURITY_HEADERS,
}

/**
 * CSP of the OCR worker script, sent by the host. A worker takes its policy from its own script's
 * response, not from the page. `'self'` instead of the ocr/ folder: the host serves the same files at
 * more than one address (dnitapado.es, www, a local preview), and this origin serves only this build.
 * The service worker still replaces it with the narrower workerCsp() (ocr/ only) once it controls
 * the page.
 */
export const HOST_WORKER_CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
].join('; ')

/**
 * CSP of the service worker script. It downloads only this build's files from its own origin and
 * loads no script.
 */
export const SERVICE_WORKER_CSP = [
  "default-src 'none'",
  "connect-src 'self'",
].join('; ')

/** The inline import map of a built index.html, or undefined when the build has none. */
export function importMapOf (html: string): string | undefined {
  return html.match(/<script type="importmap">([^<]*)<\/script>/)?.[1]
}

/** The page CSP of this build: the <meta> policy of scripts/csp.ts, plus frame-ancestors. */
export function pageCsp (indexHtml: string): string {
  const map = importMapOf(indexHtml)
  const hashes = map === undefined ? [] : [`sha256-${createHash('sha256').update(map).digest('base64')}`]
  return `${cspWithScriptHashes(hashes)}; frame-ancestors 'none'`
}

/**
 * Rules for the host, from the built index.html. Paths are from the root of the host.
 * The page CSP goes on every response: the host answers unknown paths with index.html too (see
 * wrangler.jsonc), and on a script, style or image response a CSP has no effect. The two scripts
 * that run as workers take their policy from their own response, so they get their own CSP instead.
 */
export function hostHeaderRules (indexHtml: string): HeaderRule[] {
  const own = (path: string, csp: string): HeaderRule => ({ path: `/${path}`, detach: ['Content-Security-Policy'], headers: { 'Content-Security-Policy': csp } })
  return [
    { path: '/*', headers: { ...COMMON_HEADERS, 'Content-Security-Policy': pageCsp(indexHtml) } },
    own(SW_FILE, SERVICE_WORKER_CSP),
    ...WORKER_SCRIPTS.map((w) => own(w, HOST_WORKER_CSP)),
  ]
}

/** The `_headers` file: a path, then `! Name` lines that remove headers, then headers, indented. */
export function renderHeadersFile (rules: readonly HeaderRule[]): string {
  const blocks = rules.map((r) => [
    r.path,
    ...(r.detach ?? []).map((k) => `  ! ${k}`),
    ...Object.entries(r.headers).map(([k, v]) => `  ${k}: ${v}`),
  ].join('\n'))
  return `# Written by scripts/headers.ts at deploy time. Do not edit.\n${blocks.join('\n')}\n`
}

/** Whether a rule path matches a request path: exact, or a prefix ending in `*`. */
function matches (rule: string, path: string): boolean {
  return rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : rule === path
}

/**
 * The headers the host sends for one path (lower-case names), as the rules say: every matching rule in
 * order; a header set twice is joined with a comma; `!` removes what an earlier rule set.
 */
export function headersFor (rules: readonly HeaderRule[], path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rules) {
    if (!matches(r.path, path)) continue
    for (const k of r.detach ?? []) Reflect.deleteProperty(out, k.toLowerCase())
    for (const [k, v] of Object.entries(r.headers)) {
      const name = k.toLowerCase()
      out[name] = out[name] === undefined ? v : `${out[name]}, ${v}`
    }
  }
  return out
}

/**
 * The names of the cookies a response sets. The site promises no cookies, and a host feature (a bot
 * check, a load balancer) could add one without any change in this repository.
 */
export function cookiesSetBy (headers: Headers): string[] {
  return headers.getSetCookie().map((c) => c.split('=')[0]?.trim() ?? '')
}

if (import.meta.main) {
  const dist = process.argv[2]
  if (dist === undefined) {
    console.error('Usage: node scripts/headers.ts <dist dir>')
    process.exit(2)
  }
  const rules = hostHeaderRules(readFileSync(join(dist, 'index.html'), 'utf8'))
  writeFileSync(join(dist, HEADERS_FILE), renderHeadersFile(rules))
  console.log(`Wrote ${join(dist, HEADERS_FILE)} (${String(rules.length)} rules).`)
}
