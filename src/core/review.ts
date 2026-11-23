import { loadOpeningBook } from './book'
import type { OpeningBook } from './book'
import { ENGINE_NAME, StockfishEngine } from './engine'
import { parseGame } from './game'
import { accuracyForLoss, gradeGame } from './grading'
import type { AnalyseOptions, GameReview, ImportedGame, MoveGrade, PositionEvaluation, ReviewedMove, SideSummary } from './types'

const CRITICAL: MoveGrade[] = ['inaccuracy', 'mistake', 'blunder']

export function summarise(moves: ReviewedMove[]): SideSummary {
  const counts: SideSummary['counts'] = { book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0 }
  for (const move of moves) counts[move.grade]++
  return {
    accuracy: moves.length ? moves.reduce((sum, move) => sum + move.accuracy, 0) / moves.length : null,
    averageCentipawnLoss: moves.length ? moves.reduce((sum, move) => sum + move.centipawnLoss, 0) / moves.length : null,
    counts,
    moveCount: moves.length,
  }
}

/** Bump when grading changes. Older reviews are regraded from their stored positions. */
export const REVIEW_VERSION = 3

/** Book-graded review. The book is optional; analysis never fails because of it. */
export async function buildGradedReview(game: ImportedGame, positions: PositionEvaluation[], preset: GameReview['preset'] = 'standard'): Promise<GameReview> {
  const book = await loadOpeningBook().catch(() => undefined)
  return buildReview(game, positions, preset, book)
}

export function buildReview(
  game: ImportedGame,
  positions: PositionEvaluation[],
  preset: GameReview['preset'] = 'standard',
  book: OpeningBook = new Set(),
): GameReview {
  const parsed = parseGame(game.pgn)
  if (positions.length !== parsed.plies.length + 1 || positions[0].fen !== parsed.initialFen || parsed.plies.some((ply, index) => positions[index + 1].fen !== ply.after)) {
    throw new Error('Analysis positions do not match this game.')
  }
  const evaluations = new Map(positions.map(position => [position.fen, position]))
  // Same grading as the Play page: worse of winning-chance and centipawn bands.
  const grades = gradeGame(parsed.plies, evaluations, book)
  const moves = parsed.plies.map((ply, index): ReviewedMove => {
    const graded = grades[index]!
    return { ...ply, ...graded, accuracy: accuracyForLoss(graded.winningChanceLoss) }
  })
  return {
    version: REVIEW_VERSION,
    engine: ENGINE_NAME,
    gameId: game.id,
    pgn: game.pgn,
    preset,
    createdAt: new Date().toISOString(),
    initialFen: parsed.initialFen,
    moves,
    positions,
    white: summarise(moves.filter(move => move.side === 'white')),
    black: summarise(moves.filter(move => move.side === 'black')),
    // Worst grade first; a centipawn-band mistake can lose little winning chance.
    criticalPlies: moves.filter(move => CRITICAL.includes(move.grade))
      .sort((a, b) => CRITICAL.indexOf(b.grade) - CRITICAL.indexOf(a.grade) || b.winningChanceLoss - a.winningChanceLoss || b.centipawnLoss - a.centipawnLoss)
      .slice(0, 5).map(move => move.ply),
    opening: game.opening ?? parsed.headers.Opening ?? null,
    eco: game.eco ?? parsed.headers.ECO ?? null,
  }
}

export async function analyseGame(game: ImportedGame, options: AnalyseOptions = {}): Promise<GameReview> {
  const parsed = parseGame(game.pgn)
  const engine = new StockfishEngine()
  const preset = options.preset ?? 'standard'
  const fens = [parsed.initialFen, ...parsed.plies.map(ply => ply.after)]
  const positions: PositionEvaluation[] = []
  try {
    options.onProgress?.({ completed: 0, total: fens.length, percent: 0 })
    for (const fen of fens) {
      options.signal?.throwIfAborted()
      const position = await engine.evaluate(fen, { preset, signal: options.signal })
      positions.push(position)
      options.onProgress?.({ completed: positions.length, total: fens.length, percent: Math.round(positions.length / fens.length * 100), position })
    }
    options.signal?.throwIfAborted()
    return await buildGradedReview(game, positions, preset)
  } finally { engine.dispose() }
}
