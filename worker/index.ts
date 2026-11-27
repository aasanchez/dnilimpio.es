// SPDX-License-Identifier: AGPL-3.0-or-later
// The Cloudflare Worker of dnitapado.es (ADR 0029). It runs for one path only, POST /stats
// (`run_worker_first` in wrangler.jsonc); every other request goes straight to the static files and
// runs no code. The checks are in src/stats/endpoint.ts. A Worker module may export only handlers.

import { STATS_PATH, handleStats, type Env } from '../src/stats/endpoint.ts'

export default {
  async fetch (req: Request, env: Env): Promise<Response> {
    if (new URL(req.url).pathname === STATS_PATH) return await handleStats(req, env)
    // Not reached with run_worker_first limited to /stats; kept so a config change fails safe.
    return env.ASSETS ? await env.ASSETS.fetch(req) : new Response(null, { status: 404 })
  },
}
