import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnalysisPreset, AnalysisProgress, GameReview, ImportedGame } from '../core'
import { analyseGame, loadReview, saveReview } from '../core'
import { errorMessage, isAbortError } from '../ui/format'

export interface ReviewRun {
  preset: AnalysisPreset
  progress: AnalysisProgress | null
}

export interface ReviewState {
  /** The latest completed review. Never a partial result. */
  review: GameReview | null
  loadingSaved: boolean
  run: ReviewRun | null
  error: string | null
  cancelled: boolean
}

interface Options {
  /** A completed review already held in memory for this game. */
  cached: GameReview | null
  onComplete: (review: GameReview) => void
  onSaved: (gameId: string) => void
  onStorageIssue: () => void
}

/**
 * Owns analysis for one game. Mount it under a component keyed by game ID so a
 * game switch unmounts it, which cancels any run and drops late results.
 */
export function useGameReview(game: ImportedGame, { cached, onComplete, onSaved, onStorageIssue }: Options) {
  const [state, setState] = useState<ReviewState>({
    review: cached,
    loadingSaved: cached === null,
    run: null,
    error: null,
    cancelled: false,
  })
  const runRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const nextRun = useRef(0)
  const callbacks = useRef({ onComplete, onSaved, onStorageIssue })
  useLayoutEffect(() => {
    callbacks.current = { onComplete, onSaved, onStorageIssue }
  })

  useEffect(() => {
    if (cached) return
    let active = true
    loadReview(game)
      .then(saved => {
        if (!active) return
        // A run that finished first wins over the older saved copy.
        setState(s => ({ ...s, review: s.review ?? saved, loadingSaved: false }))
        if (saved) callbacks.current.onComplete(saved)
      })
      .catch(() => {
        if (!active) return
        setState(s => ({ ...s, loadingSaved: false }))
        callbacks.current.onStorageIssue()
      })
    return () => {
      active = false
    }
  }, [game, cached])

  useEffect(() => () => {
    runRef.current?.controller.abort()
    runRef.current = null
  }, [])

  const start = useCallback((preset: AnalysisPreset) => {
    runRef.current?.controller.abort()
    const controller = new AbortController()
    const id = ++nextRun.current
    runRef.current = { id, controller }
    const current = () => runRef.current?.id === id && !controller.signal.aborted
    setState(s => ({ ...s, run: { preset, progress: null }, error: null, cancelled: false }))
    analyseGame(game, {
      preset,
      signal: controller.signal,
      onProgress: progress => {
        if (current()) setState(s => (s.run ? { ...s, run: { ...s.run, progress } } : s))
      },
    })
      .then(review => {
        if (!current()) return
        runRef.current = null
        setState(s => ({ ...s, review, run: null }))
        callbacks.current.onComplete(review)
        saveReview(review)
          .then(() => callbacks.current.onSaved(review.gameId))
          .catch(() => callbacks.current.onStorageIssue())
      })
      .catch(error => {
        if (runRef.current?.id !== id) return
        runRef.current = null
        const aborted = isAbortError(error)
        // The previous completed review stays in place after failure or cancellation.
        setState(s => ({
          ...s,
          run: null,
          cancelled: aborted,
          error: aborted ? null : errorMessage(error, 'Analysis failed. Try again.'),
        }))
      })
  }, [game])

  const cancel = useCallback(() => {
    runRef.current?.controller.abort()
  }, [])

  return { ...state, start, cancel }
}
