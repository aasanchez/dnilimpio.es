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
// - favicon.svg, favicon-16.png, favicon-32.png and ../favicon.ico: the browser tab icon. "DT.es" is
//   unreadable at 16 px, so the favicon shows "DT", drawn as shapes on a 32-unit grid whose edges fall
//   on whole pixels at 16 and 32 px (sharp, no blurred font hinting). The SVG switches the border to
//   cream in a dark theme, as the mark in the top bar does; the PNG and ICO files keep the light one.
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const FONT = readFileSync('src/ui/fonts/jetbrains-mono-latin-700-normal.woff2').toString('base64')
const ORANGE = '#f36716'
const INK = '#1f1a14'

interface Icon { readonly file: string; readonly size: number; readonly kind: 'any' | 'full'; readonly text: number }

const ICONS: readonly Icon[] = [
  { file: 'icon-192.png', size: 192, kind: 'any', text: 0.74 },
  { file: 'icon-512.png', size: 512, kind: 'any', text: 0.74 },
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

// Even coordinates are pixel edges at 16 px. Ink letters 16 units high with 4-unit strokes (2 px at 16 px).
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<style>rect{stroke:${INK}}@media (prefers-color-scheme:dark){rect{stroke:#f8f5ed}}</style>
<rect x="1" y="1" width="30" height="30" rx="7" fill="${ORANGE}" stroke-width="2"/>
<path fill="${INK}" fill-rule="evenodd" d="M4 8H10A4 4 0 0 1 14 12V20A4 4 0 0 1 10 24H4ZM8 12V20H10V12Z"/>
<path fill="${INK}" d="M16 8H28V12H24V24H20V12H16Z"/>
</svg>
`
const FAVICON_SIZES = [16, 32, 48] as const

/** An ICO file holding PNG images (supported since Windows Vista and by every current browser). */
function ico (images: ReadonlyArray<{ readonly size: number; readonly png: Buffer }>): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size % 256, e) // width, 0 means 256
    header.writeUInt8(size % 256, e + 1) // height
    header.writeUInt16LE(1, e + 4) // colour planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(html(icon))
  await page.evaluate(async () => { await document.fonts.ready })
  await page.locator('div').screenshot({ path: `public/icons/${icon.file}`, omitBackground: icon.kind === 'any' })
}

writeFileSync('public/icons/favicon.svg', FAVICON_SVG)
await page.emulateMedia({ colorScheme: 'light' })
const favicons: Array<{ size: number; png: Buffer }> = []
for (const size of FAVICON_SIZES) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><style>html, body { margin: 0; background: transparent; } svg { display: block; width: ${String(size)}px; height: ${String(size)}px; }</style>${FAVICON_SVG}`)
  const png = await page.locator('svg').screenshot({ omitBackground: true })
  if (size !== 48) writeFileSync(`public/icons/favicon-${String(size)}.png`, png)
  favicons.push({ size, png })
}
writeFileSync('public/favicon.ico', ico(favicons))
await browser.close()
