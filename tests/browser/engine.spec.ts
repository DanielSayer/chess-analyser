import { expect, test } from '@playwright/test'
import { TEST_GAME } from '../fixtures/games'

test('the actual WASM worker analyses a game, persists it, and cancels without a partial report', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async game => {
    // Exercise the same application service and shipped worker as the UI.
    // @ts-expect-error Vite serves this module directly in this browser-only test.
    const core = await import('/src/core/index.ts')
    const progress: number[] = []
    const review = await core.analyseGame(game, { preset: 'quick', onProgress: (value: { percent: number }) => progress.push(value.percent) })
    await core.saveReview(review)
    const restored = await core.loadReview(game)
    const controller = new AbortController()
    const pending = core.analyseGame(game, { preset: 'deep', signal: controller.signal })
    controller.abort()
    let cancelled = false
    try { await pending } catch (error) { cancelled = (error as Error).name === 'AbortError' }
    return {
      moves: review.moves.length,
      evaluations: review.positions.length,
      finalMate: review.positions.at(-1).mate,
      finalScore: review.positions.at(-1).centipawns,
      bestMove: review.positions[0].bestMove,
      saved: restored?.createdAt === review.createdAt,
      cancelled,
      progress,
    }
  }, TEST_GAME)
  expect(result.moves).toBe(4)
  expect(result.evaluations).toBe(5)
  expect(result.finalMate).toBe(-1)
  expect(result.finalScore).toBeLessThan(0)
  expect(result.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]/)
  expect(result.saved).toBe(true)
  expect(result.cancelled).toBe(true)
  expect(result.progress.at(-1)).toBe(100)
})
