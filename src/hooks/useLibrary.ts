import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImportedGame } from '../core'
import {
  clearLocalData,
  fetchArchiveBatch,
  importRecentGames,
  loadGames,
  loadLastUsername,
  loadReviewedIds,
  mergeGames,
  normaliseUsername,
  saveGames,
  saveLastUsername,
} from '../core'
import { errorMessage, isAbortError } from '../ui/format'

export type LibraryStatus = 'restoring' | 'idle' | 'importing' | 'loading-older' | 'clearing'

export interface LibraryState {
  /** The player whose games are listed. Only changes after a successful import or restore. */
  username: string | null
  games: ImportedGame[]
  /** Older monthly archives still to load. `null` means unknown until the next refresh. */
  remainingArchives: string[] | null
  status: LibraryStatus
  /** The username currently being imported, if any. */
  pendingUsername: string | null
  importError: string | null
  olderError: string | null
  /** True after a successful import, false when the list only came from local storage. */
  synced: boolean
  storageIssue: boolean
  reviewedIds: ReadonlySet<string>
}

const initialState: LibraryState = {
  username: null,
  games: [],
  remainingArchives: null,
  status: 'restoring',
  pendingUsername: null,
  importError: null,
  olderError: null,
  synced: false,
  storageIssue: false,
  reviewedIds: new Set(),
}

export function useLibrary() {
  const [state, setState] = useState<LibraryState>(initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  // Every network or storage operation takes a token. A newer operation makes
  // older results stale, so a slow response can never replace a newer player.
  const tokenRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const flagStorage = useCallback(() => setState(s => (s.storageIssue ? s : { ...s, storageIssue: true })), [])

  useEffect(() => {
    const token = ++tokenRef.current
    let cancelled = false
    void (async () => {
      let reviewedIds: string[] = []
      try {
        reviewedIds = await loadReviewedIds()
      } catch {
        if (!cancelled) flagStorage()
      }
      if (cancelled) return
      setState(s => ({ ...s, reviewedIds: new Set([...s.reviewedIds, ...reviewedIds]) }))
      try {
        const last = await loadLastUsername()
        if (!last || cancelled || token !== tokenRef.current) return
        const games = await loadGames(last)
        if (cancelled || token !== tokenRef.current) return
        setState(s => ({ ...s, username: last, games, remainingArchives: null, synced: false }))
      } catch {
        if (!cancelled) flagStorage()
      } finally {
        if (!cancelled && token === tokenRef.current) setState(s => ({ ...s, status: 'idle' }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [flagStorage])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const persist = useCallback((username: string, games: ImportedGame[]) => {
    void (async () => {
      try {
        if (games.length) await saveGames(games)
        await saveLastUsername(username)
      } catch {
        flagStorage()
      }
    })()
  }, [flagStorage])

  /** Imports recent games. Returns a validation message instead of starting when the username is invalid. */
  const importPlayer = useCallback(async (input: string): Promise<string | null> => {
    let username: string
    try {
      username = normaliseUsername(input)
    } catch (error) {
      return errorMessage(error, 'Enter a valid Chess.com username.')
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const token = ++tokenRef.current
    setState(s => ({ ...s, status: 'importing', pendingUsername: username, importError: null, olderError: null }))
    try {
      const result = await importRecentGames(username, { signal: controller.signal })
      let stored: ImportedGame[] = []
      try {
        stored = await loadGames(username)
      } catch {
        flagStorage()
      }
      if (token !== tokenRef.current) return null
      setState(s => ({
        ...s,
        username,
        games: s.username === username ? mergeGames(s.games, stored, result.games) : mergeGames(stored, result.games),
        remainingArchives: result.remainingArchives,
        status: 'idle',
        pendingUsername: null,
        synced: true,
      }))
      persist(username, result.games)
    } catch (error) {
      if (token !== tokenRef.current) return null
      setState(s => ({
        ...s,
        status: 'idle',
        pendingUsername: null,
        importError: isAbortError(error) ? null : errorMessage(error, 'Could not import games. Try again.'),
      }))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
    return null
  }, [flagStorage, persist])

  const loadOlder = useCallback(async () => {
    const { username, remainingArchives } = stateRef.current
    if (!username || !remainingArchives?.length) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const token = ++tokenRef.current
    setState(s => ({ ...s, status: 'loading-older', olderError: null, importError: null }))
    try {
      const result = await fetchArchiveBatch(username, remainingArchives, { signal: controller.signal })
      if (token !== tokenRef.current) return
      setState(s => s.username !== username ? { ...s, status: 'idle' } : {
        ...s,
        games: mergeGames(s.games, result.games),
        remainingArchives: result.remainingArchives,
        status: 'idle',
      })
      persist(username, result.games)
    } catch (error) {
      if (token !== tokenRef.current) return
      setState(s => ({
        ...s,
        status: 'idle',
        olderError: isAbortError(error) ? null : errorMessage(error, 'Could not load older games. Try again.'),
      }))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [persist])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
  }, [])

  const markReviewed = useCallback((gameId: string) => {
    setState(s => s.reviewedIds.has(gameId) ? s : { ...s, reviewedIds: new Set([...s.reviewedIds, gameId]) })
  }, [])

  const clearAll = useCallback(async (): Promise<string | null> => {
    controllerRef.current?.abort()
    const token = ++tokenRef.current
    setState(s => ({ ...s, status: 'clearing' }))
    try {
      await clearLocalData()
      if (token === tokenRef.current) setState({ ...initialState, status: 'idle', reviewedIds: new Set() })
      return null
    } catch {
      if (token === tokenRef.current) setState(s => ({ ...s, status: 'idle', storageIssue: true }))
      return 'Browser storage could not be cleared. Close other tabs using this app, then try again.'
    }
  }, [])

  return { state, importPlayer, loadOlder, cancel, markReviewed, clearAll, flagStorage }
}
