import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { loadOpeningBook } from '../../src/core/book'
import { parseGame } from '../../src/core/game'
import { centipawnGrade, gradeGame, gradeMove, gradePlayedMove, winningChance } from '../../src/core/grading'
import { START_FEN, endText, isPromotion, material, playMove, ruleEnding, toLocalGame, toPgn } from '../../src/core/play'
import type { EngineLine, ParsedPly, PositionEvaluation } from '../../src/core/types'
import { endingText, scoreline } from '../../src/ui/format'

function line(centipawns: number, moves: string[] = [], mate: number | null = null): EngineLine {
  return { centipawns: mate === null ? centipawns : Math.sign(mate) * 100_000, mate, depth: 14, moves }
}
function position(fen: string, score: EngineLine, others: EngineLine[] = []): PositionEvaluation {
  return { ...score, fen, bestMove: score.moves[0] ?? null, lines: [score, ...others] }
}
function plies(sans: string[], start = START_FEN): ParsedPly[] {
  const result: ParsedPly[] = []
  let fen = start
  for (const san of sans) {
    const move = new Chess(fen).move(san)
    const ply = playMove(fen, result.length + 1, { from: move.from, to: move.to, promotion: move.promotion as 'q' | undefined })!
    result.push(ply)
    fen = ply.after
  }
  return result
}

describe('live play', () => {
  it('plays legal moves only and records the ply', () => {
    expect(playMove(START_FEN, 1, { from: 'e2', to: 'e5' })).toBeNull()
    expect(playMove(START_FEN, 1, { from: 'g1', to: 'f3' })).toMatchObject({ ply: 1, san: 'Nf3', uci: 'g1f3', side: 'white', legalMoves: 20 })
  })

  it('detects promotions and plays the chosen piece', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1'
    expect(isPromotion(fen, 'a7', 'a8')).toBe(true)
    expect(isPromotion(fen, 'a1', 'a2')).toBe(false)
    expect(playMove(fen, 1, { from: 'a7', to: 'a8', promotion: 'n' })?.san).toBe('a8=N')
  })

  it('ends by checkmate, stalemate and repetition', () => {
    expect(ruleEnding(START_FEN, plies(['f3', 'e5', 'g4', 'Qh4#']))).toEqual({ result: '0-1', reason: 'checkmate' })
    expect(ruleEnding('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', [])).toEqual({ result: '1/2-1/2', reason: 'stalemate' })
    expect(ruleEnding(START_FEN, plies(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']))).toEqual({ result: '1/2-1/2', reason: 'repetition' })
    expect(ruleEnding(START_FEN, plies(['e4']))).toBeNull()
    expect(endText({ result: '1-0', reason: 'resignation' })).toBe('White wins by resignation')
  })

  it('exports a PGN this app can read back', () => {
    const game = plies(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    const pgn = toPgn(START_FEN, game, ruleEnding(START_FEN, game), new Date(2026, 10, 20))
    expect(pgn).toContain('[Result "1-0"]')
    expect(pgn).toContain('[Date "2026.11.20"]')
    expect(parseGame(pgn).plies.map(ply => ply.san)).toEqual(game.map(ply => ply.san))
  })

  it('wraps a played game for review with Chess.com-style results', () => {
    const game = plies(['f3', 'e5', 'g4', 'Qh4#'])
    const finished = toLocalGame('local-1', Date.UTC(2026, 10, 20, 12), START_FEN, game, ruleEnding(START_FEN, game))
    expect(finished).toMatchObject({ id: 'local-1', url: '', source: 'local', white: { username: 'White', result: 'checkmated' }, black: { result: 'win' } })
    expect(parseGame(finished.pgn).plies).toHaveLength(4)
    expect([scoreline(finished), endingText(finished)]).toEqual(['0-1', 'Black won by checkmate'])
    const ongoing = toLocalGame('local-1', Date.UTC(2026, 10, 20, 12), START_FEN, game.slice(0, 2), null)
    expect([scoreline(ongoing), endingText(ongoing)]).toEqual(['*', 'Game in progress'])
    const drawn = toLocalGame('local-1', 0, START_FEN, game.slice(0, 2), { result: '1/2-1/2', reason: 'agreement' })
    expect([scoreline(drawn), endingText(drawn)]).toEqual(['½-½', 'Draw by agreement'])
  })

  it('counts captured pieces and the material lead', () => {
    const game = plies(['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qxg2'])
    expect(material(game.at(-1)!.after)).toEqual({ white: { captured: ['p'], lead: -1 }, black: { captured: ['p', 'p'], lead: 1 } })
  })
})

describe('context-aware grading', () => {
  it('stays no stricter than the winning-chance bands near equality', () => {
    for (const loss of [10, 25, 60, 120, 250]) {
      const chance = gradeMove(winningChance(0) - winningChance(-loss), false)
      const order = ['excellent', 'good', 'inaccuracy', 'mistake', 'blunder']
      expect(order.indexOf(centipawnGrade(0, loss))).toBeLessThanOrEqual(order.indexOf(chance))
    }
  })

  it('keeps grading moves once one side is winning', () => {
    // Winning chances barely move at +12, so these would all be Excellent alone.
    expect(gradeMove(winningChance(1200) - winningChance(1000), false)).toBe('excellent')
    expect(centipawnGrade(1200, 200)).toBe('good')
    expect(centipawnGrade(1200, 400)).toBe('inaccuracy')
    expect(centipawnGrade(1200, 600)).toBe('mistake')
    expect(centipawnGrade(1200, 1000)).toBe('blunder')
    // Small drifts in a won game are still fine.
    expect(centipawnGrade(1200, 60)).toBe('excellent')
  })

  const [ply] = plies(['e4'])

  it('grades the worse of the two measures', () => {
    const before = position(ply.before, line(1300, ['d2d4']))
    const after = position(ply.after, line(1000))
    expect(gradePlayedMove(ply, before, after).grade).toBe('good')
    expect(gradePlayedMove(ply, before, position(ply.after, line(600))).grade).toBe('mistake')
    // Near equality the winning-chance band decides.
    expect(gradePlayedMove(ply, position(ply.before, line(50, ['d2d4'])), position(ply.after, line(-150))).grade).toBe('mistake')
  })

  it('treats a missed mate as a real loss but slower mates as fine', () => {
    const before = position(ply.before, line(0, ['d2d4'], 3))
    expect(gradePlayedMove(ply, before, position(ply.after, line(900))).grade).toBe('inaccuracy')
    expect(gradePlayedMove(ply, before, position(ply.after, line(0, [], 6))).grade).toBe('excellent')
    expect(gradePlayedMove(ply, before, position(ply.after, line(0, [], -4))).grade).toBe('blunder')
  })

  it("scores the played move from the same search when it is one of the engine's lines", () => {
    const before = position(ply.before, line(40, ['d2d4']), [line(40, ['e2e4']), line(10, ['c2c4'])])
    // A noisy second search says e4 lost a lot; the shared search says it equals the best.
    expect(gradePlayedMove(ply, before, position(ply.after, line(-200))).grade).toBe('best')
  })

  it('keeps book and forced grades and waits for both evaluations', async () => {
    const book = await loadOpeningBook()
    const game = plies(['e4', 'e5', 'h4'])
    const evaluations = new Map([START_FEN, ...game.map(p => p.after)].map((fen, i) => [fen, position(fen, line([30, 30, 30, -10][i], ['g1f3']))]))
    expect(gradeGame(game, evaluations, book).map(move => move?.grade)).toEqual(['book', 'book', 'good'])
    evaluations.delete(game[2].after)
    expect(gradeGame(game, evaluations, book).at(-1)).toBeNull()
    const forced = { ...game[2], legalMoves: 1 }
    expect(gradePlayedMove(forced, position(forced.before, line(30, ['g1f3'])), position(forced.after, line(-500))).grade).toBe('forced')
  })
})
