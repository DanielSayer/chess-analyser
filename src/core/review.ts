import { ENGINE_NAME, StockfishEngine } from './engine'
import { lineToSan, parseGame, uciToSan } from './game'
import type { AnalyseOptions, GameReview, ImportedGame, MoveGrade, PositionEvaluation, ReviewedMove, SideSummary } from './types'

// Published Lichess move-accuracy equations. Game accuracy below is our simple
// average, NOT Chess.com's proprietary metric or Lichess's weighted game score.
// https://lichess.org/page/accuracy
export function winningChance(centipawns: number): number {
  return 100 / (1 + Math.exp(-0.00368208 * centipawns))
}

export function accuracyForLoss(loss: number): number {
  if (loss <= 0) return 100
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
}

export function gradeMove(loss: number, isBest: boolean, forced = false): MoveGrade {
  if (forced) return 'forced'
  if (isBest) return 'best'
  if (loss < 1) return 'excellent'
  if (loss < 3) return 'good'
  if (loss < 8) return 'inaccuracy'
  if (loss < 16) return 'mistake'
  return 'blunder'
}

export function summarise(moves: ReviewedMove[]): SideSummary {
  const counts: SideSummary['counts'] = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, forced: 0 }
  for (const move of moves) counts[move.grade]++
  return {
    accuracy: moves.length ? moves.reduce((sum, move) => sum + move.accuracy, 0) / moves.length : null,
    averageCentipawnLoss: moves.length ? moves.reduce((sum, move) => sum + move.centipawnLoss, 0) / moves.length : null,
    counts,
    moveCount: moves.length,
  }
}

export function buildReview(
  game: ImportedGame,
  positions: PositionEvaluation[],
  preset: GameReview['preset'] = 'standard',
): GameReview {
  const parsed = parseGame(game.pgn)
  if (positions.length !== parsed.plies.length + 1 || positions[0].fen !== parsed.initialFen || parsed.plies.some((ply, index) => positions[index + 1].fen !== ply.after)) {
    throw new Error('Analysis positions do not match this game.')
  }
  const moves = parsed.plies.map((ply, index): ReviewedMove => {
    const before = positions[index]
    const after = positions[index + 1]
    const sign = ply.side === 'white' ? 1 : -1
    const isBest = ply.uci === before.bestMove
    // Independent bounded searches can disagree slightly. An engine's own top
    // move must never be called a mistake because of that search noise.
    const winningChanceLoss = isBest ? 0 : Math.max(0, (winningChance(before.centipawns) - winningChance(after.centipawns)) * sign)
    return {
      ...ply,
      grade: gradeMove(winningChanceLoss, isBest, ply.legalMoves === 1),
      centipawnLoss: isBest ? 0 : Math.min(1000, Math.max(0, (before.centipawns - after.centipawns) * sign)),
      winningChanceLoss,
      accuracy: accuracyForLoss(winningChanceLoss),
      bestMove: before.bestMove,
      bestSan: before.bestMove ? uciToSan(ply.before, before.bestMove) : null,
      bestLine: lineToSan(ply.before, before.moves),
    }
  })
  return {
    version: 1,
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
    criticalPlies: moves.filter(move => ['inaccuracy', 'mistake', 'blunder'].includes(move.grade)).sort((a, b) => b.winningChanceLoss - a.winningChanceLoss).slice(0, 5).map(move => move.ply),
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
      positions.push(await engine.evaluate(fen, { preset, signal: options.signal }))
      options.onProgress?.({ completed: positions.length, total: fens.length, percent: Math.round(positions.length / fens.length * 100) })
    }
    options.signal?.throwIfAborted()
    return buildReview(game, positions, preset)
  } finally { engine.dispose() }
}
