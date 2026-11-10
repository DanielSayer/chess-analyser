import type { ImportedGame, ImportResult, OperationOptions, Player } from './types'

const API = 'https://api.chess.com/pub/player/'

export class ImportError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ImportError'
    this.status = status
  }
}

export function normaliseUsername(input: string): string {
  const username = input.trim().toLowerCase()
  if (!/^[a-z0-9_-]{1,40}$/.test(username)) {
    throw new ImportError('Enter a Chess.com username using letters, numbers, underscores or hyphens.')
  }
  return username
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted()
  let response: Response
  try {
    response = await fetch(url, { signal, credentials: 'omit' })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ImportError('Could not reach Chess.com. Check your connection and try again.')
  }
  if (!response.ok) {
    const message = response.status === 404
      ? 'That Chess.com player or archive could not be found.'
      : response.status === 429
        ? 'Chess.com is limiting requests. Wait a moment, then try again.'
        : 'Chess.com could not load these games. Try again shortly.'
    throw new ImportError(message, response.status)
  }
  try {
    return await response.json()
  } catch {
    throw new ImportError('Chess.com returned an unreadable response. Please try again.')
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function player(value: unknown): Player | null {
  const entry = record(value)
  if (!entry || typeof entry.username !== 'string') return null
  return {
    username: entry.username,
    rating: typeof entry.rating === 'number' && Number.isFinite(entry.rating) ? entry.rating : null,
    result: typeof entry.result === 'string' ? entry.result : '',
  }
}

export function pgnHeader(pgn: string, name: string): string | null {
  return new RegExp(`\\[${name}\\s+"([^"\\n]*)"\\]`).exec(pgn)?.[1] ?? null
}

export function normaliseGame(value: unknown, username: string): ImportedGame | null {
  const entry = record(value)
  if (!entry || entry.rules !== 'chess' || typeof entry.pgn !== 'string' || !entry.pgn.trim()) return null
  const white = player(entry.white)
  const black = player(entry.black)
  if (!white || !black || ![white.username, black.username].some(name => name.toLowerCase() === username)) return null
  if (typeof entry.end_time !== 'number' || !Number.isFinite(entry.end_time)) return null
  if (typeof entry.url !== 'string' || !/^https:\/\/(www\.)?chess\.com\/game\/(live|daily)\/\d+\/?$/.test(entry.url)) return null
  const opening = pgnHeader(entry.pgn, 'Opening')
  // ECOUrl identifies the opening even when Chess.com omits the Opening header.
  const ecoUrl = pgnHeader(entry.pgn, 'ECOUrl') ?? (typeof entry.eco === 'string' ? entry.eco : null)
  let inferredOpening: string | null = null
  if (ecoUrl) {
    try {
      inferredOpening = decodeURIComponent(new URL(ecoUrl).pathname.split('/').filter(Boolean).at(-1) ?? '').replaceAll('-', ' ') || null
    } catch { /* An opening URL is optional metadata. */ }
  }
  return {
    id: typeof entry.uuid === 'string' && entry.uuid ? entry.uuid : entry.url,
    url: entry.url,
    pgn: entry.pgn,
    white,
    black,
    endTime: entry.end_time,
    timeClass: typeof entry.time_class === 'string' ? entry.time_class : 'unknown',
    timeControl: typeof entry.time_control === 'string' ? entry.time_control : '',
    rated: entry.rated === true,
    opening: opening ?? inferredOpening,
    eco: pgnHeader(entry.pgn, 'ECO'),
  }
}

export function mergeGames(...groups: ImportedGame[][]): ImportedGame[] {
  // The canonical game URL also deduplicates responses with inconsistent UUIDs.
  const games = new Map<string, ImportedGame>()
  for (const group of groups) for (const game of group) games.set(game.url, game)
  return [...games.values()].sort((a, b) => b.endTime - a.endTime || a.url.localeCompare(b.url))
}

export async function fetchArchiveIndex(input: string, options: OperationOptions = {}): Promise<string[]> {
  const username = normaliseUsername(input)
  const data = record(await getJson(`${API}${encodeURIComponent(username)}/games/archives`, options.signal))
  if (!data || !Array.isArray(data.archives)) throw new ImportError('Chess.com returned an invalid archive list.')
  const prefix = `${API}${username}/games/`
  // Never follow arbitrary URLs provided by external data.
  return [...new Set(data.archives.filter((url): url is string =>
    typeof url === 'string' && url.startsWith(prefix) && /^\d{4}\/(0[1-9]|1[0-2])$/.test(url.slice(prefix.length)),
  ))].sort().reverse()
}

export async function fetchArchiveBatch(
  input: string,
  archives: string[],
  options: OperationOptions & { minimumGames?: number; maxMonths?: number } = {},
): Promise<ImportResult> {
  const username = normaliseUsername(input)
  const remaining = [...archives]
  let games: ImportedGame[] = []
  let months = 0
  while (remaining.length && months < (options.maxMonths ?? 3) && games.length < (options.minimumGames ?? 20)) {
    options.signal?.throwIfAborted()
    const url = remaining.shift()!
    const prefix = `${API}${username}/games/`
    if (!url.startsWith(prefix) || !/^\d{4}\/(0[1-9]|1[0-2])$/.test(url.slice(prefix.length))) {
      throw new ImportError('Invalid Chess.com archive URL.')
    }
    const data = record(await getJson(url, options.signal))
    if (!data || !Array.isArray(data.games)) throw new ImportError('Chess.com returned an invalid games list.')
    const imported = data.games.map(game => normaliseGame(game, username)).filter((game): game is ImportedGame => game !== null)
    games = mergeGames(games, imported)
    months++
  }
  return { username, games, remainingArchives: remaining }
}

export async function importRecentGames(input: string, options: OperationOptions = {}): Promise<ImportResult> {
  const username = normaliseUsername(input)
  const archives = await fetchArchiveIndex(username, options)
  return fetchArchiveBatch(username, archives, options)
}
