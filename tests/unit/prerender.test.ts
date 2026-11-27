// SPDX-License-Identifier: AGPL-3.0-or-later
// Prerendered start screen (ADR 0041): what the build writes into <main id="app"> of index.html.
import { describe, expect, it } from 'vitest'
import { checkPrerendered, insertIntoApp, renderHome, trimMarkup } from '../../scripts/prerender.ts'
import es from '../../src/i18n/locales/es.json'

const DEFINE = { __REPO_URL__: '"https://github.com/aasanchez/dnilimpio.es"', __SITE_URL__: '"https://dnitapado.es/"', __BUILD_SHA__: '"0123456789abcdef0123456789abcdef01234567"', __BUILD_VERSION__: '"1.2.3"', __BUILD_TIME__: '0' }

describe('renderHome', () => {
  it('renders the Spanish start screen of App.svelte, as a first-time visitor sees it', async () => {
    const html = await renderHome(process.cwd(), DEFINE)
    expect(html).toMatch(/^<div class="app /)
    expect(html).toContain('<h1 class="')
    for (const key of ['kicker', 'homeTitle', 'homeLead', 'chipNoServer', 'chipOffline', 'chipOpenSource', 'chipNoAccount', 'start', 'startHint', 'guideOpen'] as const) {
      expect(html, key).toContain(es[key])
    }
    // The no-cookies notice shows on a first visit: no stored date at build time.
    expect(html).toContain('id="privacy-notice"')
    // The language selector shows Spanish.
    expect(html).toMatch(/<option value="es"[^>]*selected/)
    // Nothing for hydration, no closed dialog, nothing the CSP would refuse.
    expect(html).not.toContain('<!--')
    expect(html).not.toContain('<dialog')
    expect(() => checkPrerendered(html)).not.toThrow()
  }, 60_000)

  it('gives the same markup on every run, whatever the clock says (reproducible build)', async () => {
    const first = await renderHome(process.cwd(), DEFINE)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(await renderHome(process.cwd(), DEFINE)).toBe(first)
    expect(first).toContain('datetime="1970-01-01T00:00:00.000Z"')
  }, 60_000)

  it('gives the same markup in any time zone of the build machine', async () => {
    const tz = process.env['TZ']
    try {
      process.env['TZ'] = 'Pacific/Kiritimati'
      const far = await renderHome(process.cwd(), DEFINE)
      expect(process.env['TZ']).toBe('Pacific/Kiritimati')
      process.env['TZ'] = 'America/Los_Angeles'
      expect(await renderHome(process.cwd(), DEFINE)).toBe(far)
      // 1 January 1970, 00:00, in UTC.
      expect(far).toMatch(/title="1 de enero de 1970 a las 0:00"/)
    } finally {
      if (tz === undefined) Reflect.deleteProperty(process.env, 'TZ')
      else process.env['TZ'] = tz
    }
  }, 60_000)

  it('leaves the build machine as it was: no browser objects remain set', async () => {
    const before = ['window', 'localStorage'].map((k) => Object.getOwnPropertyDescriptor(globalThis, k))
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    const now = Date.now
    await renderHome(process.cwd(), DEFINE)
    expect(Date.now).toBe(now)
    expect(['window', 'localStorage'].map((k) => Object.getOwnPropertyDescriptor(globalThis, k))).toEqual(before)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'navigator')).toEqual(nav)
  }, 60_000)
})

describe('trimMarkup', () => {
  it('drops comments, hydration markers and closed dialogs', () => {
    expect(trimMarkup('<!--[--><p>a</p><!---->b<dialog class="x"><p>long</p></dialog><!--]-->')).toBe('<p>a</p>b')
  })
  it('removes pieces that join after a removal; what it cannot remove fails the check', () => {
    expect(trimMarkup('<!-<!--x-->-- y -->a')).toBe('a')
    expect(trimMarkup('<dia<dialog></dialog>log>x</dialog>b')).toBe('b')
    const left = trimMarkup('<!<!--x-->--<!--y-->>a')
    expect(left).toBe('<!-->a')
    expect(() => checkPrerendered(`<div><h1>x</h1>${left}</div>`)).toThrow('comment')
  })
})

describe('checkPrerendered', () => {
  const ok = '<div class="app"><h1>Hola</h1><button type="button">Empezar</button></div>'
  it('accepts plain markup with a heading', () => {
    expect(checkPrerendered(ok)).toBe(ok)
  })
  it.each([
    ['<script>alert(1)</script>', 'script'],
    ['<!-- x -->', 'comment'],
    ['<dialog></dialog>', 'dialog'],
    ['<p style="color:red">x</p>', 'style attribute'],
    ['<style>p{}</style>', 'style element'],
    ['<button onclick="go()">x</button>', 'event handler'],
    ['<img alt="">', 'loads a file'],
    ['<iframe></iframe>', 'loads a file'],
    ['<link rel="stylesheet" href="x.css">', 'loads a file'],
    ['<video src="x.mp4"></video>', 'src attribute'],
  ])('refuses %s', (bad, what) => {
    expect(() => checkPrerendered(ok.replace('</div>', `${bad}</div>`))).toThrow(what)
  })
  it('refuses markup without a heading', () => {
    expect(() => checkPrerendered('<div><p>x</p></div>')).toThrow('<h1>')
  })
})

describe('insertIntoApp', () => {
  const page = '<body>\n<main id="app" aria-live="polite"></main>\n<noscript>x</noscript>\n</body>'
  it('fills the empty <main id="app"> and marks the copy inert', () => {
    expect(insertIntoApp(page, '<div class="app"><h1>Hola</h1></div>')).toBe('<body>\n<main id="app" aria-live="polite"><div inert data-prerendered class="app"><h1>Hola</h1></div></main>\n<noscript>x</noscript>\n</body>')
  })
  it('refuses a page whose <main id="app"> is missing or not empty', () => {
    expect(() => insertIntoApp('<body></body>', '<div><h1>x</h1></div>')).toThrow('empty <main id="app">')
    expect(() => insertIntoApp('<main id="app"><p>x</p></main>', '<div><h1>x</h1></div>')).toThrow('empty <main id="app">')
  })
  it('refuses markup that does not start with a <div>', () => {
    expect(() => insertIntoApp(page, '<h1>x</h1>')).toThrow('<div>')
  })
})
