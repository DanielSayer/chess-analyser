import { describe, expect, it } from 'vitest'
import { endingText, formatEval, numberedLine, outcomeFor, timeControlLabel, whiteChance } from '../../src/ui/format'
import { TEST_GAME } from '../fixtures/games'

describe('UI formatting', () => {
  it('reads the result from the selected player\'s side', () => {
    expect(outcomeFor(TEST_GAME, 'BOB')).toBe('win')
    expect(outcomeFor(TEST_GAME, 'alice')).toBe('loss')
    const draw = { ...TEST_GAME, white: { ...TEST_GAME.white, result: 'repetition' }, black: { ...TEST_GAME.black, result: 'repetition' } }
    expect(outcomeFor(draw, 'alice')).toBe('draw')
    expect(endingText(TEST_GAME)).toBe('Black won by checkmate')
    expect(endingText(draw)).toBe('Draw by repetition')
  })

  it('labels live and daily time controls', () => {
    expect(timeControlLabel({ timeControl: '300', timeClass: 'blitz' })).toBe('5 min')
    expect(timeControlLabel({ timeControl: '180+2', timeClass: 'blitz' })).toBe('3 min + 2s')
    expect(timeControlLabel({ timeControl: '30', timeClass: 'bullet' })).toBe('30 sec')
    expect(timeControlLabel({ timeControl: '1/259200', timeClass: 'daily' })).toBe('3 days')
  })

  it('formats White-perspective scores, mates and finished games', () => {
    expect(formatEval({ centipawns: 134, mate: null })).toBe('+1.3')
    expect(formatEval({ centipawns: -50, mate: null })).toBe('-0.5')
    expect(formatEval({ centipawns: 2, mate: null })).toBe('0.0')
    expect(formatEval({ centipawns: -100_000, mate: -3, depth: 12 })).toBe('-M3')
    expect(formatEval({ centipawns: -100_000, mate: -1, depth: 0 })).toBe('0-1')
    expect(whiteChance({ centipawns: 0, mate: null })).toBeCloseTo(50)
    expect(whiteChance({ centipawns: 100_000, mate: 2 })).toBe(100)
  })

  it('numbers SAN lines from the side to move', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(numberedLine(afterE4, ['e5', 'Nf3', 'Nc6'])).toBe('1… e5 2. Nf3 Nc6')
    expect(numberedLine('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e4', 'e5'])).toBe('1. e4 e5')
  })
})
