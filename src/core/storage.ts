import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { normaliseUsername } from './chesscom'
import { ENGINE_NAME } from './engine'
import type { PracticeRecord } from './practice'
import { buildGradedReview, REVIEW_VERSION } from './review'
import type { GameReview, ImportedGame } from './types'

interface AnalyserDB extends DBSchema {
  games: { key: string; value: ImportedGame }
  reviews: { key: string; value: GameReview }
  settings: { key: string; value: string }
  practice: { key: string; value: PracticeRecord }
}

let database: Promise<IDBPDatabase<AnalyserDB>> | undefined
function db(): Promise<IDBPDatabase<AnalyserDB>> {
  database ??= openDB<AnalyserDB>('chess-analyser', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('games', { keyPath: 'id' })
        database.createObjectStore('reviews', { keyPath: 'gameId' })
        database.createObjectStore('settings')
      }
      if (oldVersion < 2) database.createObjectStore('practice', { keyPath: 'id' })
    },
    blocking() {
      void database?.then(connection => connection.close())
      database = undefined
    },
  }).catch(error => { database = undefined; throw error })
  return database
}

export async function saveGames(games: ImportedGame[]): Promise<void> {
  const connection = await db()
  const tx = connection.transaction('games', 'readwrite')
  await Promise.all(games.map(game => tx.store.put(game)))
  await tx.done
}

export async function loadGames(input: string): Promise<ImportedGame[]> {
  const username = normaliseUsername(input)
  const games = await (await db()).getAll('games')
  return games.filter(game => game.white.username.toLowerCase() === username || game.black.username.toLowerCase() === username)
    .sort((a, b) => b.endTime - a.endTime || a.id.localeCompare(b.id))
}

export async function saveReview(review: GameReview): Promise<void> {
  await (await db()).put('reviews', review)
}

export function isReviewForGame(review: GameReview, game: ImportedGame): boolean {
  return [1, 2, REVIEW_VERSION].includes(review.version) && review.engine === ENGINE_NAME && review.gameId === game.id && review.pgn === game.pgn &&
    Array.isArray(review.moves) && review.moves.length > 0 && Array.isArray(review.positions) && review.positions.length === review.moves.length + 1
}

export async function loadReview(game: ImportedGame): Promise<GameReview | null> {
  const review = await (await db()).get('reviews', game.id)
  if (!review || !isReviewForGame(review, game)) return null
  return current(review, game)
}

/** Grading changed but the engine work did not: regrade from stored positions. */
async function current(review: GameReview, game: Pick<ImportedGame, 'id' | 'pgn' | 'opening' | 'eco'>): Promise<GameReview> {
  if (review.version === REVIEW_VERSION) return review
  try {
    const regraded = { ...await buildGradedReview(game as ImportedGame, review.positions, review.preset), createdAt: review.createdAt }
    await saveReview(regraded)
    return regraded
  } catch {
    return review
  }
}

/** Every compatible saved review, for any game, regraded where needed. */
export async function loadAllReviews(): Promise<GameReview[]> {
  const reviews = await (await db()).getAll('reviews')
  const usable = reviews.filter(review => isReviewForGame(review, { id: review.gameId, pgn: review.pgn } as ImportedGame))
  return Promise.all(usable.map(review => current(review, { id: review.gameId, pgn: review.pgn, opening: review.opening, eco: review.eco })))
}

export async function loadPracticeRecords(): Promise<PracticeRecord[]> {
  return (await db()).getAll('practice')
}

export async function savePracticeRecord(record: PracticeRecord): Promise<void> {
  await (await db()).put('practice', record)
}

export async function loadReviewedIds(): Promise<string[]> {
  return (await db()).getAllKeys('reviews')
}

export async function saveLastUsername(username: string): Promise<void> {
  await (await db()).put('settings', normaliseUsername(username), 'lastUsername')
}

export async function loadLastUsername(): Promise<string | null> {
  return (await (await db()).get('settings', 'lastUsername')) ?? null
}

export async function clearLocalData(): Promise<void> {
  const tx = (await db()).transaction(['games', 'reviews', 'settings', 'practice'], 'readwrite')
  await Promise.all([tx.objectStore('games').clear(), tx.objectStore('reviews').clear(), tx.objectStore('settings').clear(), tx.objectStore('practice').clear()])
  await tx.done
}
