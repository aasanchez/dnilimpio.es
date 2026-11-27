// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in usage stats (ADR 0029): the fixed list, the device classes, the Worker and the one route
// the service worker opens for them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIELDS, LANG_TAGS, MAX_MOVED, MAX_STATS_LENGTH, MOVED_STEPS, encodeSession, encodeStats, parseSession, parseStats, type SessionStats, type UsageStats } from '../../src/stats/schema.ts'
import { browserOf, deviceOf, deviceStats, systemOf } from '../../src/stats/device.ts'
import { aiResult, movedBoxes, photoSource, sessionStats, type SessionInput } from '../../src/stats/session.ts'
import { documentOf } from '../../src/zones/documents.ts'
import { zoneKey } from '../../src/engine/fields.ts'
import { THANKS_URL, thanksHref } from '../../src/stats/thanks-link.ts'
import { STATS_URL } from '../../src/stats/send.ts'
import { readFragment } from '../../src/thanks/fragment.ts'
import { thanksText } from '../../src/thanks/strings.ts'
import { LANGS, loadLang, t } from '../../src/i18n/index.ts'
import { STATS_ENDPOINT, THANKS_PAGE, route } from '../../src/offline/precache.ts'
import worker from '../../worker/index.ts'
import { RATE_LIMIT_KEY, dataPoint, handleStats, type AnalyticsDataset, type RateLimit } from '../../src/stats/endpoint.ts'
import { clearOcrRan, markOcrRan, ocrRan } from '../../src/ocr/ran.ts'

const SESSION: SessionStats = { doc: 'tie', ai: 'right', back: true, fields: ['signature', 'can', 'mrz'], boxes: 2, mark: true, grey: false, lang: 'es', app: '1a2b3c4', src: 'camera', ocr: true, moved: [{ field: 'can', rect: 0, x: 124, y: 142, w: 60, h: 18 }] }
const FULL: UsageStats = { ...SESSION, device: 'phone', os: 'android', browser: 'chrome', bv: 131, pwa: false }
const TEXT = encodeStats(FULL)
const NO_MOVES: Pick<SessionInput, 'zones' | 'placement' | 'handPlaced'> = { zones: documentOf('tie'), placement: {}, handPlaced: [] }

describe('stats text', () => {
  it('has fixed keys in a fixed order, readable as it is shown on the thanks page', () => {
    expect(TEXT).toBe('v=2&doc=tie&ai=right&back=1&fields=signature,can,mrz&boxes=2&mark=1&grey=0&lang=es&app=1a2b3c4&src=camera&ocr=1&moved=can-0-124-142-60-18&device=phone&os=android&browser=chrome&bv=131&pwa=0')
    expect(parseStats(TEXT)).toEqual(FULL)
    expect(parseSession(encodeSession(SESSION))).toEqual(SESSION)
  })
  it('lists the fields in one fixed order, whatever order they were chosen in', () => {
    expect(encodeSession({ ...SESSION, fields: ['mrz', 'signature'] })).toContain('fields=signature,mrz&')
    expect(parseSession(encodeSession({ ...SESSION, fields: [], moved: [] }))?.fields).toEqual([])
  })
  it('lists moved boxes of covered fields only, each once, in field order then box number', () => {
    const moved = [
      { field: 'mrz', rect: 0, x: 1, y: 2, w: 3, h: 4 },
      { field: 'can', rect: 1, x: 5, y: 6, w: 7, h: 8 },
      { field: 'can', rect: 0, x: 9, y: 10, w: 11, h: 12 },
      { field: 'can', rect: 0, x: 0, y: 0, w: 0, h: 0 },
      { field: 'address', rect: 0, x: 1, y: 1, w: 1, h: 1 },
    ] as const
    const text = encodeSession({ ...SESSION, moved })
    expect(text).toContain('&moved=can-0-9-10-11-12,can-1-5-6-7-8,mrz-0-1-2-3-4')
    expect(parseSession(text)?.moved).toHaveLength(3)
    expect(encodeSession({ ...SESSION, moved: [] })).toMatch(/&moved=$/)
  })
  it('fits the most boxes a row can list within the length limit', () => {
    const moved = Array.from({ length: MAX_MOVED }, (_, i) => ({ field: FIELDS[i % FIELDS.length] ?? 'can', rect: Math.floor(i / FIELDS.length), x: MOVED_STEPS, y: MOVED_STEPS, w: MOVED_STEPS, h: MOVED_STEPS }))
    const full = encodeStats({ ...FULL, fields: [...FIELDS], moved })
    expect(full.length).toBeLessThanOrEqual(MAX_STATS_LENGTH)
    expect(parseStats(full)?.moved).toHaveLength(MAX_MOVED)
  })
  it('knows every field id and every language of the app', () => {
    expect([...LANG_TAGS].sort()).toEqual([...LANGS].sort())
    expect(new Set(FIELDS).size).toBe(FIELDS.length)
  })
  it.each([
    ['an unknown key', `${TEXT}&name=Ana`],
    ['a repeated key', `${TEXT}&doc=tie`],
    ['a missing key', TEXT.replace('&pwa=0', '')],
    ['an unknown document', TEXT.replace('doc=tie', 'doc=passport')],
    ['an unknown field', TEXT.replace('mrz', 'name')],
    ['a field twice', TEXT.replace('can,mrz', 'can,can')],
    ['fields out of order', TEXT.replace('signature,can,mrz', 'mrz,can,signature')],
    ['text in a value', TEXT.replace('app=1a2b3c4', 'app=12345678X')],
    ['an image in a value', TEXT.replace('src=camera', 'src=data:image/png;base64,iVBORw0KGgo')],
    ['a number out of range', TEXT.replace('boxes=2', 'boxes=51')],
    ['a padded number', TEXT.replace('bv=131', 'bv=0131')],
    ['an encoded spelling', TEXT.replace('doc=tie', 'doc=t%69e')],
    ['another version', TEXT.replace('v=2', 'v=1')],
    ['a moved box of a field not covered', TEXT.replace('moved=can', 'moved=address')],
    ['a moved box of a field outside the list', TEXT.replace('moved=can', 'moved=name')],
    ['a moved box out of range', TEXT.replace('can-0-124', 'can-0-201')],
    ['a moved box with a fraction', TEXT.replace('can-0-124', 'can-0-12.4')],
    ['a moved box with a missing value', TEXT.replace('-60-18', '-60')],
    ['a moved box with a negative value', TEXT.replace('can-0-124', 'can-0--124')],
    ['a moved box twice', TEXT.replace('moved=can-0-124-142-60-18', 'moved=can-0-124-142-60-18,can-0-124-142-60-18')],
    ['moved boxes out of order', TEXT.replace('moved=can-0-124-142-60-18', 'moved=mrz-0-1-1-1-1,can-0-124-142-60-18')],
    ['a box number out of range', TEXT.replace('can-0-124', 'can-10-124')],
    ['a broken escape', TEXT.replace('doc=tie', 'doc=%E0%A4%A')],
    ['the empty text', ''],
  ])('rejects %s', (_name, text) => {
    expect(parseStats(text)).toBeUndefined()
  })
  it('rejects anything longer than the limit, so a photo never fits', () => {
    expect(parseStats(`${TEXT}&${'x'.repeat(MAX_STATS_LENGTH)}`)).toBeUndefined()
    expect(TEXT.length).toBeLessThan(MAX_STATS_LENGTH / 2)
  })
})

describe('thanks page fragment', () => {
  it('opens the thanks page with the session in the fragment, which browsers never send', () => {
    const href = thanksHref(SESSION)
    expect(href.startsWith('./thanks.html#v=2&doc=tie&')).toBe(true)
    expect(readFragment(new URL(href, 'https://x.test/').hash)).toEqual(SESSION)
  })
  it('drops any fragment that is not exactly the session list', () => {
    expect(readFragment('')).toBeUndefined()
    expect(readFragment('#photo=data:image/jpeg;base64,/9j/4AAQ')).toBeUndefined()
    expect(readFragment(`#${encodeSession(SESSION)}&extra=1`)).toBeUndefined()
    // The device part is read by the thanks page itself, never taken from the address.
    expect(readFragment(`#${TEXT}`)).toBeUndefined()
  })
  it('uses the same paths as the service worker', () => {
    expect(THANKS_URL).toBe(`./${THANKS_PAGE}`)
    expect(STATS_URL).toBe(`./${STATS_ENDPOINT}`)
  })
})

describe('session figures', () => {
  it('says whether detection got the document right', () => {
    expect(aiResult('tie', 'tie')).toBe('right')
    expect(aiResult('dni-3.0', 'dni')).toBe('right')
    expect(aiResult('tie', 'dni')).toBe('wrong')
    expect(aiResult('tie', 'none')).toBe('none')
    expect(aiResult('tie', 'off')).toBe('off')
    expect(aiResult('tie', null)).toBe('off')
  })
  it('names the photo source', () => {
    expect(photoSource(['camera', 'camera'])).toBe('camera')
    expect(photoSource(['file', 'paste'])).toBe('mixed')
    expect(photoSource([])).toBe('file')
  })
  it('keeps ids and counts only: never the watermark text or the commit in full', () => {
    const s = sessionStats({ doc: 'dni-4.0', outcome: 'dni', back: false, hidden: ['mrz', 'can'], boxes: 0, watermark: 'Solo para Banco X', greyscale: true, lang: 'en', sha: 'a'.repeat(40), via: ['file'], ocr: true, ...NO_MOVES })
    expect(s).toEqual({ doc: 'dni-4.0', ai: 'right', back: false, fields: ['can', 'mrz'], boxes: 0, mark: true, grey: true, lang: 'en', app: 'aaaaaaa', src: 'file', ocr: true, moved: [] })
    expect(encodeSession(s)).not.toContain('Banco')
    expect(sessionStats({ doc: 'tie', outcome: null, back: true, hidden: [], boxes: 0, watermark: '  ', greyscale: false, lang: 'es', sha: '', via: [], ocr: false, ...NO_MOVES })).toMatchObject({ mark: false, app: 'dev', ocr: false, ai: 'off' })
  })
  it('counts OCR that ran after the document step, also when detection was left early', () => {
    // Detection still reading when the person picked the document: no outcome, but Find my data ran.
    expect(sessionStats({ doc: 'tie', outcome: null, back: true, hidden: [], boxes: 0, watermark: '', greyscale: false, lang: 'es', sha: '', via: [], ocr: true, ...NO_MOVES })).toMatchObject({ ai: 'off', ocr: true })
  })
  it('sends a moved box as steps of 0.5% of the card, for covered fields only, never the default', () => {
    const zones = documentOf('dni-4.0')
    const at = (id: string): number => zones.zones.findIndex((z) => z.id === id)
    const can = zones.zones[at('can')]?.rects[0]
    expect(can).toBeDefined()
    const placement = {
      [zoneKey(at('can'), 0)]: { x: 0.6213, y: 0.7101, w: 0.3, h: 0.0912 },
      // Moved by less than half a step: not sent.
      [zoneKey(at('mrz'), 0)]: zones.zones[at('mrz')]?.rects[0] ?? { x: 0, y: 0, w: 0, h: 0 },
      // Moved, but the field stays visible: not sent.
      [zoneKey(at('address'), 0)]: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
      // Never counted (ADR 0043): not sent, even when covered.
      [zoneKey(at('name'), 0)]: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
    }
    const hand = Object.keys(placement)
    const moved = movedBoxes(zones, placement, ['can', 'mrz', 'name'], hand)
    expect(moved).toEqual([{ field: 'can', rect: 0, x: 124, y: 142, w: 60, h: 18 }])
    const s = sessionStats({ doc: 'dni-4.0', outcome: null, back: true, hidden: ['can', 'mrz', 'name'], boxes: 0, watermark: '', greyscale: false, lang: 'es', sha: '', via: [], ocr: false, zones, placement, handPlaced: hand })
    expect(encodeSession(s)).toContain('&moved=can-0-124-142-60-18')
    // Off the card is kept on its edge.
    const off = { [zoneKey(at('can'), 0)]: { x: -0.2, y: 1.4, w: 0.1, h: 0.1 } }
    expect(movedBoxes(zones, off, ['can'], Object.keys(off))).toEqual([{ field: 'can', rect: 0, x: 0, y: 200, w: 20, h: 20 }])
  })
  it('leaves out boxes placed by Fit to the text: they follow the words OCR read', () => {
    const zones = documentOf('dni-4.0')
    const at = zones.zones.findIndex((z) => z.id === 'can')
    const placement = { [zoneKey(at, 0)]: { x: 0.6, y: 0.7, w: 0.3, h: 0.1 } }
    expect(movedBoxes(zones, placement, ['can'], [])).toEqual([])
  })
  it('numbers a field\'s boxes across its zones, so front and back never share a number', () => {
    const zones = documentOf('dni-4.0')
    const keys = zones.zones.flatMap((z, zi) => (z.id === 'supportNumber' ? z.rects.map((_, ri) => zoneKey(zi, ri)) : []))
    expect(keys.length).toBeGreaterThan(1)
    const placement = Object.fromEntries(keys.map((k) => [k, { x: 0.01, y: 0.01, w: 0.01, h: 0.01 }]))
    const moved = movedBoxes(zones, placement, ['supportNumber'], keys)
    expect(moved.map((m) => m.rect)).toEqual(keys.map((_, i) => i))
    expect(parseSession(encodeSession({ ...SESSION, fields: ['supportNumber'], moved }))?.moved).toHaveLength(keys.length)
  })
  it('the OCR flag is set by a read and cleared by Reset', () => {
    clearOcrRan()
    expect(ocrRan()).toBe(false)
    markOcrRan()
    expect(ocrRan()).toBe(true)
    clearOcrRan()
    expect(ocrRan()).toBe(false)
  })
})

describe('device classes', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
  const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'
  const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Safari/537.36'
  it.each([
    [ANDROID, 0, 'phone', 'android', 'chrome', 131],
    [IPHONE, 5, 'phone', 'ios', 'safari', 18],
    [IPAD, 5, 'tablet', 'ios', 'safari', 18],
    [IPAD, 0, 'desktop', 'macos', 'safari', 18],
    [EDGE, 0, 'desktop', 'windows', 'edge', 131],
    [FIREFOX, 0, 'desktop', 'linux', 'firefox', 133],
    [SAMSUNG, 5, 'tablet', 'android', 'samsung', 26],
    ['curl/8.0', 0, 'desktop', 'other', 'other', 0],
  ])('%s', (ua, touch, device, os, browser, bv) => {
    expect(deviceOf(ua, touch)).toBe(device)
    expect(systemOf(ua, touch)).toBe(os)
    expect(browserOf(ua)).toEqual({ browser, bv })
  })
  it('sends classes only: the result always fits the fixed list', () => {
    const d = deviceStats({ userAgent: ANDROID, maxTouchPoints: 5, standalone: true })
    expect(d).toEqual({ device: 'phone', os: 'android', browser: 'chrome', bv: 131, pwa: true })
    expect(parseStats(encodeStats({ ...SESSION, ...d }))).toEqual({ ...SESSION, ...d })
  })
})

describe('Worker', () => {
  const sink = (): { rows: unknown[], env: { STATS: AnalyticsDataset } } => {
    const rows: unknown[] = []
    return { rows, env: { STATS: { writeDataPoint: (p) => { rows.push(p) } } } }
  }
  const post = (body: string, headers: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }, method = 'POST'): Request =>
    new Request('https://dnitapado.es/stats', { method, body: method === 'POST' ? body : null, headers })

  /** A streamed body, as a client sends with chunked transfer encoding: no Content-Length. */
  const chunked = (parts: string[], onPull: () => void = () => {}): Request => {
    const enc = new TextEncoder()
    let i = 0
    const body = new ReadableStream<Uint8Array>({
      pull (c) {
        onPull()
        if (i < parts.length) c.enqueue(enc.encode(parts[i++])); else c.close()
      },
    })
    return new Request('https://dnitapado.es/stats', { method: 'POST', body, headers: { 'Sec-Fetch-Site': 'same-origin' }, duplex: 'half' } as RequestInit)
  }

  it('stores one row for the exact list and answers 204, with no cookie', async () => {
    const { rows, env } = sink()
    const res = await handleStats(post(TEXT), env)
    expect(res.status).toBe(204)
    expect(res.headers.get('Set-Cookie')).toBeNull()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(rows).toEqual([dataPoint(FULL, 'XX')])
  })
  it('writes ids, classes and counts only, in fixed columns', () => {
    const p = dataPoint(FULL, 'ES')
    expect(p.indexes).toEqual(['tie'])
    expect(p.blobs).toEqual(['2', 'tie', 'right', 'es', '1a2b3c4', 'camera', 'phone', 'android', 'chrome', 'ES', 'signature,can,mrz', 'can-0-124-142-60-18'])
    expect(p.doubles).toEqual([1, 2, 1, 0, 1, 131, 0, 3, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1])
    // Workers Analytics Engine limits: 20 blobs, 20 doubles, 1 index.
    expect(p.blobs.length).toBeLessThanOrEqual(20)
    expect(p.doubles.length).toBeLessThanOrEqual(20)
  })
  it.each([
    ['another site', post(TEXT, { 'Sec-Fetch-Site': 'cross-site' }), 403],
    ['no fetch metadata (not a browser page)', post(TEXT, {}), 403],
    ['a GET', post('', { 'Sec-Fetch-Site': 'same-origin' }, 'GET'), 405],
    ['a changed list', post(`${TEXT}&name=Ana`), 400],
    ['a large body', post('x'.repeat(MAX_STATS_LENGTH + 1)), 413],
    ['a large body with no Content-Length (chunked)', chunked(['x'.repeat(MAX_STATS_LENGTH), 'x']), 413],
    ['a large body under a false Content-Length', post('x'.repeat(MAX_STATS_LENGTH + 1), { 'Sec-Fetch-Site': 'same-origin', 'Content-Length': '10' }), 413],
  ])('refuses %s and stores nothing', async (_name, req, status) => {
    const { rows, env } = sink()
    expect((await handleStats(req, env)).status).toBe(status)
    expect(rows).toEqual([])
  })
  it('accepts the exact list sent in chunks with no Content-Length', async () => {
    const { rows, env } = sink()
    const req = chunked([TEXT.slice(0, 100), TEXT.slice(100)])
    expect(req.headers.get('Content-Length')).toBeNull()
    expect((await handleStats(req, env)).status).toBe(204)
    expect(rows).toEqual([dataPoint(FULL, 'XX')])
  })
  it('stops reading a chunked body once it passes the cap', async () => {
    let pulls = 0
    const req = chunked(Array.from({ length: 1000 }, () => 'x'.repeat(100)), () => { pulls++ })
    expect((await handleStats(req, sink().env)).status).toBe(413)
    expect(pulls).toBeLessThan(20)
  })
  it('stores nothing and answers 429 once the rate limit is reached', async () => {
    const { rows, env } = sink()
    const keys: string[] = []
    let left = 1
    const STATS_LIMIT: RateLimit = { limit: async ({ key }) => { keys.push(key); return await Promise.resolve({ success: left-- > 0 }) } }
    expect((await handleStats(post(TEXT), { ...env, STATS_LIMIT })).status).toBe(204)
    expect((await handleStats(post(TEXT), { ...env, STATS_LIMIT })).status).toBe(429)
    expect(rows).toHaveLength(1)
    // One fixed key for every sender: nothing of the request (IP address, country, body) is used.
    expect(keys).toEqual([RATE_LIMIT_KEY, RATE_LIMIT_KEY])
  })
  it('counts only valid rows against the rate limit', async () => {
    let calls = 0
    const STATS_LIMIT: RateLimit = { limit: async () => { calls++; return await Promise.resolve({ success: true }) } }
    await handleStats(post(`${TEXT}&name=Ana`), { STATS_LIMIT })
    await handleStats(post(TEXT, { 'Sec-Fetch-Site': 'cross-site' }), { STATS_LIMIT })
    expect(calls).toBe(0)
  })
  it('the rate limit binding in wrangler.jsonc uses the name the Worker reads', () => {
    const config = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')
    expect(config).toMatch(/"ratelimits":\s*\[\s*\{\s*"name": "STATS_LIMIT"/)
  })
  it('runs only for /stats; any other path goes to the static files', async () => {
    let served = ''
    const env = { ASSETS: { fetch: async (r: Request) => { served = new URL(r.url).pathname; return await Promise.resolve(new Response('ok')) } } }
    expect(await (await worker.fetch(new Request('https://dnitapado.es/index.html'), env)).text()).toBe('ok')
    expect(served).toBe('/index.html')
  })
})

describe('service worker route for the stats (ADR 0029)', () => {
  const scope = 'https://dnitapado.es/'
  const known = { files: new Set([`${scope}index.html`, `${scope}thanks.html`]), onDemand: new Set<string>() }
  it('lets the POST through only from the thanks page', () => {
    expect(route('POST', `${scope}stats`, 'cors', scope, known, `${scope}thanks.html`)).toEqual({ kind: 'stats' })
    expect(route('POST', `${scope}stats`, 'cors', scope, known, `${scope}thanks.html#v=1`)).toEqual({ kind: 'stats' })
  })
  it.each([
    ['the app page', 'POST', `${scope}stats`, 'cors', scope],
    ['the app page by name', 'POST', `${scope}stats`, 'cors', `${scope}index.html`],
    ['an unknown sender', 'POST', `${scope}stats`, 'cors', ''],
    ['another path', 'POST', `${scope}stats2`, 'cors', `${scope}thanks.html`],
    ['a query string', 'POST', `${scope}stats?x=1`, 'cors', `${scope}thanks.html`],
    ['another origin', 'POST', 'https://evil.test/stats', 'cors', `${scope}thanks.html`],
    ['a GET', 'GET', `${scope}stats`, 'cors', `${scope}thanks.html`],
    ['a form post', 'POST', `${scope}stats`, 'navigate', `${scope}thanks.html`],
  ])('refuses %s', (_name, method, url, mode, client) => {
    expect(route(method, url, mode, scope, known, client)).toEqual({ kind: 'deny' })
  })
  it('answers a page load of the thanks page with thanks.html, and every other one with index.html', () => {
    expect(route('GET', `${scope}thanks.html`, 'navigate', scope, known)).toEqual({ kind: 'page', url: `${scope}thanks.html`, onDemand: false })
    expect(route('GET', `${scope}thanks.html#v=1&doc=tie`, 'navigate', scope, known)).toEqual({ kind: 'page', url: `${scope}thanks.html`, onDemand: false })
    expect(route('GET', `${scope}thanks.html?x`, 'navigate', scope, known)).toEqual({ kind: 'index' })
    expect(route('GET', `${scope}anything`, 'navigate', scope, known)).toEqual({ kind: 'index' })
  })
})

describe('thanks page text', () => {
  // The thanks page loads nothing on demand (no import map), so its text is built in (ADR 0029).
  it.each(LANGS)('%s: has its text without loading the language first', async (lang) => {
    const text = thanksText(lang, 'statsSend')
    if (lang !== 'es') expect(text).not.toBe(t('es', 'statsSend'))
    await loadLang(lang)
    expect(text).toBe(t(lang, 'statsSend'))
    expect(thanksText(lang, 'statsLead')).toBe(t(lang, 'statsLead'))
  })

  // The Worker stores the country with each row (endpoint.ts dataPoint): the text says so.
  it('names the stored country', () => {
    expect(thanksText('es', 'statsLead')).toContain('país')
    expect(thanksText('en', 'statsLead')).toContain('country')
  })
})
