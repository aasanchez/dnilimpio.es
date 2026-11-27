// SPDX-License-Identifier: AGPL-3.0-or-later
// Prerendered start screen (ADR 0040): the served index.html already holds the Spanish start screen,
// for search engines, link previews and a first paint before any script runs. The live app replaces
// it on start; it is never doubled, and it never answers a tap.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>
const es = dict('es')
const en = dict('en')

test('the served HTML holds the Spanish start screen as text', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const main = /<main id="app"[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? ''
  expect(main).toMatch(/^<div inert data-prerendered /)
  expect(main).toMatch(new RegExp(`<h1[^>]*>${es['homeTitle'] ?? 'missing'}</h1>`))
  for (const key of ['kicker', 'homeLead', 'chipNoServer', 'chipOffline', 'chipOpenSource', 'chipNoAccount', 'start', 'startHint']) {
    expect(main, key).toContain(es[key])
  }
  // Plain HTML: no script, no style, no event handler (the CSP and rule 3 hold).
  expect(main).not.toMatch(/<script|<style|\sstyle=|\son[a-z]+=|<!--/i)
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('the start screen shows in Spanish', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText(es['homeTitle'] ?? '')
    await expect(page.locator('#start')).toBeVisible()
    await expect(page.locator('[data-prerendered]')).toHaveAttribute('inert', '')
  })
})

test.describe('a Spanish browser', () => {
  test.use({ locale: 'es-ES' })
  test('the app replaces the copy: one screen, and Start works', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-prerendered]')).toHaveCount(0)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('#start')).toHaveCount(1)
    await page.locator('#start').click()
    await expect(page.locator('#start')).toHaveCount(0)
  })
})

test.describe('an English browser', () => {
  test.use({ locale: 'en-US' })
  test('the app starts in English and no Spanish copy remains', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText(en['homeTitle'] ?? '')
    await expect(page.locator('[data-prerendered]')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(es['homeLead'] ?? '')
  })
})

test('before the app starts, a tap on the copy does nothing', async ({ page }) => {
  // Holds the app's entry script: only the served HTML is in the page.
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => { await held; await route.continue() })
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('h1')).toHaveText(es['homeTitle'] ?? '')
  // inert: the button cannot be focused or pressed.
  await page.locator('#start').focus()
  expect(await page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('start')
  release()
  await expect(page.locator('[data-prerendered]')).toHaveCount(0)
  await expect(page.locator('#start')).toBeEnabled()
})
