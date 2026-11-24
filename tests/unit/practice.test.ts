import { describe, expect, it } from 'vitest'
import { parseGame } from '../../src/core/game'
import { START_FEN, playMove } from '../../src/core/play'
import { collectPuzzles, judgeAttempt, orderPuzzles, recordResult, summarisePractice } from '../../src/core/practice'
import type { PracticeRecord, Puzzle } from '../../src/core/practice'
import { buildReview } from '../../src/core/review'
import type { PositionEvaluation } from '../../src/core/types'
import { TEST_GAME } from '../fixtures/games'

// 1. f3 e5 2. g4?? Qh4#: White (alice) blunders on ply 3; the engine preferred 2. e4.
function foolsMateReview(gameId = TEST_GAME.id, createdAt = '2026-01-02T00:00:00.000Z') {
  const parsed = parseGame(TEST_GAME.pgn)
  const positions = [parsed.initialFen, ...parsed.plies.map(ply => ply.after)].map((fen, i): PositionEvaluation => ({
    fen, centipawns: [0, -100, -50, -100000, -100000][i], mate: i >= 3 ? -1 : null,
    depth: 10, moves: [], lines: [], bestMove: ['e2e4', 'e7e5', 'e2e4', 'd8h4', null][i],
  }))
  return { ...buildReview({ ...TEST_GAME, id: gameId }, positions, 'quick'), createdAt }
}

function puzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    id: 'g:1', gameId: 'g', ply: 1, fen: START_FEN, side: 'white',
    played: { san: 'f3', uci: 'f2f3', grade: 'mistake' },
    bestMove: 'e2e4', bestSan: 'e4', bestLine: ['e4'],
    evaluation: { fen: START_FEN, centipawns: 30, mate: null, depth: 12, moves: ['e2e4'], lines: [], bestMove: 'e2e4' },
    previousMove: null, white: 'a', black: 'b', date: null, opening: null, local: false, reviewedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const move = (fen: string, from: string, to: string) => playMove(fen, 1, { from, to })!
const after = (fen: string, centipawns: number, mate: number | null = null): PositionEvaluation =>
  ({ fen, centipawns, mate, depth: 12, moves: [], lines: [], bestMove: null })

describe('practice positions', () => {
  it("takes only the player's own mistakes and blunders from imported games", () => {
    const review = foolsMateReview()
    expect(review.moves.map(m => m.grade)).toEqual(['inaccuracy', 'best', 'blunder', 'best'])
    const [found, ...rest] = collectPuzzles([review], 'Alice')
    expect(rest).toHaveLength(0)
    expect(found).toMatchObject({
      id: `${TEST_GAME.id}:3`, ply: 3, side: 'white', fen: review.moves[2].before,
      played: { san: 'g4', grade: 'blunder' }, bestMove: 'e2e4', bestSan: 'e4', previousMove: 'e7e5',
      white: 'alice', black: 'bob', date: '2026.01.01', local: false,
    })
    expect(found.evaluation).toBe(review.positions[2])
    // Inaccuracies are not practised; the opponent's moves and other players' games are skipped.
    expect(collectPuzzles([review], 'bob')).toEqual([])
    expect(collectPuzzles([review], 'carol')).toEqual([])
    expect(collectPuzzles([review], null)).toEqual([])
  })

  it('takes both sides of games played on this device', () => {
    const puzzles = collectPuzzles([foolsMateReview('local-1700000000000')], null)
    expect(puzzles.map(p => p.id)).toEqual(['local-1700000000000:3'])
    expect(puzzles[0].local).toBe(true)
  })
})

describe('judging answers', () => {
  it("knows the engine's move and the game's mistake without searching", () => {
    expect(judgeAttempt(puzzle(), move(START_FEN, 'e2', 'e4'))).toEqual({ status: 'correct', grade: 'best', san: 'e4' })
    expect(judgeAttempt(puzzle(), move(START_FEN, 'f2', 'f3'))).toEqual({ status: 'wrong', grade: 'mistake', san: 'f3' })
    expect(judgeAttempt(puzzle(), move(START_FEN, 'd2', 'd4'))).toEqual({ status: 'evaluate' })
  })

  it('accepts Good alternatives and rejects worse ones', () => {
    const d4 = move(START_FEN, 'd2', 'd4')
    expect(judgeAttempt(puzzle(), d4, after(d4.after, 25))).toMatchObject({ status: 'correct', grade: 'excellent', san: 'd4' })
    // ~4.6% winning chance and 50 cp lost: Good.
    expect(judgeAttempt(puzzle(), d4, after(d4.after, -20))).toMatchObject({ status: 'correct', grade: 'good' })
    expect(judgeAttempt(puzzle(), d4, after(d4.after, -150))).toMatchObject({ status: 'wrong', grade: 'mistake' })
  })

  it('requires keeping a forced mate', () => {
    const mating = puzzle({ evaluation: { ...puzzle().evaluation, centipawns: 100_000, mate: 3 } })
    const d4 = move(START_FEN, 'd2', 'd4')
    expect(judgeAttempt(mating, d4, after(d4.after, 100_000, 4))).toMatchObject({ status: 'correct' })
    expect(judgeAttempt(mating, d4, after(d4.after, 1500))).toMatchObject({ status: 'wrong', grade: 'mistake' })
  })
})

describe('practice order and progress', () => {
  it('counts first-time solves and orders new, then failed, then solved positions', () => {
    const first = recordResult(undefined, 'a', true, 1000)
    expect(first).toEqual({ id: 'a', attempts: 1, solved: 1, lastResult: 'solved', lastSeen: 1000 })
    expect(recordResult(first, 'a', false, 2000)).toEqual({ id: 'a', attempts: 2, solved: 1, lastResult: 'failed', lastSeen: 2000 })

    const older = '2026-01-01T00:00:00.000Z'
    const newer = '2026-02-01T00:00:00.000Z'
    const puzzles = [
      puzzle({ id: 'solved-old', reviewedAt: older }),
      puzzle({ id: 'solved-recent', reviewedAt: older }),
      puzzle({ id: 'failed', reviewedAt: older }),
      puzzle({ id: 'new-old-game:9', gameId: 'old', ply: 9, reviewedAt: older }),
      puzzle({ id: 'new-recent:12', gameId: 'recent', ply: 12, reviewedAt: newer }),
      puzzle({ id: 'new-recent:4', gameId: 'recent', ply: 4, reviewedAt: newer }),
    ]
    const records = new Map<string, PracticeRecord>([
      ['solved-recent', recordResult(undefined, 'solved-recent', true, 3000)],
      ['solved-old', recordResult(undefined, 'solved-old', true, 1000)],
      ['failed', recordResult(undefined, 'failed', false, 2000)],
    ])
    expect(orderPuzzles(puzzles, records).map(p => p.id))
      .toEqual(['new-recent:4', 'new-recent:12', 'new-old-game:9', 'failed', 'solved-old', 'solved-recent'])
    expect(summarisePractice(puzzles, records)).toEqual({ total: 6, fresh: 3, failed: 1, solved: 2 })
  })
})
