import { describe, expect, it } from 'vitest'
import { parseGame, lineToSan } from '../../src/core/game'
import { accuracyForLoss, buildReview, gradeMove, winningChance } from '../../src/core/review'
import { isReviewForGame } from '../../src/core/storage'
import type { PositionEvaluation } from '../../src/core/types'
import { TEST_GAME } from '../fixtures/games'

describe('game review', () => {
  it('preserves every position, player side and PGN clock', () => {
    const parsed = parseGame(TEST_GAME.pgn)
    expect(parsed.plies.map(ply => ply.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#'])
    expect(parsed.plies[0]).toMatchObject({ ply: 1, side: 'white', clock: '0:04:58', legalMoves: 20 })
    expect(parsed.plies[3].side).toBe('black')
  })

  it('converts engine lines to legal SAN and stops at invalid continuations', () => {
    expect(lineToSan(parseGame(TEST_GAME.pgn).initialFen, ['e2e4', 'e7e5', 'invalid'])).toEqual(['e4', 'e5'])
  })

  it('grades winning-chance losses symmetrically and never gives accuracy above 100', () => {
    expect(winningChance(0)).toBe(50)
    expect(winningChance(200) + winningChance(-200)).toBeCloseTo(100)
    expect(accuracyForLoss(-5)).toBe(100)
    expect(accuracyForLoss(100)).toBeGreaterThanOrEqual(0)
    expect(gradeMove(20, false)).toBe('blunder')
    expect(gradeMove(20, true)).toBe('best')
    expect(gradeMove(20, false, true)).toBe('forced')
  })

  function positions(): PositionEvaluation[] {
    const parsed = parseGame(TEST_GAME.pgn)
    return [parsed.initialFen, ...parsed.plies.map(ply => ply.after)].map((fen, i) => ({
      fen, centipawns: [0, -100, -50, -100000, -100000][i], mate: i >= 3 ? -1 : null,
      depth: 10, moves: [], lines: [], bestMove: ['e2e4', 'e7e5', 'e2e4', 'd8h4', null][i],
    }))
  }

  it('attributes a White blunder to White, protects engine-best moves from search noise and finds the turning point', () => {
    const review = buildReview(TEST_GAME, positions(), 'quick')
    expect(review.moves[2].grade).toBe('blunder')
    expect(review.moves[1]).toMatchObject({ grade: 'best', accuracy: 100, winningChanceLoss: 0 })
    expect(review.black.accuracy).toBe(100)
    expect(review.white.counts.blunder).toBe(1)
    expect(review.criticalPlies[0]).toBe(3)
    expect(isReviewForGame(review, TEST_GAME)).toBe(true)
    expect(isReviewForGame(review, { ...TEST_GAME, pgn: TEST_GAME.pgn + '\n' })).toBe(false)
  })

  it('rejects mismatched positions instead of attaching scores to the wrong move', () => {
    const evaluation = positions()
    evaluation[2].fen = evaluation[1].fen
    expect(() => buildReview(TEST_GAME, evaluation)).toThrow('do not match')
  })
})
