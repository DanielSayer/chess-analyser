import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { PLAYER, mockChessCom } from '../fixtures/ui-games'

/*
 * src/heroui.css imports only the HeroUI components the app uses. Every class
 * rendered on each screen and popup that the full HeroUI stylesheet styles
 * must still have a rule. Chess.com responses are MOCKED; the engine is real.
 */
test('trimmed HeroUI stylesheet covers every rendered component', async ({ page }) => {
  test.setTimeout(180_000)
  await mockChessCom(page)
  const seen = new Set<string>()
  const grab = async () => { for (const c of await page.evaluate(() => [...document.querySelectorAll('*')].flatMap(el => [...el.classList]))) seen.add(c) }
  await page.goto('/')
  await grab()
  await page.getByLabel('Chess.com username').fill(PLAYER)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('option').first().waitFor()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await grab()
  // Opens a popup, records its classes and closes it again.
  const popup = async (role: 'dialog' | 'listbox' | 'alertdialog', open: () => Promise<void>, close = () => page.keyboard.press('Escape')) => {
    const before = await page.getByRole(role).count()
    await open()
    await expect(page.getByRole(role)).toHaveCount(before + 1)
    await page.waitForTimeout(300)
    await grab()
    await close()
    await expect(page.getByRole(role)).toHaveCount(before)
  }
  await popup('listbox', () => page.getByRole('button', { name: 'Time control' }).click())
  await popup('dialog', () => page.getByRole('button', { name: 'About Chess Analyser' }).first().click())
  await page.getByRole('option').first().click()
  await page.getByTestId('board').waitFor()
  await page.getByRole('radio', { name: 'Quick' }).click()
  await page.getByRole('button', { name: 'Review game' }).click()
  await page.waitForTimeout(800); await grab()
  await page.getByTestId('accuracy-white').waitFor({ timeout: 90_000 })
  await grab()
  await page.getByRole('tab', { name: 'Moves' }).click(); await grab()
  await page.getByRole('tab', { name: 'Summary' }).click()
  await popup('dialog', () => page.getByRole('button', { name: 'How accuracy is calculated' }).click())
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByTestId('play-board').waitFor()
  await grab()
  const playBoard = page.getByTestId('play-board')
  await playBoard.locator('[data-square="e2"] [data-piece]').click()
  await playBoard.locator('[data-square="e4"]').click()
  await grab()
  await popup('alertdialog', () => page.getByRole('button', { name: 'Resign' }).click())

  const ruleClasses = (css: string) => new Set([...css.matchAll(/\.((?:[a-zA-Z0-9_-]|\\.)+)/g)].map(m => m[1].replace(/\\/g, '')))
  const full = ruleClasses(readFileSync('node_modules/@heroui/styles/dist/heroui.min.css', 'utf8'))
  const ours = ruleClasses((await page.evaluate(() => [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText) } catch { return [] } }).join('\n'))))
  const missing = [...seen].filter(c => full.has(c) && !ours.has(c))
  expect(seen.size).toBeGreaterThan(200)
  expect(missing).toEqual([])
})
