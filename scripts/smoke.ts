// SPDX-License-Identifier: AGPL-3.0-or-later
// Post-deploy smoke test: checks that the live site serves exactly the build of the expected commit.
// No browser and no dependencies, only Node's fetch.
//
//   node scripts/smoke.ts <site URL> <expected commit SHA> [<dist dir>]
//
// With SMOKE_HOST_HEADERS=1 (the Cloudflare host, ADR 0025) it also checks that the page, the service
// worker and the OCR worker are served with exactly the HTTP headers of scripts/headers.ts.
//
// It checks, on the live site:
// - index.html carries exactly the CSP of scripts/csp.ts (with the hash of its own import map) and
//   the no-referrer policy;
// - the entry script matches its SRI hash and was built from the expected commit;
// - every file in the service worker's manifest (the whole app, OCR and the corner model) matches its
//   SHA-384, so the site is one consistent build;
// - with <dist dir> (the artifact CI built and deployed): every file of that build, sw.js included,
//   is served byte for byte. A host that changed any file, even together with its
//   hashes, fails here.
//
// GitHub Pages can serve the previous build for a short time after a deploy, so the check retries
// for up to SMOKE_TIMEOUT_S seconds (default 300) before it fails.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cspWithScriptHashes } from './csp.ts'
import { HEADERS_FILE, headersFor, hostHeaderRules } from './headers.ts'
import { SW_FILE, WORKER_SCRIPTS, parseManifest } from '../src/offline/precache.ts'

const [siteArg = '', expectedSha = '', distDir] = process.argv.slice(2)
if (siteArg === '' || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(expectedSha)) {
  console.error('Usage: node scripts/smoke.ts <site URL> <full commit SHA> [<dist dir>]')
  process.exit(2)
}
const site = new URL(siteArg.endsWith('/') ? siteArg : siteArg + '/')
const timeoutMs = Number(process.env['SMOKE_TIMEOUT_S'] ?? 300) * 1000
const delayMs = 15_000

const sha384 = (bytes: Buffer): string => `sha384-${createHash('sha384').update(bytes).digest('base64')}`

const checkHostHeaders = process.env['SMOKE_HOST_HEADERS'] === '1'

async function get (url: URL): Promise<{ text: string, bytes: Buffer, headers: Headers }> {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`${url.href}: HTTP ${String(res.status)}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  return { text: bytes.toString('utf8'), bytes, headers: res.headers }
}

/** Every header of scripts/headers.ts must be served with exactly its value. Others are ignored. */
async function checkServedHeaders (html: string, first: Headers): Promise<void> {
  const rules = hostHeaderRules(html)
  const pages: Array<[string, Headers]> = [['/', first]]
  for (const p of [SW_FILE, ...WORKER_SCRIPTS]) pages.push([`/${p}`, (await get(fresh(p))).headers])
  const wrong: string[] = []
  for (const [path, served] of pages) {
    for (const [k, v] of Object.entries(headersFor(rules, path))) {
      if (served.get(k) !== v) wrong.push(`${path} ${k}:\n    served:   ${served.get(k) ?? '(none)'}\n    expected: ${v}`)
    }
  }
  if (wrong.length > 0) throw new Error(`host headers differ from scripts/headers.ts:\n  ${wrong.join('\n  ')}`)
}

/** The query string bypasses the CDN's cached copy of files whose names carry no content hash. */
const fresh = (path: string): URL => new URL(`${path}?smoke=${String(Date.now())}`, site)

/** Runs `fn` on every item, a few at a time. Returns the error messages. */
async function each<T> (items: readonly T[], fn: (item: T) => Promise<void>, width = 8): Promise<string[]> {
  const errors: string[] = []
  let next = 0
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) {
      const item = items[next++] as T
      try { await fn(item) } catch (e) { errors.push(e instanceof Error ? e.message : String(e)) }
    }
  }))
  return errors
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
function listFiles (dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(dir, `${prefix}${e.name}/`) : [`${prefix}${e.name}`]))
}

function checkHeadPolicies (html: string): void {
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1]?.replaceAll('&#39;', "'")
  if (csp === undefined) throw new Error('index.html has no CSP meta tag')
  const importMap = html.match(/<script type="importmap">([^<]*)<\/script>/)?.[1]
  const expected = cspWithScriptHashes(importMap === undefined ? [] : [`sha256-${createHash('sha256').update(importMap).digest('base64')}`])
  if (csp !== expected) throw new Error(`index.html CSP differs from scripts/csp.ts:\n  served:   ${csp}\n  expected: ${expected}`)
  if (!html.includes('<meta name="referrer" content="no-referrer" />')) throw new Error('index.html has no no-referrer policy')
}

/** Throws with a reason when the live site is not (yet) exactly the expected build. */
async function check (): Promise<string> {
  const html = await get(fresh(''))
  checkHeadPolicies(html.text)
  if (checkHostHeaders) await checkServedHeaders(html.text, html.headers)

  const tag = html.text.match(/<script type="module"[^>]*\bsrc="([^"]+)"[^>]*>/)?.[0]
  const src = tag?.match(/\bsrc="([^"]+)"/)?.[1]
  const integrity = tag?.match(/\bintegrity="(sha384-[^"]+)"/)?.[1]
  if (src === undefined || integrity === undefined) throw new Error('index.html has no entry module script with SRI')
  const entry = await get(new URL(src, site))
  if (sha384(entry.bytes) !== integrity) throw new Error(`${src}: SRI mismatch (served ${sha384(entry.bytes)}, page expects ${integrity})`)
  if (!entry.text.includes(expectedSha)) throw new Error(`${src}: not built from ${expectedSha} (an older build is still served)`)

  // The service worker's manifest lists every file of the build with its hash.
  const sw = (await get(fresh(SW_FILE))).text
  const literal = sw.match(/"(\{\\"version\\":(?:[^"\\]|\\.)*)"/)?.[1]
  if (literal === undefined) throw new Error(`${SW_FILE} has no precache manifest`)
  const manifest = parseManifest(JSON.parse(`"${literal}"`) as string)
  const listed = [...manifest.files, ...manifest.onDemand]
  const bad = await each(listed, async (f) => {
    const served = f.path === 'index.html' ? html.bytes : (await get(new URL(f.path, site))).bytes
    if (sha384(served) !== f.integrity) throw new Error(`${f.path}: does not match the ${SW_FILE} manifest`)
  })
  if (bad.length > 0) throw new Error(`${String(bad.length)} file(s) differ from the manifest:\n  ${bad.join('\n  ')}`)

  // Byte for byte against the artifact CI built.
  if (distDir !== undefined) {
    // `_headers` is read by the host, never served (scripts/headers.ts).
    const paths = listFiles(distDir).filter((p) => !p.startsWith('.') && p !== HEADERS_FILE)
    const diff = await each(paths, async (p) => {
      const served = p === 'index.html' ? html.bytes : (await get(p === SW_FILE ? fresh(p) : new URL(p, site))).bytes
      if (sha384(served) !== sha384(readFileSync(join(distDir, p)))) throw new Error(`${p}: differs from the CI build`)
    })
    if (diff.length > 0) throw new Error(`${String(diff.length)} file(s) differ from the CI build:\n  ${diff.join('\n  ')}`)
    return `${src}; ${String(listed.length)} files match the manifest; ${String(paths.length)} files match the CI build`
  }
  return `${src}; ${String(listed.length)} files match the manifest`
}

const start = Date.now()
for (;;) {
  try {
    const what = await check()
    console.log(`Smoke test passed: ${site.href} serves the build of ${expectedSha} (${what}). CSP and referrer policy are exact${checkHostHeaders ? '; host headers are exact' : ''}.`)
    break
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    if (Date.now() - start + delayMs > timeoutMs) {
      console.log(`::error title=Smoke test::${reason.replaceAll('\n', '%0A')}`)
      process.exit(1)
    }
    console.log(`Not yet: ${reason}. Retrying in ${String(delayMs / 1000)} s.`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
