// SPDX-License-Identifier: AGPL-3.0-or-later
// Keyboard only: the whole flow works with Tab, Enter, Space and the arrow keys, in Spanish and in
// Arabic (right to left). Every screen change moves focus to the new heading, every focused control
// shows a focus ring, and focus never falls back to the page when a control disables or removes
// itself (WCAG 2.1.1, 2.4.3, 2.4.7).
import { expect, test, type Page } from '@playwright/test'
import { blockModel, fixture } from './helpers.ts'

/** What holds focus, for error messages: tag, id and the start of its text. */
async function focused (page: Page): Promise<string> {
  return await page.evaluate(() => {
    const e = document.activeElement
    if (e === null || e === document.body) return 'BODY'
    return `${e.tagName.toLowerCase()}#${e.id} "${e.textContent.trim().slice(0, 30)}"`
  })
}

/** Presses Tab until the control matching `selector` has focus; fails with the path taken. */
async function tabTo (page: Page, selector: string, max = 60): Promise<void> {
  const path: string[] = []
  for (let i = 0; i < max; i++) {
    if (await page.locator(selector).evaluate((e) => e === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
    path.push(await focused(page))
  }
  throw new Error(`Tab never reached ${selector}: ${path.join(' → ')}`)
}

/** Focus is on a control, not lost on the page body. */
async function expectFocusHeld (page: Page, what: string): Promise<void> {
  await expect.poll(async () => await focused(page), { message: `focus after ${what}` }).not.toBe('BODY')
}

/**
 * Answers file choosers with the given fixtures, in order. Set up before the page loads: a listener
 * added just before the key press can miss the first chooser.
 */
function answerChoosers (page: Page, names: string[]): void {
  page.on('filechooser', (chooser) => {
    const name = names.shift()
    if (name !== undefined) void chooser.setFiles(fixture(name))
  })
}

/** Opens the file chooser with the keyboard; answerChoosers() picks the file. */
async function chooseWithKeys (page: Page): Promise<void> {
  await tabTo(page, '#drop-choose')
  await page.keyboard.press('Enter')
}

/**
 * Tabs through every control on the screen once and returns those without a visible focus ring:
 * no outline and no box shadow on the control, or on the label around a hidden input.
 */
async function withoutFocusRing (page: Page): Promise<string[]> {
  const missing: string[] = []
  const seen = new Set<string>()
  await page.locator('body').evaluate((b) => { b.tabIndex = -1; b.focus(); b.removeAttribute('tabindex') })
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null
      if (e === null || e === document.body) return null
      const ring = (el: Element): boolean => {
        const s = getComputedStyle(el)
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || s.boxShadow !== 'none'
      }
      const label = e.closest('label')
      const key = `${e.tagName.toLowerCase()}#${e.id}`
      return { key, ok: ring(e) || (label !== null && ring(label)) }
    })
    if (r === null || seen.has(r.key)) break
    seen.add(r.key)
    if (!r.ok) missing.push(r.key)
  }
  return missing
}

for (const { lang, locale, dir } of [{ lang: 'es', locale: 'es-ES', dir: 'ltr' }, { lang: 'ar', locale: 'ar', dir: 'rtl' }] as const) {
  test.describe(`keyboard only (${lang})`, () => {
    test.use({ locale })

    test('the whole flow, from the start button to the PDF, works with keys alone', async ({ page }) => {
      test.setTimeout(90_000)
      await blockModel(page)
      answerChoosers(page, ['synthetic-front.png', 'synthetic-back.png'])
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('dir', dir)
      expect(await withoutFocusRing(page), 'start screen controls without a focus ring').toEqual([])

      await tabTo(page, '#start')
      await page.keyboard.press('Enter')
      await expect(page.locator('.content h2')).toBeFocused()

      // Photos: the file chooser opens from the keyboard; after the second photo, focus moves to
      // Continue instead of falling back to the page.
      await chooseWithKeys(page)
      await expect(page.locator('#status-front')).not.toBeEmpty()
      await expectFocusHeld(page, 'the front photo')
      await chooseWithKeys(page)
      await expect(page.locator('#capture-continue')).toBeFocused()
      expect(await withoutFocusRing(page), 'photo step controls without a focus ring').toEqual([])
      await tabTo(page, '#capture-continue')
      await page.keyboard.press('Enter')

      // Document: a radio group, chosen with Space.
      await expect(page.locator('#doc-title')).toBeFocused()
      await tabTo(page, '#doc-dni')
      await page.keyboard.press('Space')
      await expect(page.locator('#doc-dni')).toBeChecked()
      await tabTo(page, '#doc-continue')
      await page.keyboard.press('Enter')

      // Editor: the straightening ends here, with focus on the heading.
      await expect(page.locator('#preview')).toHaveJSProperty('width', 1712, { timeout: 30_000 })
      await expect(page.locator('.content h2')).toBeFocused()
      expect(await withoutFocusRing(page), 'editor controls without a focus ring').toEqual([])
      await tabTo(page, '#field-dateOfBirth')
      const before = await page.locator('#field-dateOfBirth').isChecked()
      await page.keyboard.press('Space')
      await expect(page.locator('#field-dateOfBirth')).toBeChecked({ checked: !before })

      // Tool tabs, then a box added and nudged with the arrow keys.
      await tabTo(page, '#tool-boxes')
      await page.keyboard.press('Enter')
      await expect(page.locator('#panel-boxes')).toBeVisible()
      await tabTo(page, '#add-box')
      await page.keyboard.press('Enter')
      await expect(page.locator('#preview')).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(page.locator('#panel-boxes .count')).toContainText('1')

      // Watermark text typed in.
      await tabTo(page, '#tool-mark')
      await page.keyboard.press('Enter')
      await tabTo(page, '#watermark')
      await page.keyboard.type('Solo para X')

      // Corners: open, nudge a corner with the arrows, and come back.
      await tabTo(page, '#adjust-front')
      await page.keyboard.press('Enter')
      await expect(page.locator('.content h2')).toBeFocused()
      expect(await withoutFocusRing(page), 'corner screen controls without a focus ring').toEqual([])
      await tabTo(page, 'canvas.corner-editor')
      await page.keyboard.press('ArrowRight')
      await tabTo(page, '#align-continue')
      await page.keyboard.press('Enter')
      await expect(page.locator('#preview')).toHaveJSProperty('width', 1712, { timeout: 30_000 })
      await expect(page.locator('.content h2')).toBeFocused()

      // Review: confirm with Space, download with Enter; focus stays on the button.
      await tabTo(page, '#review')
      await page.keyboard.press('Enter')
      await expect(page.locator('#review-title')).toBeFocused()
      await tabTo(page, '#review-confirm')
      await page.keyboard.press('Space')
      await tabTo(page, '#download')
      const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])
      expect(download.suggestedFilename()).toBe('protected-document.pdf')
      await expect(page.locator('#stats-link')).toBeVisible()
      await expect(page.locator('#download')).toBeFocused()
      expect(await withoutFocusRing(page), 'review controls without a focus ring').toEqual([])
    })
  })
}

test.describe('keyboard focus is never lost', () => {
  test.use({ locale: 'es-ES' })

  test('Delete, Undo and Redo keep focus when they disable themselves', async ({ page }) => {
    await blockModel(page)
    await page.goto('/')
    await page.locator('#start').click()
    await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
    await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
    await page.locator('#capture-continue').click()
    await page.locator('#doc-dni').check()
    await page.locator('#doc-continue').click()
    await expect(page.locator('#preview')).toHaveJSProperty('width', 1712, { timeout: 30_000 })

    await page.locator('#tool-boxes').click()
    await page.locator('#add-box').click()
    // The new box is selected: Delete removes it, then disables itself. Focus goes to Undo.
    await page.locator('#delete-box').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#delete-box')).toBeDisabled()
    await expect(page.locator('#undo')).toBeFocused()
    // Undo back to the start of the history: Undo disables itself, focus goes to Redo.
    while (await page.locator('#undo').isEnabled()) await page.keyboard.press('Enter')
    await expect(page.locator('#redo')).toBeFocused()
    // Redo to the end: Redo disables itself, focus goes to Undo.
    while (await page.locator('#redo').isEnabled()) await page.keyboard.press('Enter')
    await expect(page.locator('#undo')).toBeFocused()
  })

  test('Remove the photo of the back keeps focus on the photo step', async ({ page }) => {
    await blockModel(page)
    await page.goto('/')
    await page.locator('#start').click()
    await page.locator('#file-front').setInputFiles(fixture('synthetic-front.png'))
    await page.locator('#file-back').setInputFiles(fixture('synthetic-back.png'))
    await page.locator('#capture-remove-back').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#capture-remove-back')).toHaveCount(0)
    await expect(page.locator('#drop-choose')).toBeFocused()
  })

  test('Escape closes the card guide and returns focus to the button that opened it', async ({ page }) => {
    await page.goto('/')
    await tabTo(page, '#guide-open')
    await page.keyboard.press('Enter')
    await expect(page.locator('dialog.guide')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog.guide')).toBeHidden()
    await expect(page.locator('#guide-open')).toBeFocused()
  })
})
