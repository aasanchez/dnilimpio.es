// SPDX-License-Identifier: AGPL-3.0-or-later
// Coarse device classes for the opt-in stats (ADR 0029). Each answer is one entry of a short fixed list
// (src/stats/schema.ts). The full user agent string, the screen size, the time zone and hardware
// details are never sent: together they can single out one device.

import type { Browser, DeviceStats, Device, System } from './schema.ts'

/** What the thanks page reads from the browser, passed in so tests can supply any browser. */
export interface DeviceHints {
  readonly userAgent: string
  /** navigator.maxTouchPoints: an iPad reports itself as a Mac and is told apart by touch. */
  readonly maxTouchPoints: number
  /** matchMedia('(display-mode: standalone)') or iOS navigator.standalone. */
  readonly standalone: boolean
}

export function systemOf (ua: string, touch: number): System {
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return 'ios'
  if (/CrOS/i.test(ua)) return 'chromeos'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Linux|X11/i.test(ua)) return 'linux'
  return 'other'
}

export function deviceOf (ua: string, touch: number): Device {
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return 'tablet'
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'phone' : 'tablet'
  if (/Mobi|iPhone|iPod/i.test(ua)) return 'phone'
  return 'desktop'
}

/** Browser family and major version. Order matters: Edge, Opera and Samsung also say "Chrome". */
export function browserOf (ua: string): { browser: Browser, bv: number } {
  const major = (re: RegExp): number => Number(re.exec(ua)?.[1] ?? 0)
  if (/Edg(e|A|iOS)?\//.test(ua)) return { browser: 'edge', bv: major(/Edg(?:e|A|iOS)?\/(\d+)/) }
  if (/OPR\/|Opera/.test(ua)) return { browser: 'opera', bv: major(/OPR\/(\d+)/) }
  if (/SamsungBrowser\//.test(ua)) return { browser: 'samsung', bv: major(/SamsungBrowser\/(\d+)/) }
  if (/Firefox\/|FxiOS\//.test(ua)) return { browser: 'firefox', bv: major(/(?:Firefox|FxiOS)\/(\d+)/) }
  if (/Chrome\/|CriOS\//.test(ua)) return { browser: 'chrome', bv: major(/(?:Chrome|CriOS)\/(\d+)/) }
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return { browser: 'safari', bv: major(/Version\/(\d+)/) }
  return { browser: 'other', bv: 0 }
}

export function deviceStats (h: DeviceHints): DeviceStats {
  const { browser, bv } = browserOf(h.userAgent)
  return {
    device: deviceOf(h.userAgent, h.maxTouchPoints),
    os: systemOf(h.userAgent, h.maxTouchPoints),
    browser,
    bv: Math.min(999, bv),
    pwa: h.standalone,
  }
}
