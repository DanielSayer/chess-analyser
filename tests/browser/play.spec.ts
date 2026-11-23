import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/*
 * Over-the-board play. No network mocks are needed: the page never calls
 * Chess.com. Grades and the evaluation bar come from the real Stockfish worker.
 */

const SHOTS = '.artifacts/screens'

function board(page: Page) {
  return page.getByTestId('play-board')
}

async function play(page: Page, ...moves: string[]) {
  for (const move of moves) {
    const piece = board(page).locator(`[data-square="${move.slice(0, 2)}"] [data-piece]`)
    await piece.click()
    await board(page).locator(`[data-square="${move.slice(2, 4)}"]`).click()
    await expect(board(page).locator(`[data-square="${move.slice(2, 4)}"] [data-piece]`)).toBeVisible()
  }
}

async function openPlay(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(board(page)).toBeVisible()
}

/** Seeds a saved game. Only the move list matters; it is replayed and checked on load. */
async function seed(page: Page, ucis: string[], settings: Record<string, unknown> = {}) {
  await page.addInitScript(([moves, extra]) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('chess-analyser:play', JSON.stringify({ version: 1, plies: (moves as string[]).map(uci => ({ uci })), manualEnd: null, evaluations: [], settings: extra }))
  }, [ucis, settings] as const)
}

test('plays both sides with live grades, history, flipping and undo', async ({ page }) => {
  await openPlay(page)
  await expect(page.getByRole('status').filter({ hasText: 'White to move' })).toBeVisible()
  await play(page, 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f3e5')

  // The real engine evaluates the position and grades each move.
  const bar = page.getByRole('meter', { name: 'Evaluation' })
  await expect(bar).toHaveAttribute('aria-valuetext', /White's view/, { timeout: 30_000 })
  const moves = page.getByRole('list', { name: 'Moves' })
  await expect(moves.getByRole('img', { name: 'Book' }).first()).toBeVisible({ timeout: 30_000 })
  await expect(moves.locator('.grade-badge')).toHaveCount(5, { timeout: 30_000 })
  await expect(page.locator('.insight__grade')).toBeVisible()
  // 3. Nxe5 drops a knight for a pawn.
  await expect(page.locator('.insight__grade')).toHaveText(/Mistake|Blunder|Inaccuracy/)
  await expect(page.locator('.insight')).toContainText('Best was')

  // Flip and keyboard flip.
  const a1 = () => board(page).locator('[data-square="a1"]').boundingBox()
  const bottom = (await a1())!.y
  await page.getByRole('button', { name: 'Flip board' }).click()
  expect((await a1())!.y).toBeLessThan(bottom)
  await page.keyboard.press('f')
  expect((await a1())!.y).toBe(bottom)

  // Viewing history is read-only until returning or branching.
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.replay-controls__position')).toHaveText('2… Nc6')
  await expect(page.getByText('Viewing an earlier position.')).toBeVisible()
  await page.getByRole('button', { name: 'Back to game' }).click()
  await expect(page.locator('.replay-controls__position')).toHaveText('3. Nxe5')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(board(page).locator('[data-square="f3"] [data-piece="wN"]')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'White to move' })).toBeVisible()

  // The game, its analysis and settings survive a reload.
  await page.reload()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(moves.locator('.move')).toHaveCount(4)
  await expect(moves.locator('.grade-badge')).toHaveCount(4)
})

test('auto-flip turns the board to the side to move and hiding analysis hides the bar and grades', async ({ page }) => {
  await openPlay(page)
  await page.getByText('Flip board after each move').click()
  const a1 = () => board(page).locator('[data-square="a1"]').boundingBox()
  const whiteBottom = (await a1())!.y
  await play(page, 'd2d4')
  await expect.poll(async () => (await a1())!.y).toBeLessThan(whiteBottom)
  await play(page, 'd7d5')
  await expect.poll(async () => (await a1())!.y).toBe(whiteBottom)

  await page.getByText('Engine analysis').click()
  await expect(page.getByRole('meter', { name: 'Evaluation' })).toHaveCount(0)
  await expect(page.locator('.grade-badge')).toHaveCount(0)
  await expect(page.getByText('Engine off.')).toBeVisible()
})

test('the engine button stops analysis, then catches up when turned back on', async ({ page }) => {
  await openPlay(page)
  const engine = page.getByRole('button', { name: 'Engine', exact: true })
  await expect(engine).toHaveAttribute('aria-pressed', 'true')
  await engine.click()
  await expect(engine).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Show best move' })).toBeDisabled()
  await play(page, 'e2e4', 'e7e5', 'd1h5')
  await expect(page.getByRole('meter', { name: 'Evaluation' })).toHaveCount(0)
  await expect(page.locator('.grade-badge')).toHaveCount(0)
  // Nothing after the start position (perhaps finished before switching off) was analysed.
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chess-analyser:play')!).evaluations.length)
  expect(saved).toBeLessThanOrEqual(1)

  await engine.click()
  await expect(page.getByRole('list', { name: 'Moves' }).locator('.grade-badge')).toHaveCount(3, { timeout: 30_000 })
  await expect(page.getByRole('meter', { name: 'Evaluation' })).toHaveAttribute('aria-valuetext', /White's view/)
})

test('sends the played game to the full review and back', async ({ page }) => {
  await openPlay(page)
  await expect(page.getByRole('button', { name: 'Review game' })).toBeDisabled()
  await play(page, 'f2f3', 'e7e5', 'g2g4', 'd8h4')
  await page.getByRole('button', { name: 'Review game' }).click()

  await expect(page.getByRole('heading', { name: 'Over-the-board game' })).toBeVisible()
  await expect(page.getByLabel('Analysis workspace').locator('.game-header__meta')).toContainText('Black won by checkmate')
  await expect(page.getByRole('link', { name: /Chess.com/ })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Quick' }).click()
  await page.getByRole('button', { name: 'Review game' }).click()
  await expect(page.getByTestId('accuracy-white')).toHaveText(/^\d+\.\d$/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: 'Critical moments' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/play-review.png` })

  // The game is still on the Play page, and reviewing again after Undo starts fresh.
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('button', { name: 'Review game' }).click()
  await expect(page.getByLabel('Analysis workspace').locator('.game-header__meta')).toContainText('Game in progress')
  await expect(page.getByTestId('accuracy-white')).toHaveCount(0)
})

test("ends on checkmate, then resignation and agreed draws can be taken back", async ({ page }) => {
  await openPlay(page)
  await play(page, 'f2f3', 'e7e5', 'g2g4', 'd8h4')
  await expect(page.getByRole('region', { name: 'Result' })).toContainText('0-1')
  // The checked king's square is highlighted, here and in earlier checks.
  await expect(board(page).locator('[data-check]')).toHaveCount(1)
  await expect(board(page).locator('[data-square="e1"] [data-check]')).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/play-check.png` })
  await expect(page.getByRole('status').filter({ hasText: 'Black wins by checkmate' })).toBeVisible()
  await expect(board(page).locator('[data-square="e2"] [data-piece]')).toHaveCount(1)
  await board(page).locator('[data-square="e2"]').click()
  await expect(board(page).locator('[data-hint]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(board(page).locator('[data-check]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Resign' }).click()
  await page.getByRole('button', { name: 'Black resigns' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'White wins by resignation' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.getByRole('button', { name: 'Draw' }).click()
  await page.getByRole('button', { name: 'Agree draw' }).click()
  await expect(page.getByRole('region', { name: 'Result' })).toContainText('½-½')

  await page.getByRole('button', { name: 'New game' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'White to move' })).toBeVisible()
  await expect(page.getByText('The scoresheet fills in as you play.')).toBeVisible()
})

test('promotes to the chosen piece', async ({ page }) => {
  await seed(page, ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6'])
  await openPlay(page)
  await board(page).locator('[data-square="b7"] [data-piece]').click()
  await board(page).locator('[data-square="a8"]').click()
  const picker = page.getByRole('dialog', { name: 'Choose a promotion piece' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: 'Knight' }).click()
  await expect(board(page).locator('[data-square="a8"] [data-piece="wN"]')).toBeVisible()
  await expect(page.locator('.replay-controls__position')).toHaveText('5. bxa8=N')
})

test('explored lines in the review promote to the chosen piece', async ({ page }) => {
  await seed(page, ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6'])
  await openPlay(page)
  await page.getByRole('button', { name: 'Review game' }).click()
  const reviewBoard = page.getByTestId('board')
  await page.keyboard.press('End')
  await reviewBoard.locator('[data-square="b7"] [data-piece]').click()
  await reviewBoard.locator('[data-square="a8"]').click()
  const picker = page.getByRole('dialog', { name: 'Choose a promotion piece' })
  await expect(picker).toBeVisible()
  // Escape closes the picker first and leaves the board unchanged.
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(reviewBoard.locator('[data-square="b7"] [data-piece="wP"]')).toBeVisible()

  await reviewBoard.locator('[data-square="b7"] [data-piece]').click()
  await reviewBoard.locator('[data-square="a8"]').click()
  await picker.getByRole('button', { name: 'Rook' }).click()
  await expect(reviewBoard.locator('[data-square="a8"] [data-piece="wR"]')).toBeVisible()
  await expect(page.getByLabel('Explored line')).toContainText('bxa8=R')
})

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'tablet', width: 1024, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`play page fits ${viewport.name} without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await seed(page, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'f6d5', 'g5f7'])
    await openPlay(page)
    await expect(page.getByRole('list', { name: 'Moves' }).locator('.grade-badge')).toHaveCount(11, { timeout: 60_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${SHOTS}/play-${viewport.name}.png`, fullPage: true })
  })
}
