import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData, loadAllReviews, loadGames, loadLastUsername, loadPracticeRecords, loadReview, saveGames, saveLastUsername, savePracticeRecord, saveReview } from '../../src/core/storage'
import { recordResult } from '../../src/core/practice'
import { buildReview } from '../../src/core/review'
import { parseGame } from '../../src/core/game'
import { TEST_GAME } from '../fixtures/games'

beforeEach(async () => clearLocalData())

describe('local persistence', () => {
  it('isolates player game lists and remembers the selected username', async () => {
    await saveGames([TEST_GAME])
    await saveLastUsername(' Alice ')
    expect(await loadLastUsername()).toBe('alice')
    expect(await loadGames('alice')).toHaveLength(1)
    expect(await loadGames('bob')).toHaveLength(1)
    expect(await loadGames('carol')).toHaveLength(0)
  })

  it('restores only a complete review of the exact stored PGN', async () => {
    const parsed = parseGame(TEST_GAME.pgn)
    const review = buildReview(TEST_GAME, [parsed.initialFen, ...parsed.plies.map(ply => ply.after)].map(fen => ({
      fen, centipawns: 0, mate: null, depth: 10, moves: [], lines: [], bestMove: null,
    })))
    await saveReview(review)
    expect(await loadReview(TEST_GAME)).toEqual(review)
    expect(await loadReview({ ...TEST_GAME, pgn: 'changed' })).toBeNull()
    await clearLocalData()
    expect(await loadReview(TEST_GAME)).toBeNull()
  })

  it('regrades a stored pre-book review from its positions instead of discarding it', async () => {
    const parsed = parseGame(TEST_GAME.pgn)
    const legacy = { ...buildReview(TEST_GAME, [parsed.initialFen, ...parsed.plies.map(ply => ply.after)].map(fen => ({
      fen, centipawns: 0, mate: null, depth: 10, moves: [], lines: [], bestMove: null,
    }))), version: 1 as const, createdAt: '2026-01-01T00:00:00.000Z' }
    await saveReview(legacy)
    const restored = await loadReview(TEST_GAME)
    expect(restored).toMatchObject({ version: 3, createdAt: legacy.createdAt, positions: legacy.positions })
    expect(restored?.moves[0].grade).toBe('book')
  })
})

describe('practice persistence', () => {
  it('loads every saved review for practice and clears progress with local data', async () => {
    const parsed = parseGame(TEST_GAME.pgn)
    const legacy = { ...buildReview(TEST_GAME, [parsed.initialFen, ...parsed.plies.map(ply => ply.after)].map(fen => ({
      fen, centipawns: 0, mate: null, depth: 10, moves: [], lines: [], bestMove: null,
    }))), version: 2 as const, gameId: 'local-1', createdAt: '2026-01-01T00:00:00.000Z' }
    await saveReview(legacy)
    await saveReview({ ...legacy, gameId: 'other-engine', engine: 'Something else' })
    const reviews = await loadAllReviews()
    expect(reviews.map(review => [review.gameId, review.version])).toEqual([['local-1', 3]])

    const record = recordResult(undefined, 'local-1:3', false, 5)
    await savePracticeRecord(record)
    await savePracticeRecord(recordResult(record, 'local-1:3', true, 6))
    expect(await loadPracticeRecords()).toEqual([{ id: 'local-1:3', attempts: 2, solved: 1, lastResult: 'solved', lastSeen: 6 }])
    await clearLocalData()
    expect(await loadPracticeRecords()).toEqual([])
  })
})
