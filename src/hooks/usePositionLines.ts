import { useEffect, useState } from 'react'
import type { PositionEvaluation } from '../core'
import { analysePosition } from '../core'

export type PositionLinesStatus = 'idle' | 'waiting' | 'done' | 'error'

interface Result {
  fen: string | null
  status: PositionLinesStatus
  evaluation: PositionEvaluation | null
}

const DEBOUNCE_MS = 350

/**
 * Analyses one explored position at a time with three engine lines.
 * Each new position or a disable aborts the previous search, which
 * terminates its worker, so stepping through moves cannot pile up engines.
 */
export function usePositionLines(fen: string | null, enabled: boolean): Result {
  const [result, setResult] = useState<Result>({ fen: null, status: 'idle', evaluation: null })

  useEffect(() => {
    if (!enabled || !fen) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      analysePosition(fen, { preset: 'standard', multiPv: 3, signal: controller.signal })
        .then(evaluation => {
          if (!controller.signal.aborted) setResult({ fen, status: 'done', evaluation })
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ fen, status: 'error', evaluation: null })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [fen, enabled])

  if (!enabled || !fen) return { fen, status: 'idle', evaluation: null }
  if (result.fen !== fen) return { fen, status: 'waiting', evaluation: null }
  return result
}
