// SPDX-License-Identifier: AGPL-3.0-or-later
// Languages on demand: the start page holds Spanish only. The browser's language, or the one picked
// in the selector, loads as its own file of this build: before the first render, after the photo
// step's policy (ADR 0025) is in force, and offline once the service worker has cached the app.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { controlled, openCapture } from './helpers.ts'

/** The selector's label in `lang`, straight from its dictionary. */
function label (lang: string): string {
  const dict = JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>
  return dict['language'] ?? ''
}

/** Collects CSP and Trusted Types violations and page errors. */
function watch (page: Page): string[] {
  const problems: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Trusted Type/i.test(m.text())) problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(e.message))
  return problems
}

async function pick (page: Page, lang: string): Promise<void> {
  await page.locator('#lang').selectOption(lang)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await expect(page.locator('label[for="lang"]')).toHaveText(label(lang))
}

test.describe('browser language', () => {
  test.use({ locale: 'fr-FR' })

  test('the first render is in the browser language, and other languages are not loaded', async ({ page }) => {
    const problems = watch(page)
    const scripts: string[] = []
    page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname) })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(page.locator('label[for="lang"]')).toHaveText(label('fr'))
    // No dictionary of a language the page does not show (the guide's text is not loaded either).
    expect(scripts.filter((p) => /\/assets\/(en|ar|uk|ca|gl|eu|nl|sv|fi|ro)-[\w-]+\.js$/.test(p))).toEqual([])
    expect(problems).toEqual([])
  })
})

test.describe('language selector', () => {
  test.use({ locale: 'es-ES' })

  test('switches language after the photo step locks the page', async ({ page }) => {
    const problems = watch(page)
    await openCapture(page)
    await expect(page.locator('meta[data-intake-lockdown]')).toHaveCount(1)
    await pick(page, 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await pick(page, 'en')
    await pick(page, 'es')
    expect(problems).toEqual([])
  })

  test('keeps the current language when a dictionary cannot load', async ({ page }) => {
    const problems = watch(page)
    await page.goto('/')
    await pick(page, 'en')
    // French cannot load, as offline before its file was cached.
    await page.route(/\/assets\/fr-[\w-]+\.js$/, (route) => route.abort('internetdisconnected'))
    await page.locator('#lang').selectOption('fr')
    await expect(page.locator('#lang')).toHaveValue('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('label[for="lang"]')).toHaveText(label('en'))
    expect(problems).toEqual([])
  })

  test('switches language offline once the app is cached', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'es-ES', serviceWorkers: 'allow' })
    const page = await context.newPage()
    await controlled(page)
    await context.setOffline(true)
    await page.reload()
    await pick(page, 'uk')
    await pick(page, 'eu')
    await context.close()
  })
})
