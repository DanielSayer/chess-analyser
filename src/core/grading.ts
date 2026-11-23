import { isBookPosition } from './book'
import type { OpeningBook } from './book'
import { lineToSan, uciToSan } from './game'
import type { EngineLine, MoveGrade, ParsedPly, PositionEvaluation, Side } from './types'

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

// Bands follow Chess.com's published expected-points table (0.02 / 0.05 /
// 0.10 / 0.20), on our 0-100 winning-chance scale.
// https://support.chess.com/en/articles/8572705
export const GRADE_THRESHOLDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 } as const

export function gradeMove(loss: number, isBest: boolean, forced = false): MoveGrade {
  if (forced) return 'forced'
  if (isBest) return 'best'
  if (loss < GRADE_THRESHOLDS.excellent) return 'excellent'
  if (loss < GRADE_THRESHOLDS.good) return 'good'
  if (loss < GRADE_THRESHOLDS.inaccuracy) return 'inaccuracy'
  if (loss < GRADE_THRESHOLDS.mistake) return 'mistake'
  return 'blunder'
}

/*
 * Winning-chance bands alone saturate: once one side is far ahead, nearly
 * every move keeps ~100% and grades as Excellent. A second, centipawn band
 * keeps judging how much of the advantage a move gives away. Its tolerance
 * widens as the position gets more decided, so dropping a pawn at +8 is
 * criticised less than at +1, but no longer passes as Excellent. A move gets
 * the worse of the two grades.
 */

/** Scores beyond 12 pawns, including forced mates, all count as decisive. */
export const DECISIVE_CENTIPAWNS = 1200
/** Centipawn loss bands, before widening. Looser than the winning-chance bands near equality. */
export const CENTIPAWN_BANDS = { excellent: 30, good: 70, inaccuracy: 150, mistake: 300 } as const
/** Every this many centipawns of advantage widens the bands by one more multiple. */
export const DECIDED_WIDTH = 600

const SEVERITY: MoveGrade[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder']

function moverScore(line: Pick<EngineLine, 'centipawns' | 'mate'>, side: Side): number {
  const white = line.mate !== null ? Math.sign(line.mate) * DECISIVE_CENTIPAWNS : Math.max(-DECISIVE_CENTIPAWNS, Math.min(DECISIVE_CENTIPAWNS, line.centipawns))
  return side === 'white' ? white : -white
}

/** Grade for giving up `loss` centipawns when the best move keeps `best` (mover's view, capped). */
export function centipawnGrade(best: number, loss: number): MoveGrade {
  const scaled = Math.max(0, loss) / (1 + Math.abs(best) / DECIDED_WIDTH)
  if (scaled < CENTIPAWN_BANDS.excellent) return 'excellent'
  if (scaled < CENTIPAWN_BANDS.good) return 'good'
  if (scaled < CENTIPAWN_BANDS.inaccuracy) return 'inaccuracy'
  if (scaled < CENTIPAWN_BANDS.mistake) return 'mistake'
  return 'blunder'
}

export interface GradedMove {
  grade: MoveGrade
  /** Mover's centipawn loss against the best move, capped at decisive scores. */
  centipawnLoss: number
  winningChanceLoss: number
  bestMove: string | null
  bestSan: string | null
  bestLine: string[]
}

/**
 * Grades one move from evaluations of the positions before and after it.
 * When the played move is among the earlier search's lines, that line's score
 * is used, so both moves are compared by one search instead of two.
 */
export function gradePlayedMove(ply: ParsedPly, before: PositionEvaluation, after: PositionEvaluation, inBook = false): GradedMove {
  const sameSearch = before.lines.find(line => line.moves[0] === ply.uci)
  const played = sameSearch ?? after
  const best = moverScore(before, ply.side)
  const centipawnLoss = Math.max(0, best - moverScore(played, ply.side))
  const sign = ply.side === 'white' ? 1 : -1
  const winningChanceLoss = Math.max(0, (winningChance(before.centipawns) - winningChance(played.centipawns)) * sign)
  const isBest = ply.uci === before.bestMove || (sameSearch !== undefined && centipawnLoss === 0)
  const base = {
    bestMove: before.bestMove,
    bestSan: before.bestMove ? uciToSan(ply.before, before.bestMove) : null,
    bestLine: lineToSan(ply.before, before.moves),
  }
  if (inBook) return { ...base, grade: 'book', centipawnLoss: 0, winningChanceLoss: 0 }
  if (ply.legalMoves === 1) return { ...base, grade: 'forced', centipawnLoss: 0, winningChanceLoss: 0 }
  if (isBest) return { ...base, grade: 'best', centipawnLoss: 0, winningChanceLoss: 0 }
  const byChance = gradeMove(winningChanceLoss, false)
  const byCentipawns = centipawnGrade(best, centipawnLoss)
  const grade = SEVERITY.indexOf(byChance) >= SEVERITY.indexOf(byCentipawns) ? byChance : byCentipawns
  return { ...base, grade, centipawnLoss, winningChanceLoss }
}

/**
 * Grades every ply whose surrounding positions have been evaluated.
 * Opening theory stays Book until a move leaves the catalogue or costs an
 * inaccuracy or worse (catalogued traps).
 */
export function gradeGame(plies: ParsedPly[], evaluations: ReadonlyMap<string, PositionEvaluation>, book?: OpeningBook): (GradedMove | null)[] {
  let inBook = book !== undefined
  return plies.map(ply => {
    const before = evaluations.get(ply.before)
    const after = evaluations.get(ply.after)
    const sign = ply.side === 'white' ? 1 : -1
    // Unevaluated moves keep the book run alive until their scores arrive.
    const rawLoss = before && after ? Math.max(0, (winningChance(before.centipawns) - winningChance(after.centipawns)) * sign) : 0
    inBook &&= isBookPosition(book!, ply.after) && rawLoss < GRADE_THRESHOLDS.inaccuracy
    return before && after ? gradePlayedMove(ply, before, after, inBook) : null
  })
}
