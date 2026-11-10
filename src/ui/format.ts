import type { EngineLine, ImportedGame, MoveGrade, Side } from '../core'
import { winningChance } from '../core'

export type Outcome = 'win' | 'loss' | 'draw'

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

export function playerSide(game: ImportedGame, username: string): Side {
  return game.black.username.toLowerCase() === username.toLowerCase() ? 'black' : 'white'
}

export function outcomeFor(game: ImportedGame, username: string): Outcome {
  const me = game[playerSide(game, username)]
  if (me.result === 'win') return 'win'
  if (DRAW_RESULTS.has(me.result)) return 'draw'
  return 'loss'
}

export function scoreline(game: ImportedGame): string {
  if (game.white.result === 'win') return '1-0'
  if (game.black.result === 'win') return '0-1'
  return '½-½'
}

const RESULT_TEXT: Record<string, string> = {
  checkmated: 'checkmate',
  resigned: 'resignation',
  timeout: 'time',
  abandoned: 'abandonment',
  agreed: 'agreement',
  repetition: 'repetition',
  stalemate: 'stalemate',
  insufficient: 'insufficient material',
  '50move': '50-move rule',
  timevsinsufficient: 'timeout vs insufficient material',
}

/** A short phrase describing how the game ended, e.g. "Black won by checkmate". */
export function endingText(game: ImportedGame): string {
  const loser = game.white.result === 'win' ? game.black : game.black.result === 'win' ? game.white : null
  if (loser) {
    const winner = loser === game.white ? 'Black' : 'White'
    const how = RESULT_TEXT[loser.result]
    return how ? `${winner} won by ${how}` : `${winner} won`
  }
  const how = RESULT_TEXT[game.white.result]
  return how ? `Draw by ${how}` : 'Draw'
}

export function timeControlLabel(game: Pick<ImportedGame, 'timeControl' | 'timeClass'>): string {
  const tc = game.timeControl
  const daily = /^1\/(\d+)$/.exec(tc)
  if (daily) {
    const days = Math.round(Number(daily[1]) / 86400)
    return days === 1 ? '1 day' : `${days} days`
  }
  const live = /^(\d+)(?:\+(\d+))?$/.exec(tc)
  if (!live) return game.timeClass
  const base = Number(live[1])
  const minutes = base >= 60 ? `${+(base / 60).toFixed(2)} min` : `${base} sec`
  return live[2] && live[2] !== '0' ? `${minutes} + ${live[2]}s` : minutes
}

export function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

export function gameDate(endTime: number, now = Date.now()): string {
  const date = new Date(endTime * 1000)
  return date.getFullYear() === new Date(now).getFullYear() ? shortDate.format(date) : dateFormat.format(date)
}

export function fullDate(endTime: number): string {
  return dateFormat.format(new Date(endTime * 1000))
}

/** Formats a White-perspective evaluation for display. */
export function formatEval(line: Pick<EngineLine, 'centipawns' | 'mate'> & { depth?: number }): string {
  if (line.mate !== null) {
    if (line.depth === 0) return line.mate > 0 ? '1-0' : '0-1'
    return `${line.mate > 0 ? '+' : '-'}M${Math.abs(line.mate)}`
  }
  const pawns = line.centipawns / 100
  if (Math.abs(pawns) < 0.05) return '0.0'
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
}

/** White's winning chance in percent. Mates saturate the scale. */
export function whiteChance(line: Pick<EngineLine, 'centipawns' | 'mate'>): number {
  if (line.mate !== null) return line.mate > 0 ? 100 : 0
  return winningChance(line.centipawns)
}

export interface GradeMeta {
  label: string
  symbol: string
  tone: string
}

export const GRADES: Record<MoveGrade, GradeMeta> = {
  best: { label: 'Best', symbol: '★', tone: 'var(--grade-best)' },
  excellent: { label: 'Excellent', symbol: '✓', tone: 'var(--grade-excellent)' },
  good: { label: 'Good', symbol: '•', tone: 'var(--grade-good)' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', tone: 'var(--grade-inaccuracy)' },
  mistake: { label: 'Mistake', symbol: '?', tone: 'var(--grade-mistake)' },
  blunder: { label: 'Blunder', symbol: '??', tone: 'var(--grade-blunder)' },
  forced: { label: 'Forced', symbol: '→', tone: 'var(--grade-forced)' },
}

export const GRADE_ORDER: MoveGrade[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced']

/** "12." for White's twelfth move, "12…" for Black's. */
export function moveNumber(ply: number): string {
  const n = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${n}.` : `${n}…`
}

/** SAN line with move numbers, starting from a FEN's side to move and move counter. */
export function numberedLine(fen: string, sans: string[]): string {
  const [, turn, , , , full] = fen.split(' ')
  let ply = (Number(full) || 1) * 2 - (turn === 'w' ? 1 : 0)
  return sans.map((san, i) => {
    const prefix = ply % 2 === 1 ? `${Math.ceil(ply / 2)}. ` : i === 0 ? `${Math.ceil(ply / 2)}… ` : ''
    ply++
    return prefix + san
  }).join(' ')
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as Error | null)?.name === 'AbortError'
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
