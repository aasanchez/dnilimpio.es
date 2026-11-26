// SPDX-License-Identifier: AGPL-3.0-or-later
// Draws the app icons in public/icons/ from the brand mark in the top bar ("DT.es" in JetBrains Mono
// on orange, src/App.svelte). The PNG files are committed, so the build stays reproducible and needs
// no browser; run this again only when the mark changes:
//
//   node scripts/make-icons.ts
//
// - icon-*.png: the mark as shown in the app (rounded, ink border, transparent corners), "any" purpose.
// - maskable-*.png: full-bleed orange, the text inside the central safe zone (radius 40 %), so Android
//   can crop it to any shape.
// - apple-touch-icon.png: opaque, full-bleed (iOS rounds the corners itself and ignores transparency).
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const FONT = readFileSync('src/ui/fonts/jetbrains-mono-latin-700-normal.woff2').toString('base64')
const ORANGE = '#f36716'
const INK = '#1f1a14'

interface Icon { readonly file: string; readonly size: number; readonly kind: 'any' | 'full'; readonly text: number }

const ICONS: readonly Icon[] = [
  { file: 'icon-192.png', size: 192, kind: 'any', text: 0.74 },
  { file: 'icon-512.png', size: 512, kind: 'any', text: 0.74 },
  { file: 'favicon-64.png', size: 64, kind: 'any', text: 0.8 },
  // Safe zone: a circle of radius 0.4 × size. Text 0.6 wide at 0.17 high stays inside it.
  { file: 'maskable-192.png', size: 192, kind: 'full', text: 0.6 },
  { file: 'maskable-512.png', size: 512, kind: 'full', text: 0.6 },
  { file: 'apple-touch-icon.png', size: 180, kind: 'full', text: 0.68 },
]

function html (icon: Icon): string {
  const s = icon.size
  const box = icon.kind === 'any'
    ? `border: ${String(Math.max(2, Math.round(s * 0.045)))}px solid ${INK}; border-radius: ${String(Math.round(s * 0.2))}px;`
    : ''
  // JetBrains Mono: every glyph is 0.6 em wide, so 5 characters span 3 em.
  const fontSize = (s * icon.text) / 3
  return `<!doctype html><style>
    @font-face { font-family: M; src: url(data:font/woff2;base64,${FONT}) format('woff2'); font-weight: 700; }
    html, body { margin: 0; background: transparent; }
    div { box-sizing: border-box; width: ${String(s)}px; height: ${String(s)}px; background: ${ORANGE}; ${box}
      display: flex; align-items: center; justify-content: center;
      font: 700 ${String(fontSize)}px/1 M; color: ${INK}; letter-spacing: 0; }
  </style><div>DT.es</div>`
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(html(icon))
  await page.evaluate(async () => { await document.fonts.ready })
  await page.locator('div').screenshot({ path: `public/icons/${icon.file}`, omitBackground: icon.kind === 'any' })
}
await browser.close()
