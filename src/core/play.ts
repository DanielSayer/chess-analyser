import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { isBookPosition } from './book'
import type { OpeningBook } from './book'
import { lineToSan, uciToSan } from './game'
import { GRADE_THRESHOLDS, gradeMove, winningChance } from './review'
import type { EngineLine, ImportedGame, MoveGrade, ParsedPly, PositionEvaluation, Side } from './types'

export const START_FEN = new Chess().fen()

/* ------------------------------------------------------------------ Moves */

export interface MoveInput {
  from: string
  to: string
  promotion?: 'q' | 'r' | 'b' | 'n'
}

/** Plays a legal move after the last ply. Returns the new ply, or null when illegal. */
export function playMove(fen: string, ply: number, input: MoveInput): ParsedPly | null {
  const chess = new Chess(fen)
  const legalMoves = chess.moves().length
  try {
    const move = chess.move({ from: input.from, to: input.to, promotion: input.promotion ?? 'q' })
    return {
      ply,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      side: move.color === 'w' ? 'white' : 'black',
      before: move.before,
      after: move.after,
      legalMoves,
      clock: null,
    }
  } catch { return null }
}

/** True when moving `from` to `to` is a legal pawn promotion. */
export function isPromotion(fen: string, from: string, to: string): boolean {
  try {
    return new Chess(fen).moves({ square: from as Square, verbose: true }).some(move => move.to === to && move.promotion)
  } catch { return false }
}

/* ------------------------------------------------------------------ Results */

export type GameResult = '1-0' | '0-1' | '1/2-1/2'
export type EndReason = 'checkmate' | 'stalemate' | 'repetition' | 'insufficient' | 'fifty-move' | 'resignation' | 'agreement'

export interface GameEnd {
  result: GameResult
  reason: EndReason
}

/** How the game in `plies` ended by the rules, or null while it is still running. */
export function ruleEnding(startFen: string, plies: ParsedPly[]): GameEnd | null {
  // Repetition needs the full move history, not only the final position.
  const chess = new Chess(startFen)
  for (const ply of plies) chess.move(ply.san)
  if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient' }
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'repetition' }
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: 'fifty-move' }
  return null
}

const REASON_TEXT: Record<EndReason, string> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  repetition: 'threefold repetition',
  insufficient: 'insufficient material',
  'fifty-move': 'the 50-move rule',
  resignation: 'resignation',
  agreement: 'agreement',
}

export function endText(end: GameEnd): string {
  if (end.result === '1/2-1/2') return `Draw by ${REASON_TEXT[end.reason]}`
  return `${end.result === '1-0' ? 'White' : 'Black'} wins by ${REASON_TEXT[end.reason]}`
}

/** A PGN of the game, readable by Chess.com, Lichess and this app's review. */
export function toPgn(startFen: string, plies: ParsedPly[], end: GameEnd | null, date = new Date()): string {
  const chess = new Chess(startFen)
  for (const ply of plies) chess.move(ply.san)
  const pad = (n: number) => String(n).padStart(2, '0')
  chess.setHeader('Event', 'Over-the-board game')
  chess.setHeader('Site', 'Chess Analyser')
  chess.setHeader('Date', `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`)
  chess.setHeader('White', 'White')
  chess.setHeader('Black', 'Black')
  chess.setHeader('Result', end?.result ?? '*')
  if (end && end.reason !== 'checkmate') chess.setHeader('Termination', endText(end))
  return chess.pgn()
}

// Chess.com's result codes, so reviews describe local games the same way.
const LOSER_RESULT: Partial<Record<EndReason, string>> = { checkmate: 'checkmated', resignation: 'resigned' }
const DRAW_RESULT: Record<EndReason, string> = {
  checkmate: 'agreed', resignation: 'agreed', agreement: 'agreed', stalemate: 'stalemate',
  repetition: 'repetition', insufficient: 'insufficient', 'fifty-move': '50move',
}

/** Wraps a game played on this device so the review workspace can analyse it. */
export function toLocalGame(id: string, startedAt: number, startFen: string, plies: ParsedPly[], end: GameEnd | null): ImportedGame {
  const result = (side: Side) => {
    if (!end) return 'unfinished'
    if (end.result === '1/2-1/2') return DRAW_RESULT[end.reason]
    return (end.result === '1-0') === (side === 'white') ? 'win' : LOSER_RESULT[end.reason] ?? 'lose'
  }
  return {
    id,
    url: '',
    pgn: toPgn(startFen, plies, end, new Date(startedAt)),
    white: { username: 'White', rating: null, result: result('white') },
    black: { username: 'Black', rating: null, result: result('black') },
    endTime: Math.floor(Date.now() / 1000),
    timeClass: 'over the board',
    timeControl: '-',
    rated: false,
    opening: null,
    eco: null,
    source: 'local',
  }
}

/* ------------------------------------------------------------------ Material */

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const FULL_SET: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }

export interface Material {
  /** Opponent pieces this side has taken, most valuable first, as piece letters. */
  captured: string[]
  /** Material lead in pawns; zero or negative when not ahead. */
  lead: number
}

export function material(fen: string): Record<Side, Material> {
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } } as Record<'w' | 'b', Record<string, number>>
  for (const char of fen.split(' ')[0]) {
    if (!/[pnbrqk]/i.test(char)) continue
    counts[char === char.toUpperCase() ? 'w' : 'b'][char.toLowerCase()]++
  }
  const score = (color: 'w' | 'b') => Object.entries(counts[color]).reduce((sum, [type, n]) => sum + VALUES[type] * n, 0)
  // Promotions can leave more pieces than the full set, so never report negative captures.
  const taken = (color: 'w' | 'b') => ['q', 'r', 'b', 'n', 'p'].flatMap(type => Array(Math.max(0, FULL_SET[type] - counts[color][type])).fill(type) as string[])
  const diff = score('w') - score('b')
  return {
    white: { captured: taken('b'), lead: diff },
    black: { captured: taken('w'), lead: -diff },
  }
}

/* ------------------------------------------------------------------ Grading */

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
