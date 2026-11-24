import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PLAYER, mockChessCom } from '../fixtures/ui-games'

/*
 * Practise. Chess.com responses are MOCKED (synthetic games); the review and
 * answer checks use the real Stockfish worker.
 */

const SHOTS = '.artifacts/screens'

function board(page: Page) {
  return page.getByTestId('practice-board')
}

/** Reads a stored review straight from IndexedDB, to know the engine's answer. */
async function storedMove(page: Page, puzzleId: string): Promise<{ bestMove: string; uci: string }> {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const [gameId, ply] = [id.slice(0, id.lastIndexOf(':')), Number(id.slice(id.lastIndexOf(':') + 1))]
    const open = indexedDB.open('chess-analyser')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const get = open.result.transaction('reviews').objectStore('reviews').get(gameId)
      get.onsuccess = () => { const move = get.result.moves[ply - 1]; open.result.close(); resolve({ bestMove: move.bestMove, uci: move.uci }) }
      get.onerror = () => reject(get.error)
    }
  }), puzzleId)
}

async function play(page: Page, uci: string) {
  await board(page).locator(`[data-square="${uci.slice(0, 2)}"] [data-piece]`).click()
  await board(page).locator(`[data-square="${uci.slice(2, 4)}"]`).click()
}

/**
 * Imports the mocked games, then saves a review of the Sicilian with known
 * scores: White's 11th move is a blunder and every other move loses nothing.
 * Engine grades vary with machine load, so the puzzle itself is fixed here.
 */
async function seedSicilianReview(page: Page) {
  await mockChessCom(page)
  await page.goto('/')
  await page.getByLabel('Chess.com username').fill(PLAYER)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByRole('option', { name: /against rook_lift/ })).toBeVisible()
  await page.evaluate(async () => {
    const { parseGame } = await import('/src/core/game.ts')
    const { buildReview } = await import('/src/core/review.ts')
    const { loadGames, saveReview } = await import('/src/core/storage.ts')
    const { playMove } = await import('/src/core/play.ts')
    const game = (await loadGames('fixture_player')).find(g => g.id === 'g-1001')!
    const parsed = parseGame(game.pgn)
    const blunder = 20 // index of ply 21, White's 11th move
    const squares = [...'abcdefgh'].flatMap(f => [...'12345678'].map(r => f + r))
    const before = parsed.plies[blunder].before
    let best = ''
    for (const from of squares) for (const to of squares) {
      const ply = best ? null : playMove(before, 1, { from, to })
      if (ply && ply.uci !== parsed.plies[blunder].uci && !ply.uci[4]) best = ply.uci
    }
    const fens = [parsed.initialFen, ...parsed.plies.map(ply => ply.after)]
    const positions = fens.map((fen, i) => ({
      fen, centipawns: i <= blunder ? 0 : -600, mate: null, depth: 12, moves: i === blunder ? [best] : [],
      lines: [], bestMove: i === blunder ? best : i < parsed.plies.length ? parsed.plies[i].uci : null,
    }))
    await saveReview(buildReview(game, positions, 'quick'))
  })
}

test('shows how to get positions when nothing has been reviewed', async ({ page }) => {
  await page.goto('/#practise')
  await expect(page.getByRole('heading', { name: 'No positions to practise yet' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/practise-empty.png` })
  await page.getByRole('button', { name: 'Your games', exact: true }).last().click()
  await expect(page.getByLabel('Chess.com username')).toBeVisible()
})

test("practises the player's own mistakes, keeps progress and links back to the review", async ({ page }) => {
  test.setTimeout(120_000)
  await seedSicilianReview(page)
  await page.getByRole('button', { name: 'Practise', exact: true }).first().click()
  await expect(board(page)).toBeVisible()
  const progress = page.getByLabel('Progress')
  const task = page.getByLabel('The position')
  const note = page.getByLabel('Your answer')
  await expect(task).toContainText('Find a better move for White (you)')
  await expect(board(page)).toHaveAttribute('data-puzzle', 'g-1001:21')
  const id = 'g-1001:21'
  const ply = 21
  await expect(progress.locator('div').filter({ hasText: 'Positions' }).locator('dd')).toHaveText('1')
  const { bestMove, uci } = await storedMove(page, id)

  // The game's move is wrong without a search; the hint points at the right piece.
  await play(page, uci)
  await expect(note).toContainText('is the move from the game')
  await page.getByRole('button', { name: 'Hint' }).click()
  await expect(board(page).locator(`[data-square="${bestMove.slice(0, 2)}"] [data-pointed]`)).toHaveCount(1)
  await play(page, bestMove)
  await expect(note).toContainText('Best move')
  await expect(page.getByRole('status').filter({ hasText: 'Position done' })).toBeVisible()
  // Wrong first, so it is not counted as solved.
  await expect(progress).toContainText('This session: 0/1 solved')
  await page.screenshot({ path: `${SHOTS}/practise-solved-desktop.png` })

  // Try again, then solve it cleanly.
  await page.getByRole('button', { name: 'Try again' }).click()
  await play(page, bestMove)
  await expect(note).toContainText('Best move')

  // The game opens in the review at the mistake, and the review leads back here.
  await page.getByRole('button', { name: 'Open in review' }).click()
  const review = page.getByLabel('Analysis workspace')
  await expect(review.locator('.replay-controls__position')).toContainText(`${Math.ceil(ply / 2)}.`)
  await review.getByRole('button', { name: 'Practise' }).click()
  await expect(board(page)).toHaveAttribute('data-puzzle', id)

  // The solution is shown on request, and the next position follows.
  await page.getByRole('button', { name: 'Show solution' }).click()
  await expect(note).toContainText('The engine plays')
  await page.getByRole('button', { name: 'Next position' }).click()
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible()

  // Progress survives a reload.
  await page.reload()
  await expect(board(page)).toBeVisible()
  await expect(progress.locator('div').filter({ hasText: 'To retry' }).locator('dd')).toHaveText('1')

  // Any other legal move is checked by the real engine.
  const current = (await board(page).getAttribute('data-puzzle'))!
  const other = await page.evaluate(async ([fen, avoid]) => {
    const { playMove } = await import('/src/core/play.ts')
    const squares = [...'abcdefgh'].flatMap(f => [...'12345678'].map(r => f + r))
    for (const from of squares) for (const to of squares) {
      const ply = playMove(fen, 1, { from, to })
      if (ply && !avoid.includes(ply.uci) && !ply.uci[4]) return ply.uci
    }
    return null
  }, [await page.evaluate(id => new Promise<string>(resolve => {
    const open = indexedDB.open('chess-analyser')
    open.onsuccess = () => {
      const [gameId, ply] = [id.slice(0, id.lastIndexOf(':')), Number(id.slice(id.lastIndexOf(':') + 1))]
      const get = open.result.transaction('reviews').objectStore('reviews').get(gameId)
      get.onsuccess = () => { open.result.close(); resolve(get.result.moves[ply - 1].before) }
    }
  }), current), Object.values(await storedMove(page, current))] as const)
  expect(other).not.toBeNull()
  await play(page, other!)
  await expect(note).toContainText(/Try another move|Good enough|Best move/, { timeout: 30_000 })
})

for (const viewport of [{ name: 'tablet', width: 1024, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`practise fits ${viewport.name} without horizontal overflow`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await seedSicilianReview(page)
    await page.getByRole('button', { name: 'Practise', exact: true }).first().click()
    await expect(board(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${SHOTS}/practise-${viewport.name}.png`, fullPage: true })
  })
}
