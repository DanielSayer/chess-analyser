import { Chess } from 'chess.js'
import type { ParsedGame } from './types'

export function parseGame(pgn: string): ParsedGame {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch {
    throw new Error('This game contains invalid or unsupported moves and cannot be analysed.')
  }
  const headers = chess.getHeaders()
  const history = chess.history({ verbose: true })
  if (!history.length) throw new Error('This game has no moves to analyse.')
  const initialFen = history[0].before
  const replay = new Chess(initialFen)
  const comments = new Map(chess.getComments().map(comment => [comment.fen, comment.comment]))
  const plies = history.map((move, index) => {
    const legalMoves = replay.moves().length
    replay.move(move.san)
    return {
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      side: move.color === 'w' ? 'white' as const : 'black' as const,
      before: move.before,
      after: move.after,
      legalMoves,
      clock: /\[%clk ([^\]]+)\]/.exec(comments.get(move.after) ?? '')?.[1] ?? null,
    }
  })
  return { headers, initialFen, plies }
}

export function uciToSan(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? null
  } catch { return null }
}

export function lineToSan(fen: string, line: string[]): string[] {
  const chess = new Chess(fen)
  const result: string[] = []
  for (const uci of line) {
    try {
      result.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch { break }
  }
  return result
}

export function sideForUsername(game: { white: { username: string }; black: { username: string } }, username: string): 'white' | 'black' {
  return game.black.username.toLowerCase() === username.toLowerCase() ? 'black' : 'white'
}
