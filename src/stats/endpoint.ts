// SPDX-License-Identifier: AGPL-3.0-or-later
// The stats endpoint of the Cloudflare Worker (worker/index.ts, ADR 0029). Plain code with no
// Worker globals, so unit tests and `vite preview` run the same checks as the host.
// It accepts the opt-in usage stats of the thanks page in their one fixed shape (src/stats/schema.ts),
// writes one row to Workers Analytics Engine and answers 204. It stores no IP address, sets no cookie
// and keeps no log of the request. Anything else gets an error and is not stored.

import { FIELDS, MAX_STATS_LENGTH, STATS_VERSION, parseStats, type UsageStats } from './schema.ts'

/** The part of the Workers Analytics Engine binding used here. */
export interface AnalyticsDataset {
  writeDataPoint: (point: { indexes?: string[], blobs?: string[], doubles?: number[] }) => void
}

export interface Env {
  /** Workers Analytics Engine dataset (wrangler.jsonc, analytics_engine_datasets). */
  readonly STATS?: AnalyticsDataset
  /** The static files (wrangler.jsonc, assets.binding). */
  readonly ASSETS?: { fetch: (req: Request) => Promise<Response> }
}

export const STATS_PATH = '/stats'

/**
 * One row. blobs: text columns, doubles: number columns, in a fixed order that SQL queries rely on
 * (README, "Usage stats"). Append only. The country is Cloudflare's own lookup of the request; the
 * IP address it comes from is not written.
 */
export function dataPoint (s: UsageStats, country: string): { indexes: string[], blobs: string[], doubles: number[] } {
  const n = (b: boolean): number => (b ? 1 : 0)
  return {
    indexes: [s.doc],
    blobs: [String(STATS_VERSION), s.doc, s.ai, s.lang, s.app, s.src, s.device, s.os, s.browser, country, s.fields.join(',')],
    doubles: [n(s.back), s.boxes, n(s.mark), n(s.grey), n(s.ocr), s.bv, n(s.pwa), s.fields.length, ...FIELDS.map((f) => n(s.fields.includes(f)))],
  }
}

const reply = (status: number): Response => new Response(null, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})

/** A two-letter country code from Cloudflare, or XX. */
function countryOf (req: Request): string {
  const c = (req as Request & { cf?: { country?: unknown } }).cf?.country
  return typeof c === 'string' && /^[A-Z]{2}$/.test(c) ? c : 'XX'
}

export async function handleStats (req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return reply(405)
  // Only the site's own thanks page: browsers mark a request from another site, and a form or a link
  // from elsewhere cannot set this header to same-origin.
  if (req.headers.get('Sec-Fetch-Site') !== 'same-origin') return reply(403)
  if (Number(req.headers.get('Content-Length') ?? '0') > MAX_STATS_LENGTH) return reply(413)
  const text = await req.text()
  if (text.length > MAX_STATS_LENGTH) return reply(413)
  const stats = parseStats(text)
  if (stats === undefined) return reply(400)
  // No dataset (a local run without the binding): accepted, not stored.
  env.STATS?.writeDataPoint(dataPoint(stats, countryOf(req)))
  return reply(204)
}
