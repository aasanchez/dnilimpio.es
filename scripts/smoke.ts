// SPDX-License-Identifier: AGPL-3.0-or-later
// Post-deploy smoke test: checks that the live site serves the build of the expected commit and that
// the files it serves match their SRI hashes. No browser and no dependencies, only Node's fetch.
//
//   node scripts/smoke.ts <site URL> <expected commit SHA>
//
// GitHub Pages can serve the previous build for a short time after a deploy, so the check retries
// for up to SMOKE_TIMEOUT_S seconds (default 300) before it fails.
import { createHash } from 'node:crypto'

const [siteArg = '', expectedSha = ''] = process.argv.slice(2)
if (siteArg === '' || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(expectedSha)) {
  console.error('Usage: node scripts/smoke.ts <site URL> <full commit SHA>')
  process.exit(2)
}
const site = new URL(siteArg.endsWith('/') ? siteArg : siteArg + '/')
const timeoutMs = Number(process.env['SMOKE_TIMEOUT_S'] ?? 300) * 1000
const delayMs = 15_000

async function get (url: URL): Promise<{ text: string, bytes: Buffer }> {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`${url.href}: HTTP ${String(res.status)}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  return { text: bytes.toString('utf8'), bytes }
}

/** Throws with a reason when the live site is not (yet) the expected build. */
async function check (): Promise<string> {
  // The query string bypasses the CDN's cached index.html. Asset names carry a content hash.
  const html = (await get(new URL(`?smoke=${String(Date.now())}`, site))).text
  if (!html.includes('http-equiv="Content-Security-Policy"')) throw new Error('index.html has no CSP meta tag')

  const tag = html.match(/<script type="module"[^>]*\bsrc="([^"]+)"[^>]*>/)?.[0]
  const src = tag?.match(/\bsrc="([^"]+)"/)?.[1]
  const integrity = tag?.match(/\bintegrity="(sha384-[^"]+)"/)?.[1]
  if (src === undefined || integrity === undefined) throw new Error('index.html has no entry module script with SRI')

  const entry = await get(new URL(src, site))
  const actual = `sha384-${createHash('sha384').update(entry.bytes).digest('base64')}`
  if (actual !== integrity) throw new Error(`${src}: SRI mismatch (served ${actual}, page expects ${integrity})`)
  if (!entry.text.includes(expectedSha)) throw new Error(`${src}: not built from ${expectedSha} (an older build is still served)`)
  return src
}

const start = Date.now()
for (;;) {
  try {
    const src = await check()
    console.log(`Smoke test passed: ${site.href} serves ${src}, built from ${expectedSha}, SRI matches.`)
    break
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    if (Date.now() - start + delayMs > timeoutMs) {
      console.log(`::error title=Smoke test::${reason}`)
      process.exit(1)
    }
    console.log(`Not yet: ${reason}. Retrying in ${String(delayMs / 1000)} s.`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
