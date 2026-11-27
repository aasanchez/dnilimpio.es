// SPDX-License-Identifier: AGPL-3.0-or-later
// WebRTC canary (ADR 0034). The app removes WebRTC from its window, but a new browsing context starts
// with a fresh copy, and connect-src does not cover WebRTC. Each route below tries to get a window
// other than the app's own (a blank frame, srcdoc, document.write, a nested frame, a frameset, an
// object, a pop-up) and to open a peer connection with a data channel there. The same routes run
// first in a page without the app, to prove that each one does reach WebRTC in this browser.
// Synthetic cards only.
/* eslint-disable no-restricted-properties, @typescript-eslint/no-deprecated -- the canary tries each route to prove it is closed */
import { expect, test, type Page } from '@playwright/test'
import { loadBoth } from './helpers.ts'

test.use({ locale: 'es-ES' })

/**
 * Runs every route and returns, per route, what it reached: 'webrtc' when a peer connection with a
 * data channel opened, otherwise a short reason ('no window', 'no RTCPeerConnection', or the error).
 */
async function routes (page: Page): Promise<Record<string, string>> {
  return await page.evaluate(async () => {
    type Win = Window & Record<string, unknown>
    const out: Record<string, string> = {}
    /** Opens a peer connection and a data channel in `w`, the way an attacker's code would. */
    const reach = (w: unknown): string => {
      if (w === null || w === undefined) return 'no window'
      const win = w as Win
      if (win === (window as unknown)) return 'the app window'
      const Peer = (win['RTCPeerConnection'] ?? win['webkitRTCPeerConnection']) as (new (c?: RTCConfiguration) => RTCPeerConnection) | undefined
      if (typeof Peer !== 'function') return typeof win['RTCDataChannel'] === 'function' ? 'RTCDataChannel only' : 'no RTCPeerConnection'
      const pc = new Peer({ iceServers: [{ urls: 'stun:stun.invalid:3478' }] })
      const channel = pc.createDataChannel('leak')
      const ok = typeof channel === 'object'
      pc.close()
      return ok ? 'webrtc' : 'no data channel'
    }
    const attempt = (name: string, get: () => unknown): void => {
      try {
        out[name] = reach(get())
      } catch (e) {
        out[name] = e instanceof Error ? e.name : 'error'
      }
    }
    const frame = (): HTMLIFrameElement => document.createElement('iframe')
    const html = (s: string): string => s

    attempt('blank frame (appendChild)', () => document.body.appendChild(frame()).contentWindow)
    attempt('blank frame (append)', () => { const f = frame(); document.body.append(f); return f.contentWindow })
    attempt('blank frame (insertBefore)', () => document.body.insertBefore(frame(), document.body.firstChild).contentWindow)
    attempt('blank frame (insertAdjacentElement)', () => (document.body.insertAdjacentElement('beforeend', frame()) as HTMLIFrameElement | null)?.contentWindow)
    attempt('blank frame (replaceChildren of a new div)', () => { const d = document.createElement('div'); document.body.append(d); const f = frame(); d.replaceChildren(f); return f.contentWindow })
    attempt('blank frame inside a div', () => { const d = document.createElement('div'); const f = frame(); d.append(f); document.body.append(d); return f.contentWindow })
    attempt('blank frame (Range.insertNode)', () => { const r = document.createRange(); r.selectNodeContents(document.body); const f = frame(); r.insertNode(f); return f.contentWindow })
    attempt('blank frame in a shadow root', () => { const host = document.createElement('div'); document.body.append(host); const f = frame(); host.attachShadow({ mode: 'open' }).append(f); return f.contentWindow })
    attempt('blank frame from a template', () => { const t = document.createElement('template'); t.content.append(frame()); const c = t.content.cloneNode(true) as DocumentFragment; const f = c.firstChild as HTMLIFrameElement; document.body.append(c); return f.contentWindow })
    attempt('blank frame made in another document', () => { const d = document.implementation.createHTMLDocument(''); const f = document.adoptNode(d.createElement('iframe')); document.body.append(f); return f.contentWindow })
    attempt('srcdoc frame', () => { const f = frame(); f.srcdoc = html('<p>x</p>'); document.body.append(f); return f.contentWindow })
    attempt('document.write in a blank frame', () => {
      const f = frame(); document.body.append(f)
      const d = f.contentDocument
      d?.open(); d?.write(html('<p>x</p>')); d?.close()
      return f.contentWindow
    })
    attempt('nested frame', () => {
      const f = frame(); document.body.append(f)
      const d = f.contentDocument
      const g = d?.createElement('iframe')
      if (g === undefined) return null
      d?.body.append(g)
      return g.contentWindow
    })
    attempt('innerHTML frame', () => { const d = document.createElement('div'); d.innerHTML = html('<iframe></iframe>'); document.body.append(d); return d.querySelector('iframe')?.contentWindow })
    attempt('insertHTML command', () => {
      const d = document.createElement('div'); d.contentEditable = 'true'; document.body.append(d); d.focus()
      document.execCommand('insertHTML', false, html('<iframe id="cmd"></iframe>'))
      return document.querySelector<HTMLIFrameElement>('#cmd')?.contentWindow
    })
    attempt('setHTML (sanitizer)', () => {
      const d = document.createElement('div') as HTMLDivElement & { setHTML?: (s: string) => void }
      if (typeof d.setHTML !== 'function') return null
      d.setHTML(html('<iframe></iframe>')); document.body.append(d)
      return d.querySelector('iframe')?.contentWindow
    })
    attempt('object', () => { const o = document.createElement('object'); document.body.append(o); return o.contentWindow })
    attempt('embed', () => { const e = document.createElement('embed'); document.body.append(e); return (e as unknown as { contentWindow?: unknown }).contentWindow ?? window[0] })
    attempt('window.open', () => window.open('about:blank'))
    attempt('window.open by name', () => window.open('', 'leak'))
    attempt('document.open with three arguments', () => (document.open as unknown as (u: string, n: string, f: string) => Window | null)('about:blank', 'leak2', ''))
    attempt('window[0]', () => window[0])
    attempt('frameset as the body (last: it replaces the page)', () => {
      const set = document.createElement('frameset')
      set.append(document.createElement('frame'))
      document.body = set
      return (set.firstChild as HTMLFrameElement).contentWindow
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    attempt('window[0] after the frameset', () => window[0])
    // The app's own window: no WebRTC at all.
    out['the app window'] = typeof (window as unknown as Win)['RTCPeerConnection'] === 'function' || typeof (window as unknown as Win)['RTCDataChannel'] === 'function' ? 'webrtc' : 'no RTCPeerConnection'
    return out
  })
}

const reached = (r: Record<string, string>): string[] => Object.entries(r).filter(([, v]) => v === 'webrtc').map(([k]) => k)

test('the canary works: without the app, each frame and pop-up route reaches WebRTC', async ({ page }) => {
  await page.goto('about:blank')
  await page.evaluate(() => { document.body.innerHTML = '' })
  const r = await routes(page)
  // Every route that makes a new window in a plain page gets a working data channel there.
  for (const route of ['blank frame (appendChild)', 'blank frame (append)', 'blank frame (insertBefore)', 'blank frame (Range.insertNode)', 'blank frame in a shadow root', 'blank frame from a template', 'blank frame made in another document', 'srcdoc frame', 'document.write in a blank frame', 'nested frame', 'innerHTML frame', 'insertHTML command', 'window.open', 'the app window']) {
    expect(r[route], route).toBe('webrtc')
  }
})

test('on the start screen, no frame, pop-up or nested frame reaches WebRTC', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
  const r = await routes(page)
  expect(reached(r), JSON.stringify(r, null, 1)).toEqual([])
  expect(r['blank frame (appendChild)']).toBe('NotSupportedError')
  expect(r['window.open']).toBe('no window')
})

test('with photos loaded under the photo step\'s policy, no frame, pop-up or nested frame reaches WebRTC', async ({ page }) => {
  await loadBoth(page)
  await expect(page.locator('meta[data-intake-lockdown]')).toHaveCount(1)
  const r = await routes(page)
  expect(reached(r), JSON.stringify(r, null, 1)).toEqual([])
  expect(r['blank frame (appendChild)']).toBe('NotSupportedError')
  expect(r['nested frame']).toBe('NotSupportedError')
  // And no frame element is left in the page.
  expect(await page.locator('iframe, frame, object, embed').count()).toBe(0)
})
