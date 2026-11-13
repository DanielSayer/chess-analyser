import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { normaliseUsername } from './chesscom'
import { ENGINE_NAME } from './engine'
import { buildGradedReview, REVIEW_VERSION } from './review'
import type { GameReview, ImportedGame } from './types'

interface AnalyserDB extends DBSchema {
  games: { key: string; value: ImportedGame }
  reviews: { key: string; value: GameReview }
  settings: { key: string; value: string }
}

let database: Promise<IDBPDatabase<AnalyserDB>> | undefined
function db(): Promise<IDBPDatabase<AnalyserDB>> {
  database ??= openDB<AnalyserDB>('chess-analyser', 1, {
    upgrade(database) {
      database.createObjectStore('games', { keyPath: 'id' })
      database.createObjectStore('reviews', { keyPath: 'gameId' })
      database.createObjectStore('settings')
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
  return (review.version === 1 || review.version === REVIEW_VERSION) && review.engine === ENGINE_NAME && review.gameId === game.id && review.pgn === game.pgn &&
    Array.isArray(review.moves) && review.moves.length > 0 && Array.isArray(review.positions) && review.positions.length === review.moves.length + 1
}

export async function loadReview(game: ImportedGame): Promise<GameReview | null> {
  const review = await (await db()).get('reviews', game.id)
  if (!review || !isReviewForGame(review, game)) return null
  if (review.version === REVIEW_VERSION) return review
  // Grading changed but the engine work did not: regrade from stored positions.
  try {
    const regraded = { ...await buildGradedReview(game, review.positions, review.preset), createdAt: review.createdAt }
    await saveReview(regraded)
    return regraded
  } catch {
    return review
  }
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
  const tx = (await db()).transaction(['games', 'reviews', 'settings'], 'readwrite')
  await Promise.all([tx.objectStore('games').clear(), tx.objectStore('reviews').clear(), tx.objectStore('settings').clear()])
  await tx.done
}
