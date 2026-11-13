import { describe, expect, it } from 'vitest'
import { parseGame, lineToSan } from '../../src/core/game'
import { accuracyForLoss, buildReview, gradeMove, winningChance } from '../../src/core/review'
import { isBookPosition, loadOpeningBook } from '../../src/core/book'
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

  it("uses Chess.com's expected-points bands", () => {
    expect([1.9, 2, 4.9, 5, 9.9, 10, 19.9, 20].map(loss => gradeMove(loss, false)))
      .toEqual(['excellent', 'good', 'good', 'inaccuracy', 'inaccuracy', 'mistake', 'mistake', 'blunder'])
  })

  function evaluate(pgn: string, centipawns: number[]): { game: typeof TEST_GAME; positions: PositionEvaluation[] } {
    const parsed = parseGame(pgn)
    const fens = [parsed.initialFen, ...parsed.plies.map(ply => ply.after)]
    return {
      game: { ...TEST_GAME, pgn },
      positions: fens.map((fen, i) => ({ fen, centipawns: centipawns[i], mate: null, depth: 10, moves: [], lines: [], bestMove: null })),
    }
  }

  it('grades opening theory as book until the game leaves it', async () => {
    const book = await loadOpeningBook()
    expect(isBookPosition(book, parseGame('1. e4 d5').plies[1].after)).toBe(true)
    // 1...d5 drops ~4 points of winning chance at shallow depth: theory, not an inaccuracy.
    // 3. h4 leaves the book; 3...Qe5+ is not theory after it either.
    const { game, positions } = evaluate('1. e4 d5 2. exd5 Qxd5 3. h4 Qe5+', [20, 30, 90, 80, 80, 20, 20])
    const review = buildReview(game, positions, 'quick', book)
    expect(review.moves.map(move => move.grade)).toEqual(['book', 'book', 'book', 'book', 'inaccuracy', 'excellent'])
    expect(review.moves[1]).toMatchObject({ accuracy: 100, winningChanceLoss: 0 })
    expect(review.white.counts.book).toBe(2)
  })

  it("still grades a costly book move, so named traps like Fool's Mate are blunders", async () => {
    const book = await loadOpeningBook()
    const review = buildReview(TEST_GAME, positions(), 'quick', book)
    expect(review.moves.map(move => move.grade)).toEqual(['book', 'book', 'blunder', 'best'])
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
