// SPDX-License-Identifier: AGPL-3.0-or-later
// Document picker: each document brings its own fields, shape and warnings.
import { expect, test } from '@playwright/test'
import { loadBoth, toEditor } from './helpers.ts'

test.use({ locale: 'es-ES' })

test('EU registration certificate: own card shape, no CAN and no MRZ', async ({ page }) => {
  await toEditor(page, 'eu-registration')
  await expect(page.locator('#preview')).toHaveJSProperty('height', 1060)
  await expect(page.locator('#hidden-count')).toHaveText('2 de 6')
  await expect(page.locator('#field-can')).toHaveCount(0)
  await expect(page.locator('#can-warning')).toHaveCount(0)
  await expect(page.locator('#field-issueDate')).toBeChecked()
  await expect(page.locator('#field-address')).not.toBeChecked()
  await page.locator('#tab-back').click()
  await expect(page.locator('#field-supportNumber')).toBeChecked()
  await expect(page.locator('#field-mrz')).toHaveCount(0)
  await page.locator('#field-supportNumber').uncheck()
  await expect(page.locator('#mrz-warning')).toHaveCount(0)
})

test('TIE: permit type is a field, the hint names the document', async ({ page }) => {
  await toEditor(page, 'tie')
  await expect(page.locator('#hidden-count')).toHaveText('6 de 10')
  await expect(page.locator('#field-permitType')).not.toBeChecked()
  await expect(page.locator('#panel-fields')).toContainText('TIE (tarjeta de extranjero)')
  await page.locator('#field-permitType').check()
  await expect(page.locator('#hidden-count')).toHaveText('7 de 10')
})

test('DNI 3.0 reaches the editor with ID-1 size and its own fields', async ({ page }) => {
  await toEditor(page, 'dni-3.0')
  await expect(page.locator('#preview')).toHaveJSProperty('height', 1080)
  await expect(page.locator('#hidden-count')).toHaveText('6 de 10')
  await expect(page.locator('#panel-fields')).toContainText('DNI 3.0')
})

test('changing the document keeps the photos; Back without Continue keeps the old choice', async ({ page }) => {
  await loadBoth(page)
  await page.locator('#back').click()
  await expect(page.locator('h2')).toHaveText('¿Qué documento vas a copiar?')
  await page.locator('#doc-tie').check()
  await page.locator('#doc-continue').click()
  await expect(page.locator('#status-front')).toHaveText('Imagen cargada.')
  await expect(page.locator('#capture-continue')).toBeEnabled()
  // Going back without continuing keeps the previous choice.
  await page.locator('#back').click()
  await expect(page.locator('#doc-tie')).toBeChecked()
  await page.locator('#doc-eu-registration').check()
  await page.locator('#back').click()
  await page.locator('#start').click()
  await expect(page.locator('#doc-tie')).toBeChecked()
})
