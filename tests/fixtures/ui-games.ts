import { Chess } from 'chess.js'
import type { Page, Route } from '@playwright/test'
import { API_GAME } from './games'

/*
 * MOCKED Chess.com data for UI tests. These games are synthetic: legal move
 * sequences with invented players, served through page.route so tests never
 * touch the real API. They must never be presented as real imported games.
 */

export const PLAYER = 'fixture_player'

interface GameSpec {
  id: string
  moves: string
  white: string
  black: string
  whiteResult: string
  blackResult: string
  end: string
  timeClass: string
  timeControl: string
  opening: string
  eco: string
}

function buildPgn(spec: GameSpec): string {
  const chess = new Chess()
  const sans = spec.moves.split(' ')
  let white = 300
  let black = 300
  const parts: string[] = []
  sans.forEach((san, i) => {
    chess.move(san)
    if (i % 2 === 0) white -= 3 + (i % 7)
    else black -= 4 + (i % 5)
    const clock = i % 2 === 0 ? white : black
    const text = `0:${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
    parts.push(`${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${san} {[%clk ${text}]}`)
  })
  const result = spec.whiteResult === 'win' ? '1-0' : spec.blackResult === 'win' ? '0-1' : '1/2-1/2'
  return [
    '[Event "Live Chess"]',
    '[Site "Chess.com"]',
    `[White "${spec.white}"]`,
    `[Black "${spec.black}"]`,
    `[Result "${result}"]`,
    `[ECO "${spec.eco}"]`,
    `[ECOUrl "https://www.chess.com/openings/${spec.opening.replaceAll(' ', '-')}"]`,
    '',
    `${parts.join(' ')} ${result}`,
  ].join('\n')
}

function apiGame(spec: GameSpec, ratings: [number, number]) {
  return {
    uuid: spec.id,
    url: `https://www.chess.com/game/live/${spec.id.replace(/\D/g, '').padEnd(9, '7')}`,
    pgn: buildPgn(spec),
    white: { username: spec.white, rating: ratings[0], result: spec.whiteResult },
    black: { username: spec.black, rating: ratings[1], result: spec.blackResult },
    end_time: Math.floor(Date.parse(spec.end) / 1000),
    time_class: spec.timeClass,
    time_control: spec.timeControl,
    rated: true,
    rules: 'chess',
  }
}

export const GAMES = {
  sicilian: apiGame({
    id: 'g-1001', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5 g5 b4 Ne2 Ne8 f4 a5 f5 a4 Nbd4 exd4 Nxd4 b3 Kb1 bxc2+ Nxc2 Bb3 axb3 axb3 Na3 Rxa3 bxa3 Qa5',
    white: 'Fixture_Player', black: 'rook_lift', whiteResult: 'resigned', blackResult: 'win',
    end: '2026-11-08T19:20:00Z', timeClass: 'blitz', timeControl: '300', opening: 'Sicilian Defense Najdorf Variation', eco: 'B90',
  }, [1488, 1502]),
  london: apiGame({
    id: 'g-1002', moves: 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3 b6 Ne5 Bb7 f4 Ne7 Qf3 Nf5 Bf2 Nd7 g4 Nh6 h3 f6 Nxd7 Qxd7 O-O-O c4 Bc2 b5 e4 b4 e5 fxe5 fxe5 Rxf3',
    white: 'quiet_bishop', black: 'Fixture_Player', whiteResult: 'resigned', blackResult: 'win',
    end: '2026-11-05T12:00:00Z', timeClass: 'rapid', timeControl: '600', opening: 'London System', eco: 'D02',
  }, [1530, 1495]),
  scholars: apiGame({
    id: 'g-1003', moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#',
    white: 'Fixture_Player', black: 'hasty_knight', whiteResult: 'win', blackResult: 'checkmated',
    end: '2026-11-02T08:30:00Z', timeClass: 'bullet', timeControl: '60', opening: 'Italian Game', eco: 'C23',
  }, [1490, 1312]),
  italian: apiGame({
    id: 'g-1004', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3 Nxe4 O-O Bxc3 d5 Bf6 Re1 Ne7 Rxe4 d6 Bg5 Bxg5 Nxg5 h6 Qe2 hxg5 Re1 Be6 dxe6 f6 Re3 c6 Rh3 Rxh3 gxh3 g6 Qf3 Qa5 Rd1 Qf5 Qb3 O-O-O Qa3 Qc5 Qxc5 dxc5',
    white: 'Fixture_Player', black: 'endgame_owl', whiteResult: 'agreed', blackResult: 'agreed',
    end: '2026-10-21T17:45:00Z', timeClass: 'blitz', timeControl: '180+2', opening: 'Italian Game Classical Variation', eco: 'C54',
  }, [1475, 1468]),
  /** The four-ply checkmate from the core fixture, owned by another user. */
  fools: { ...API_GAME, white: { ...API_GAME.white, username: 'other_user' }, black: { ...API_GAME.black, username: 'Fixture_Player' } },
}

export interface MockOptions {
  /** Month (YYYY/MM) to games. Ordered oldest to newest is not required. */
  months?: Record<string, unknown[]>
  /** HTTP status for the archive index, to simulate failures. */
  indexStatus?: number
  /** Milliseconds to delay each response. */
  delay?: number
  player?: string
}

export const DEFAULT_MONTHS: Record<string, unknown[]> = {
  '2026/11': [GAMES.sicilian, GAMES.london, GAMES.scholars],
  '2026/10': [GAMES.italian],
  '2026/09': [],
  '2026/08': [GAMES.fools],
}

/** Serves MOCKED Chess.com public API responses. Returns the list of requested URLs. */
export async function mockChessCom(page: Page, options: MockOptions = {}): Promise<string[]> {
  const player = (options.player ?? PLAYER).toLowerCase()
  const months = options.months ?? DEFAULT_MONTHS
  const requests: string[] = []
  const base = `https://api.chess.com/pub/player/${player}/games`
  await page.route('https://api.chess.com/**', async (route: Route) => {
    const url = route.request().url()
    requests.push(url)
    if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay))
    const json = (status: number, body: unknown) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    }).catch(() => undefined)
    if (url === `${base}/archives`) {
      if (options.indexStatus && options.indexStatus !== 200) return json(options.indexStatus, { message: 'error' })
      return json(200, { archives: Object.keys(months).sort().map(month => `${base}/${month}`) })
    }
    const month = url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null
    if (month && month in months) return json(200, { games: months[month] })
    return json(404, { message: 'not found' })
  })
  return requests
}
