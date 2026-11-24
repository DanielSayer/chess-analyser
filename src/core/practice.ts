import { parseGame } from './game'
import { gradePlayedMove } from './grading'
import type { GameReview, MoveGrade, ParsedPly, PositionEvaluation, Side } from './types'

/*
 * Practice turns the player's own Mistakes and Blunders from saved reviews
 * into "find a better move" positions. Everything here is pure: the UI loads
 * reviews and progress, and supplies engine evaluations of attempts.
 */

export type PuzzleGrade = Extract<MoveGrade, 'mistake' | 'blunder'>

export interface Puzzle {
  /** `${gameId}:${ply}`; stable across regrading and reruns of the same game. */
  id: string
  gameId: string
  /** Half-move number of the mistake. */
  ply: number
  /** Position before the mistake, with `side` to move. */
  fen: string
  side: Side
  played: { san: string; uci: string; grade: PuzzleGrade }
  bestMove: string
  bestSan: string
  bestLine: string[]
  /** The review's evaluation of `fen`. Attempts are measured against it. */
  evaluation: PositionEvaluation
  /** The opponent's move that led to `fen`, for board context. */
  previousMove: string | null
  white: string
  black: string
  /** Game date from the PGN (YYYY.MM.DD), if known. */
  date: string | null
  opening: string | null
  local: boolean
  /** When the review was made (ISO). Recently reviewed games come first. */
  reviewedAt: string
}

const PUZZLE_GRADES = new Set<MoveGrade>(['mistake', 'blunder'])

/** True for games played on this device (see `toLocalGame`). */
export function isLocalGameId(gameId: string): boolean {
  return gameId.startsWith('local-')
}

/**
 * Builds puzzles from saved reviews. Imported games give only `username`'s
 * moves; local games were played by both sides on this device, so give both.
 * Reviews of other players' games are skipped.
 */
export function collectPuzzles(reviews: Iterable<GameReview>, username: string | null): Puzzle[] {
  const puzzles: Puzzle[] = []
  const me = username?.toLowerCase() ?? null
  for (const review of reviews) {
    let headers: Record<string, string>
    try { headers = parseGame(review.pgn).headers } catch { continue }
    const local = isLocalGameId(review.gameId)
    const white = headers.White ?? 'White'
    const black = headers.Black ?? 'Black'
    const sides = new Set<Side>()
    if (local) { sides.add('white'); sides.add('black') }
    if (me && white.toLowerCase() === me) sides.add('white')
    if (me && black.toLowerCase() === me) sides.add('black')
    if (!sides.size) continue
    review.moves.forEach((move, index) => {
      if (!PUZZLE_GRADES.has(move.grade) || !sides.has(move.side)) return
      const evaluation = review.positions[index]
      if (!move.bestMove || !move.bestSan || move.bestMove === move.uci || evaluation?.fen !== move.before) return
      puzzles.push({
        id: `${review.gameId}:${move.ply}`,
        gameId: review.gameId,
        ply: move.ply,
        fen: move.before,
        side: move.side,
        played: { san: move.san, uci: move.uci, grade: move.grade as PuzzleGrade },
        bestMove: move.bestMove,
        bestSan: move.bestSan,
        bestLine: move.bestLine,
        evaluation,
        previousMove: index > 0 ? review.moves[index - 1].uci : null,
        white,
        black,
        date: headers.Date && !headers.Date.includes('?') ? headers.Date : null,
        opening: review.opening,
        local,
        reviewedAt: review.createdAt,
      })
    })
  }
  return puzzles
}

/* ------------------------------------------------------------------ Answers */

/** Grades an answer must reach to count as solved. */
export const ACCEPTED_GRADES = new Set<MoveGrade>(['best', 'excellent', 'good'])

export type AttemptVerdict =
  | { status: 'correct'; grade: MoveGrade; san: string }
  | { status: 'wrong'; grade: MoveGrade | null; san: string }
  /** Needs an engine evaluation of `attempt.after` first. */
  | { status: 'evaluate' }

/**
 * Judges a legal move from the puzzle position. The engine's move and the
 * game's mistake are known without searching; anything else is graded like
 * a played move against the review's evaluation of the puzzle position.
 * When the player had a forced mate, the answer must keep one.
 */
export function judgeAttempt(puzzle: Puzzle, attempt: ParsedPly, after?: PositionEvaluation | null): AttemptVerdict {
  if (attempt.uci === puzzle.bestMove) return { status: 'correct', grade: 'best', san: attempt.san }
  if (attempt.uci === puzzle.played.uci) return { status: 'wrong', grade: puzzle.played.grade, san: attempt.san }
  if (!after) return { status: 'evaluate' }
  const { grade } = gradePlayedMove(attempt, puzzle.evaluation, after)
  const sign = puzzle.side === 'white' ? 1 : -1
  const hadMate = puzzle.evaluation.mate !== null && puzzle.evaluation.mate * sign > 0
  const keepsMate = after.mate !== null && after.mate * sign > 0
  const correct = ACCEPTED_GRADES.has(grade) && (!hadMate || keepsMate)
  return correct ? { status: 'correct', grade, san: attempt.san } : { status: 'wrong', grade: worse(grade), san: attempt.san }
}

// A move that throws away a forced mate is at least a Mistake, whatever the capped scores say.
function worse(grade: MoveGrade): MoveGrade {
  return ACCEPTED_GRADES.has(grade) ? 'mistake' : grade
}

/* ------------------------------------------------------------------ Progress */

export interface PracticeRecord {
  /** Puzzle id. */
  id: string
  attempts: number
  solved: number
  /** Solved means right first time, without a hint or the solution. */
  lastResult: 'solved' | 'failed'
  /** Epoch milliseconds. */
  lastSeen: number
}

export function recordResult(previous: PracticeRecord | undefined, id: string, solved: boolean, now = Date.now()): PracticeRecord {
  return {
    id,
    attempts: (previous?.attempts ?? 0) + 1,
    solved: (previous?.solved ?? 0) + (solved ? 1 : 0),
    lastResult: solved ? 'solved' : 'failed',
    lastSeen: now,
  }
}

/**
 * Practice order: positions never tried (most recently reviewed game first,
 * then in move order), then ones last failed, then ones last solved; least recently seen
 * first within each group.
 */
export function orderPuzzles(puzzles: Puzzle[], records: ReadonlyMap<string, PracticeRecord>): Puzzle[] {
  const group = (puzzle: Puzzle) => {
    const record = records.get(puzzle.id)
    return !record ? 0 : record.lastResult === 'failed' ? 1 : 2
  }
  return [...puzzles].sort((a, b) =>
    group(a) - group(b)
    || (records.get(a.id)?.lastSeen ?? 0) - (records.get(b.id)?.lastSeen ?? 0)
    || b.reviewedAt.localeCompare(a.reviewedAt)
    || a.gameId.localeCompare(b.gameId)
    || a.ply - b.ply)
}

export interface PracticeSummary {
  total: number
  fresh: number
  failed: number
  solved: number
}

export function summarisePractice(puzzles: Puzzle[], records: ReadonlyMap<string, PracticeRecord>): PracticeSummary {
  const summary = { total: puzzles.length, fresh: 0, failed: 0, solved: 0 }
  for (const puzzle of puzzles) {
    const record = records.get(puzzle.id)
    if (!record) summary.fresh++
    else if (record.lastResult === 'failed') summary.failed++
    else summary.solved++
  }
  return summary
}
