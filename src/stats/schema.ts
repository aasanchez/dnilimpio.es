// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in anonymous usage stats (ADR 0029): the one fixed list of values the thanks page may send and
// the Worker may store. One module for both sides, so they can never disagree.
//
// The text form is a URL query string with fixed keys in a fixed order, e.g.
//   v=1&doc=tie&ai=right&back=1&fields=can,mrz,signature&boxes=0&mark=1&grey=0&lang=es&app=1a2b3c4
//   &src=camera&ocr=1&moved=can-0-124-142-60-18&device=phone&os=android&browser=chrome&bv=131&pwa=0
// parseStats() accepts exactly that shape and nothing else: an unknown key, a repeated key, a value
// outside its list or a number out of range rejects the whole text. Nothing from the document can
// fit in it: no text, no image, no identifier. The one position it holds is where the person moved a
// cover box on the straightened card (ADR 0047), in coarse steps; never a position on the photo.

/** Bump on any change of meaning; the Worker stores it with each row. */
export const STATS_VERSION = 2

/**
 * Longest text parseStats() reads. A valid text is about 250 characters, plus about 30 for each box
 * moved by hand (at most MAX_MOVED, about 450 in all for the 14 boxes of a document).
 */
export const MAX_STATS_LENGTH = 1200

export const DOCS = ['dni-4.0', 'dni-3.0', 'tie'] as const
/**
 * Automatic document detection:
 * right: it preselected the document the person kept. wrong: the person chose another one.
 * none: it read the photos but found no answer. off: it could not run (offline, old browser).
 */
export const AI_RESULTS = ['right', 'wrong', 'none', 'off'] as const
/**
 * Field ids of src/zones/types.ts (ZoneId) that the stats count. Append only, never reorder: the
 * Worker stores one number per field in this order (dataPoint() in src/stats/endpoint.ts). The name
 * and DNI/NIE number fields (ADR 0043) are not counted: a data point holds at most 20 numbers, and
 * this list is part of the fixed list of ADR 0029.
 */
export const FIELDS = ['signature', 'issueDate', 'expiryDate', 'supportNumber', 'can', 'mrz', 'address', 'placeOfBirth', 'parents', 'dateOfBirth', 'permitType'] as const
export const LANG_TAGS = ['es', 'ca', 'ca-ES-valencia', 'gl', 'eu', 'en', 'fr', 'nl', 'sv', 'fi', 'uk', 'ro', 'ar'] as const
export const DEVICES = ['phone', 'tablet', 'desktop'] as const
export const SYSTEMS = ['android', 'ios', 'windows', 'macos', 'linux', 'chromeos', 'other'] as const
export const BROWSERS = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'other'] as const
/** Where the photos came from: the camera (live or the system camera), a file (picker or drop), the clipboard. */
export const SOURCES = ['camera', 'file', 'paste', 'mixed'] as const

export type StatsDoc = (typeof DOCS)[number]
export type AiResult = (typeof AI_RESULTS)[number]
export type StatsField = (typeof FIELDS)[number]
export type StatsLang = (typeof LANG_TAGS)[number]
export type Device = (typeof DEVICES)[number]
export type System = (typeof SYSTEMS)[number]
export type Browser = (typeof BROWSERS)[number]
export type PhotoSource = (typeof SOURCES)[number]

/**
 * Steps of a moved box's position: 200 per card side, so one step is 0.5% of the straightened card
 * (about 0.43 mm across and 0.27 mm down an ID-1 card). Coarse on purpose (ADR 0047).
 */
export const MOVED_STEPS = 200
/** Most boxes one row can list. A document has at most 14 cover boxes (src/zones/). */
export const MAX_MOVED = 20
/** Highest box number within one field (a field can be printed in more than one place). */
const MAX_RECT_INDEX = 9

/**
 * A field's cover box that the person moved or resized by hand, as it was when they finished: on the
 * straightened card, in MOVED_STEPS steps from its top-left corner. Never the default it replaced:
 * that is fixed by `doc` and `app` (the zones of that build), so each query can rebuild it.
 */
export interface MovedBox {
  readonly field: StatsField
  /** The box's number among all of its field's boxes, in zone order (front and back). */
  readonly rect: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** What the app knows about one use, handed to the thanks page when the person clears everything. */
export interface SessionStats {
  readonly doc: StatsDoc
  readonly ai: AiResult
  /** A back photo was used. */
  readonly back: boolean
  /** Ids of the fields that were covered, never their content or position. */
  readonly fields: readonly StatsField[]
  /** Extra black boxes drawn by hand (capped at MAX_BOXES). */
  readonly boxes: number
  /** A watermark was added (its text is never sent). */
  readonly mark: boolean
  readonly grey: boolean
  readonly lang: StatsLang
  /** Build: the first 7 hex digits of the commit, or "dev". */
  readonly app: string
  readonly src: PhotoSource
  /** OCR ran on the device during this use. */
  readonly ocr: boolean
  /** Cover boxes of covered fields that were moved or resized by hand (ADR 0047), in fixed order. */
  readonly moved: readonly MovedBox[]
}

/** What the thanks page reads from the browser itself: coarse classes only, nothing that singles out one device. */
export interface DeviceStats {
  readonly device: Device
  readonly os: System
  readonly browser: Browser
  /** Browser major version (0 when unknown). */
  readonly bv: number
  /** Running as an installed app. */
  readonly pwa: boolean
}

export type UsageStats = SessionStats & DeviceStats

export const MAX_BOXES = 50
const MAX_BROWSER_VERSION = 999

/** Keys of the session part (the thanks page's address fragment). */
const SESSION_KEYS = ['v', 'doc', 'ai', 'back', 'fields', 'boxes', 'mark', 'grey', 'lang', 'app', 'src', 'ocr', 'moved'] as const
/** Keys of the full text the thanks page sends. */
const ALL_KEYS = [...SESSION_KEYS, 'device', 'os', 'browser', 'bv', 'pwa'] as const

const bit = (b: boolean): string => (b ? '1' : '0')
const sortFields = (fields: readonly StatsField[]): StatsField[] => FIELDS.filter((f) => fields.includes(f))

/** One position in MOVED_STEPS steps, from a 0–1 value: rounded, and kept inside the card. */
export const toSteps = (v: number): number => Number.isFinite(v) ? Math.min(MOVED_STEPS, Math.max(0, Math.round(v * MOVED_STEPS))) : 0

/** Field order, then box number: one spelling per set of moved boxes. */
const movedOrder = (a: MovedBox, b: MovedBox): number => FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field) || a.rect - b.rect

const movedEntry = (m: MovedBox): string => [m.field, m.rect, m.x, m.y, m.w, m.h].join('-')
/** The `moved` value: entries `field-rect-x-y-w-h`, separated by commas. */
export const movedText = (moved: readonly MovedBox[]): string => moved.map(movedEntry).join(',')

/** The moved boxes as written: only covered fields, each box once, in fixed order, at most MAX_MOVED. */
function cleanMoved (s: SessionStats): MovedBox[] {
  const seen = new Set<string>()
  return [...s.moved].sort(movedOrder).filter((m) => {
    const key = `${m.field}-${String(m.rect)}`
    if (!s.fields.includes(m.field) || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, MAX_MOVED)
}

function sessionPairs (s: SessionStats): Array<[string, string]> {
  return [
    ['v', String(STATS_VERSION)],
    ['doc', s.doc],
    ['ai', s.ai],
    ['back', bit(s.back)],
    ['fields', sortFields(s.fields).join(',')],
    ['boxes', String(Math.min(MAX_BOXES, Math.max(0, Math.trunc(s.boxes))))],
    ['mark', bit(s.mark)],
    ['grey', bit(s.grey)],
    ['lang', s.lang],
    ['app', s.app],
    ['src', s.src],
    ['ocr', bit(s.ocr)],
    ['moved', movedText(cleanMoved(s))],
  ]
}

const encode = (pairs: ReadonlyArray<readonly [string, string]>): string => pairs.map(([k, v]) => `${k}=${encodeURIComponent(v).replaceAll('%2C', ',')}`).join('&')

/** The session part, as the thanks page's fragment carries it. */
export function encodeSession (s: SessionStats): string {
  return encode(sessionPairs(s))
}

/** The full text the thanks page shows and sends: the session part, then the device part. */
export function encodeStats (s: UsageStats): string {
  return encode([
    ...sessionPairs(s),
    ['device', s.device],
    ['os', s.os],
    ['browser', s.browser],
    ['bv', String(Math.min(MAX_BROWSER_VERSION, Math.max(0, Math.trunc(s.bv))))],
    ['pwa', bit(s.pwa)],
  ])
}

const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | undefined => (list as readonly string[]).includes(v ?? '') ? v as T : undefined
const parseBit = (v: string | undefined): boolean | undefined => (v === '1' ? true : v === '0' ? false : undefined)
const parseInt0 = (v: string | undefined, max: number): number | undefined => {
  if (v === undefined || !/^(0|[1-9]\d{0,2})$/.test(v)) return undefined
  const n = Number(v)
  return n <= max ? n : undefined
}

/** Splits `k=v&k=v` into a map. Undefined on a key outside `keys`, a repeated key or a malformed pair. */
function pairsOf (text: string, keys: readonly string[]): Map<string, string> | undefined {
  if (text.length === 0 || text.length > MAX_STATS_LENGTH) return undefined
  const out = new Map<string, string>()
  for (const part of text.split('&')) {
    const eq = part.indexOf('=')
    if (eq <= 0) return undefined
    const k = part.slice(0, eq)
    let v: string
    try {
      v = decodeURIComponent(part.slice(eq + 1))
    } catch {
      return undefined
    }
    if (!keys.includes(k) || out.has(k)) return undefined
    out.set(k, v)
  }
  // Every key must be present: a partial text is as suspicious as an extra one.
  return keys.every((k) => out.has(k)) ? out : undefined
}

/** One entry `field-rect-x-y-w-h`, or undefined if it is anything else. */
function movedOf (entry: string): MovedBox | undefined {
  const parts = entry.split('-')
  if (parts.length !== 6) return undefined
  const field = oneOf(FIELDS, parts[0])
  const rect = parseInt0(parts[1], MAX_RECT_INDEX)
  const [x, y, w, h] = parts.slice(2).map((p) => parseInt0(p, MOVED_STEPS))
  if (field === undefined || rect === undefined || x === undefined || y === undefined || w === undefined || h === undefined) return undefined
  return { field, rect, x, y, w, h }
}

function sessionOf (m: Map<string, string>): SessionStats | undefined {
  if (m.get('v') !== String(STATS_VERSION)) return undefined
  const doc = oneOf(DOCS, m.get('doc'))
  const ai = oneOf(AI_RESULTS, m.get('ai'))
  const back = parseBit(m.get('back'))
  const rawFields = m.get('fields') ?? ''
  const list = rawFields === '' ? [] : rawFields.split(',')
  const fields = list.map((f) => oneOf(FIELDS, f))
  const boxes = parseInt0(m.get('boxes'), MAX_BOXES)
  const mark = parseBit(m.get('mark'))
  const grey = parseBit(m.get('grey'))
  const lang = oneOf(LANG_TAGS, m.get('lang'))
  const app = m.get('app') ?? ''
  const src = oneOf(SOURCES, m.get('src'))
  const ocr = parseBit(m.get('ocr'))
  const rawMoved = m.get('moved') ?? ''
  const movedList = rawMoved === '' ? [] : rawMoved.split(',')
  if (movedList.length > MAX_MOVED) return undefined
  const moved = movedList.map(movedOf)
  if (moved.some((b) => b === undefined)) return undefined
  if (doc === undefined || ai === undefined || back === undefined || boxes === undefined || mark === undefined || grey === undefined || lang === undefined || src === undefined || ocr === undefined) return undefined
  if (!/^([0-9a-f]{7}|dev)$/.test(app)) return undefined
  // Each field once, in the fixed order: the text has exactly one spelling per set of fields.
  if (fields.some((f) => f === undefined) || new Set(fields).size !== fields.length) return undefined
  const known = fields as StatsField[]
  if (sortFields(known).join(',') !== rawFields) return undefined
  const session: SessionStats = { doc, ai, back, fields: known, boxes, mark, grey, lang, app, src, ocr, moved: moved as MovedBox[] }
  // Moved boxes only of covered fields, each once, in the fixed order: encodeSession() writes them so.
  return movedText(cleanMoved(session)) === rawMoved ? session : undefined
}

/** The session part from the thanks page's fragment, or undefined if it is anything else. */
export function parseSession (text: string): SessionStats | undefined {
  const m = pairsOf(text, SESSION_KEYS)
  const s = m === undefined ? undefined : sessionOf(m)
  return s !== undefined && encodeSession(s) === text ? s : undefined
}

/** The full text as the Worker receives it, or undefined if it is anything else. */
export function parseStats (text: string): UsageStats | undefined {
  const m = pairsOf(text, ALL_KEYS)
  if (m === undefined) return undefined
  const session = sessionOf(m)
  const device = oneOf(DEVICES, m.get('device'))
  const os = oneOf(SYSTEMS, m.get('os'))
  const browser = oneOf(BROWSERS, m.get('browser'))
  const bv = parseInt0(m.get('bv'), MAX_BROWSER_VERSION)
  const pwa = parseBit(m.get('pwa'))
  if (session === undefined || device === undefined || os === undefined || browser === undefined || bv === undefined || pwa === undefined) return undefined
  const stats: UsageStats = { ...session, device, os, browser, bv, pwa }
  // One spelling only: the text must be exactly what encodeStats() writes for these values.
  return encodeStats(stats) === text ? stats : undefined
}
