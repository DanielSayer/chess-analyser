import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchArchiveBatch, fetchArchiveIndex, importRecentGames, mergeGames, normaliseGame, normaliseUsername } from '../../src/core/chesscom'
import { API_GAME, TEST_GAME } from '../fixtures/games'

afterEach(() => vi.unstubAllGlobals())

describe('Chess.com imports', () => {
  it('normalises usernames and rejects URL or path injection', () => {
    expect(normaliseUsername(' Alice ')).toBe('alice')
    expect(() => normaliseUsername('../bob')).toThrow('username')
    expect(() => normaliseUsername('')).toThrow('username')
  })

  it('only accepts finished standard games belonging to the selected player', () => {
    expect(normaliseGame(API_GAME, 'alice')?.id).toBe(TEST_GAME.id)
    expect(normaliseGame({ ...API_GAME, rules: 'chess960' }, 'alice')).toBeNull()
    expect(normaliseGame({ ...API_GAME, pgn: '' }, 'alice')).toBeNull()
    expect(normaliseGame(API_GAME, 'carol')).toBeNull()
    expect(normaliseGame({ ...API_GAME, url: 'javascript:alert(1)' }, 'alice')).toBeNull()
  })

  it('follows only canonical archive URLs, newest first', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ archives: [
      'https://api.chess.com/pub/player/alice/games/2025/01',
      'https://evil.example/steal',
      'https://api.chess.com/pub/player/bob/games/2026/01',
      'https://api.chess.com/pub/player/alice/games/2026/01',
      'https://api.chess.com/pub/player/alice/games/2026/01',
    ] })))
    expect(await fetchArchiveIndex('Alice')).toEqual([
      'https://api.chess.com/pub/player/alice/games/2026/01',
      'https://api.chess.com/pub/player/alice/games/2025/01',
    ])
  })

  it('loads archives serially, retains the whole month and returns older archives', async () => {
    let active = false
    const fetcher = vi.fn(async (url: string) => {
      expect(active).toBe(false)
      active = true
      await Promise.resolve()
      active = false
      if (url.endsWith('archives')) return Response.json({ archives: [
        'https://api.chess.com/pub/player/alice/games/2025/11',
        'https://api.chess.com/pub/player/alice/games/2025/12',
        'https://api.chess.com/pub/player/alice/games/2026/01',
      ] })
      return Response.json({ games: url.endsWith('2026/01') ? [] : Array.from({ length: 25 }, (_, i) => ({
        ...API_GAME, uuid: `id-${i}`, url: `https://www.chess.com/game/live/${100 + i}`, end_time: API_GAME.end_time + i,
      })) })
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await importRecentGames('alice')
    expect(result.games).toHaveLength(25)
    expect(result.games[0].id).toBe('id-24')
    expect(result.remainingArchives).toEqual(['https://api.chess.com/pub/player/alice/games/2025/11'])
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not request untrusted archives even if supplied directly', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchArchiveBatch('alice', ['https://evil.example/'])).rejects.toThrow('Invalid')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports rate limits without silently displaying an empty game list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    await expect(importRecentGames('alice')).rejects.toMatchObject({ status: 429 })
  })

  it('preserves cancellation instead of turning it into a network error', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(importRecentGames('alice', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('deduplicates games by canonical URL and sorts newest first', () => {
    expect(mergeGames([TEST_GAME], [{ ...TEST_GAME, id: 'another-id' }])).toHaveLength(1)
  })
})
