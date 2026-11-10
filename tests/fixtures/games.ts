import type { ImportedGame } from '../../src/core/types'

// Synthetic games for deterministic tests, never displayed as imported data.
export const TEST_PGN = `[Event "Test game"]
[Site "Chess.com"]
[Date "2026.01.01"]
[White "alice"]
[Black "bob"]
[Result "0-1"]
[ECO "A00"]

1. f3 {[%clk 0:04:58]} e5 2. g4 Qh4# 0-1`

export const TEST_GAME: ImportedGame = {
  id: 'test-game-1',
  url: 'https://www.chess.com/game/live/123456789',
  pgn: TEST_PGN,
  white: { username: 'alice', rating: 1200, result: 'checkmated' },
  black: { username: 'bob', rating: 1250, result: 'win' },
  endTime: 1767225600,
  timeClass: 'blitz',
  timeControl: '300',
  rated: true,
  opening: "Barnes Opening",
  eco: 'A00',
}

export const API_GAME = {
  uuid: TEST_GAME.id,
  url: TEST_GAME.url,
  pgn: TEST_GAME.pgn,
  white: TEST_GAME.white,
  black: TEST_GAME.black,
  end_time: TEST_GAME.endTime,
  time_class: TEST_GAME.timeClass,
  time_control: TEST_GAME.timeControl,
  rated: true,
  rules: 'chess',
}
