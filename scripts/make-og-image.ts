// SPDX-License-Identifier: AGPL-3.0-or-later
// Draws public/icons/og-image.png, the preview image that link previews and search results show for
// the site (og:image, src/seo/site.ts). A synthetic card only: no real document (CLAUDE.md rule 10).
// The PNG is committed, so the build needs no browser; run this again only when the design changes:
//
//   node scripts/make-og-image.ts
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const font = (file: string): string => readFileSync(`src/ui/fonts/${file}`).toString('base64')
const DISPLAY = font('bricolage-grotesque-latin-wght-normal.woff2')
const DISPLAY_EXT = font('bricolage-grotesque-latin-ext-wght-normal.woff2')
const MONO = font('jetbrains-mono-latin-700-normal.woff2')

const W = 1200
const H = 630

const HTML = `<!doctype html><style>
  @font-face { font-family: D; src: url(data:font/woff2;base64,${DISPLAY}) format('woff2'); font-weight: 200 800; }
  @font-face { font-family: D; src: url(data:font/woff2;base64,${DISPLAY_EXT}) format('woff2'); font-weight: 200 800; unicode-range: U+0100-024F; }
  @font-face { font-family: M; src: url(data:font/woff2;base64,${MONO}) format('woff2'); font-weight: 700; }
  html, body { margin: 0; }
  main { box-sizing: border-box; width: ${String(W)}px; height: ${String(H)}px; padding: 64px 72px; background: #f8f5ed;
    color: #1f1a14; font-family: D; display: grid; grid-template-columns: 1fr 430px; gap: 48px; align-items: center; }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 34px; letter-spacing: -0.5px; }
  .mark { font: 700 20px/1 M; background: #f36716; border: 3px solid #1f1a14; border-radius: 6px; padding: 7px 9px; }
  h1 { margin: 44px 0 0; font-size: 76px; line-height: 0.98; font-weight: 800; letter-spacing: -2.5px; }
  svg { display: block; width: 300px; height: 18px; margin-top: 8px; }
  p { margin: 30px 0 0; font-size: 30px; line-height: 1.3; color: #4d4439; }
  .card { position: relative; aspect-ratio: 1.585; width: 100%; border: 3px solid #1f1a14; border-radius: 18px;
    background: #e4edf3; transform: rotate(-4deg); box-shadow: 10px 10px 0 #1f1a14; }
  .card span { position: absolute; display: block; background: #9fb0bc; }
  .card span:nth-child(1) { inset: 0 0 86% 0; border-radius: 15px 15px 0 0; background: #c6d8e6; }
  .card span:nth-child(2) { top: 20%; left: 5%; height: 62%; width: 28%; border-radius: 6px; background: #b7c6d1; }
  .card span:nth-child(3) { top: 22%; left: 39%; height: 8%; width: 50%; }
  .card span:nth-child(4) { top: 36%; left: 39%; height: 8%; width: 36%; }
  .card span:nth-child(5) { top: 56%; left: 39%; height: 10%; width: 52%; background: #1f1a14; }
  .card span:nth-child(6) { top: 72%; left: 39%; height: 10%; width: 30%; background: #1f1a14; }
  .card span:nth-child(7) { top: 72%; left: 73%; height: 10%; width: 20%; background: #1f1a14; }
</style><main>
  <div>
    <div class="brand"><span class="mark">DT.es</span>DNI Tapado.es</div>
    <h1>Tapa los datos de tu DNI</h1>
    <svg viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M2 6c18-5 34 3 50-1s30-3 46 0" fill="none" stroke="#f36716" stroke-width="3.5" stroke-linecap="round" /></svg>
    <p>Y añade una marca de agua. Gratis, sin registro, en tu dispositivo.</p>
  </div>
  <div class="card"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
</main>`

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: W, height: H } })
await page.setContent(HTML)
await page.evaluate(async () => { await document.fonts.ready })
await page.locator('main').screenshot({ path: 'public/icons/og-image.png' })
await browser.close()
console.log('Wrote public/icons/og-image.png')
