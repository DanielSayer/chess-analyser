import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PLAYER, mockChessCom } from '../fixtures/ui-games'

/*
 * UI tests. Every Chess.com response here is MOCKED (see tests/fixtures/ui-games.ts).
 * Analysis uses the real Stockfish WASM worker shipped in public/engine.
 */

const SHOTS = '.artifacts/screens'

async function importPlayer(page: Page, username = PLAYER) {
  const field = page.getByLabel('Chess.com username')
  if (!(await field.isVisible())) await page.getByRole('button', { name: 'Change player', exact: true }).click()
  await field.fill(username)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
}

function gameOption(page: Page, opponent: string) {
  return page.getByRole('option', { name: new RegExp(`against ${opponent}`) })
}

test.describe('mocked Chess.com import', () => {
  test('imports, reviews with the real engine, replays and explores a line', async ({ page }) => {
    await mockChessCom(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Every game has a move worth a second look.' })).toBeVisible()
    await expect(page.getByTestId('board')).toHaveCount(0)
    await importPlayer(page)

    await expect(page.getByRole('heading', { name: PLAYER })).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(4)
    await expect(page.getByRole('button', { name: /Load older games/ })).toBeVisible()

    // Filters
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await page.getByRole('radio', { name: 'Won' }).click()
    await expect(page.getByRole('option')).toHaveCount(2)
    await page.getByLabel('Filter by opponent or opening').fill('hasty')
    await expect(page.getByRole('option')).toHaveCount(1)
    await page.getByLabel('Filter by opponent or opening').fill('')
    await page.getByRole('radio', { name: 'All' }).click()

    await gameOption(page, 'hasty_knight').click()
    await expect(page.getByRole('heading', { name: /Italian Game/ })).toBeVisible()

    // Keyboard replay before a review, and typing in a field does not move the board.
    const position = page.locator('.replay-controls__position')
    await expect(position).toHaveText('Start')
    await page.keyboard.press('ArrowRight')
    await expect(position).toHaveText('1. e4')
    await page.getByRole('button', { name: 'Your games', exact: true }).click()
    await page.getByRole('button', { name: 'Change player', exact: true }).click()
    await page.getByLabel('Chess.com username').press('ArrowRight')
    await page.getByRole('button', { name: 'Game review', exact: true }).click()
    await expect(position).toHaveText('1. e4')
    await page.getByRole('heading', { name: /Italian Game/ }).click()
    await page.keyboard.press('End')
    await expect(position).toHaveText('4. Qxf7#')
    const boardGrade = page.getByTestId('board').locator('.grade-badge')
    await expect(boardGrade).toHaveCount(0)

    await page.getByRole('radio', { name: 'Quick' }).click()
    await page.getByRole('button', { name: 'Review game' }).click()
    await expect(page.getByTestId('accuracy-white')).toHaveText(/^\d+\.\d$/, { timeout: 60_000 })
    await expect(page.getByTestId('accuracy-black')).toHaveText(/^\d+\.\d$/)
    await expect(page.getByRole('heading', { name: 'Critical moments' })).toBeVisible()
    await page.getByRole('button', { name: 'Your games', exact: true }).click()
    await expect(page.getByRole('option', { name: /against hasty_knight.*, reviewed/ })).toBeVisible()
    await page.getByRole('button', { name: 'Game review', exact: true }).click()

    // Black's 3... Nf6 allowed mate, so it is a critical moment.
    await page.getByRole('button', { name: /3… Nf6/ }).click()
    await expect(position).toHaveText('3… Nf6')
    await expect(page.getByLabel('Selected move')).toContainText('Blunder')
    await expect(page.locator('[data-square="f6"]').getByRole('img', { name: 'Blunder', exact: true })).toBeVisible()
    await expect(boardGrade).toHaveCount(1)
    await expect(page.locator('[data-square="f6"] [data-piece="bN"]')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/test-piece-grade-desktop.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(boardGrade).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/test-piece-grade-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })

    // The badge belongs to the played destination, including after flipping and stepping back.
    await page.getByRole('button', { name: 'Flip board' }).click()
    await expect(page.locator('[data-square="f6"]').getByRole('img', { name: 'Blunder', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Previous move' }).click()
    await expect(page.locator('[data-square="h5"] .grade-badge')).toBeVisible()
    await expect(page.locator('[data-square="h5"] [data-piece="wQ"]')).toBeVisible()
    await expect(page.locator('[data-square="f6"]').getByRole('img')).toHaveCount(0)
    await page.getByRole('button', { name: 'Next move' }).click()
    await expect(page.locator('[data-square="f6"]').getByRole('img', { name: 'Blunder', exact: true })).toBeVisible()
    await expect(page.locator('[data-square="f6"] [data-piece="bN"]')).toBeVisible()
    await page.getByRole('button', { name: 'Flip board' }).click()

    // Exploring an ungraded move hides the game's badge; returning restores it.
    await page.locator('[data-square="d2"]').click()
    await page.locator('[data-square="d4"]').click()
    await expect(page.getByText('Exploring')).toBeVisible()
    await expect(boardGrade).toHaveCount(0)
    await expect(page.locator('[data-square="d4"] [data-piece="wP"]')).toBeVisible()
    await page.getByRole('button', { name: 'Back to game' }).click()
    await expect(page.locator('[data-square="f6"]').getByRole('img', { name: 'Blunder', exact: true })).toBeVisible()

    // Clicking the evaluation graph jumps to a position.
    const graph = page.getByRole('slider', { name: 'Evaluation graph' })
    const box = (await graph.boundingBox())!
    await graph.click({ position: { x: 2, y: box.height / 2 } })
    await expect(position).toHaveText('Start')
    await expect(boardGrade).toHaveCount(0)

    // Explore a legal alternative and return to the game.
    await page.locator('[data-square="d2"]').click()
    await page.locator('[data-square="d4"]').click()
    await expect(page.getByText('Exploring')).toBeVisible()
    await expect(page.locator('.engine-lines__list li').first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Back to game' }).click()
    await expect(position).toHaveText('Start')

    await page.screenshot({ path: `${SHOTS}/test-review-desktop.png` })
  })

  test('restores saved games and reviews after reload without new requests', async ({ page }) => {
    const requests = await mockChessCom(page)
    await page.goto('/')
    await importPlayer(page)
    await gameOption(page, 'hasty_knight').click()
    await page.getByRole('radio', { name: 'Quick' }).click()
    await page.getByRole('button', { name: 'Review game' }).click()
    await expect(page.getByTestId('accuracy-white')).toBeVisible({ timeout: 60_000 })
    const accuracy = await page.getByTestId('accuracy-white').textContent()

    const before = requests.length
    await page.reload()
    await expect(page.getByRole('heading', { name: PLAYER })).toBeVisible()
    await expect(page.getByText('Saved on this device')).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(4)
    await gameOption(page, 'hasty_knight').click()
    await expect(page.getByTestId('accuracy-white')).toHaveText(accuracy!)
    await expect(page.getByRole('button', { name: 'Re-run' })).toBeVisible()
    expect(requests.length).toBe(before)
  })

  test('shows import errors near the form and keeps the current list', async ({ page }) => {
    await mockChessCom(page)
    await page.goto('/')
    await importPlayer(page, 'not a name!')
    await expect(page.getByText(/letters, numbers, underscores or hyphens/)).toBeVisible()

    await importPlayer(page)
    await expect(page.getByRole('option')).toHaveCount(4)

    await page.unrouteAll()
    await mockChessCom(page, { indexStatus: 404 })
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByText('Import failed')).toBeVisible()
    await expect(page.getByText(/could not be found/)).toBeVisible()
    await expect(page.getByText(/current list is unchanged/)).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(4)
  })

  test('loads older months on request', async ({ page }) => {
    await mockChessCom(page)
    await page.goto('/')
    await importPlayer(page)
    await expect(page.getByRole('option')).toHaveCount(4)
    await page.getByRole('button', { name: /Load older games/ }).click()
    await expect(page.getByRole('option')).toHaveCount(5)
    await expect(page.getByText('All archived months are loaded.')).toBeVisible()
  })

  test('a slow import for one player cannot replace a newer player', async ({ page }) => {
    // Registered after the general mock, so this slower handler wins for slow_player.
    await mockChessCom(page)
    await page.route('https://api.chess.com/pub/player/slow_player/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ archives: [] }),
      }).catch(() => undefined)
    })
    await page.goto('/')
    await importPlayer(page, 'slow_player')
    await expect(page.getByRole('status').filter({ hasText: 'Loading games for slow_player' })).toBeVisible()
    await page.getByRole('button', { name: /Cancel import/ }).click()
    await importPlayer(page)
    await expect(page.getByRole('heading', { name: PLAYER })).toBeVisible()
    await page.waitForTimeout(1800)
    await expect(page.getByRole('heading', { name: PLAYER })).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(4)
  })

  test('cancelling a rerun keeps the completed review', async ({ page }) => {
    await mockChessCom(page)
    await page.goto('/')
    await importPlayer(page)
    await gameOption(page, 'hasty_knight').click()
    await page.getByRole('radio', { name: 'Quick' }).click()
    await page.getByRole('button', { name: 'Review game' }).click()
    await expect(page.getByTestId('accuracy-white')).toBeVisible({ timeout: 60_000 })
    const accuracy = await page.getByTestId('accuracy-white').textContent()

    await page.getByRole('radio', { name: 'Deep' }).click()
    await page.getByRole('button', { name: 'Re-run' }).click()
    await expect(page.getByLabel('Review progress')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Review cancelled. Showing the previous review.')).toBeVisible()
    await expect(page.getByTestId('accuracy-white')).toHaveText(accuracy!)

    // Switching games during a run cancels it, and the new game starts clean.
    await page.getByRole('button', { name: 'Re-run' }).click()
    await page.getByRole('button', { name: 'Your games', exact: true }).click()
    await gameOption(page, 'rook_lift').click()
    await expect(page.getByRole('heading', { name: /Sicilian Defense/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review game' })).toBeVisible()
    await expect(page.getByLabel('Review progress')).toHaveCount(0)
  })

  test('keeps working in memory when browser storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Blocked', 'SecurityError') } })
    })
    await mockChessCom(page)
    await page.goto('/')
    await importPlayer(page)
    await expect(page.getByRole('option')).toHaveCount(4)
    await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible()

    await gameOption(page, 'hasty_knight').click()
    await page.getByRole('radio', { name: 'Quick' }).click()
    await page.getByRole('button', { name: 'Review game' }).click()
    await expect(page.getByTestId('accuracy-white')).toBeVisible({ timeout: 60_000 })
    const accuracy = await page.getByTestId('accuracy-white').textContent()

    // The completed review is still held for this session after switching games.
    await page.getByRole('button', { name: 'Your games', exact: true }).click()
    await gameOption(page, 'rook_lift').click()
    await expect(page.getByRole('button', { name: 'Review game' })).toBeVisible()
    await page.getByRole('button', { name: 'Your games', exact: true }).click()
    await gameOption(page, 'hasty_knight').click()
    await expect(page.getByTestId('accuracy-white')).toHaveText(accuracy!)
  })

  test('switches between light and dark themes and remembers the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const root = page.locator('html')
    await expect(root).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await expect(root).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(root).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'Switch to light theme' }).click()
    await expect(root).toHaveAttribute('data-theme', 'light')
  })

  for (const viewport of [{ name: 'wide', width: 1910, height: 1067 }, { name: 'desktop', width: 1440, height: 900 }, { name: 'tablet', width: 1024, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    test(`has no horizontal overflow on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await mockChessCom(page)
      await page.goto('/')
      await importPlayer(page)
      await expect(page.getByRole('option')).toHaveCount(4)
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(await overflow()).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `${SHOTS}/test-list-${viewport.name}.png`, fullPage: true })
      await gameOption(page, 'rook_lift').click()
      await expect(page.locator('[data-square="e4"]')).toBeVisible()
      expect(await overflow()).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `${SHOTS}/test-game-${viewport.name}.png`, fullPage: true })
    })
  }
})

