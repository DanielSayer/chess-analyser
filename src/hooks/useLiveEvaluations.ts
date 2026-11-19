import { useEffect, useRef, useState } from 'react'
import type { PositionEvaluation } from '../core'
import { StockfishEngine } from '../core'

export type LiveEngineStatus = 'done' | 'thinking' | 'error'

/**
 * Evaluates every position of a game being played, one at a time on a single
 * engine. The focused position goes first so the bar updates straight after a
 * move; the rest fill in from the start so earlier moves can be graded.
 * A running search always finishes, so fast moves never restart the worker.
 */
export function useLiveEvaluations(fens: string[], focus: string, initial: PositionEvaluation[]) {
  const [evaluations, setEvaluations] = useState<ReadonlyMap<string, PositionEvaluation>>(() => new Map(initial.map(e => [e.fen, e])))
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  // Bumped when a search is abandoned, so the queue looks for work again.
  const [retry, setRetry] = useState(0)
  const engine = useRef<StockfishEngine | null>(null)
  const running = useRef(false)

  useEffect(() => () => { engine.current?.dispose(); engine.current = null }, [])

  useEffect(() => {
    if (running.current) return
    const pending = (fen: string) => !evaluations.has(fen) && !failed.has(fen)
    const next = pending(focus) ? focus : fens.find(pending)
    if (!next) return
    running.current = true
    engine.current ??= new StockfishEngine()
    const current = engine.current
    current.evaluate(next, { preset: 'standard', multiPv: 3 }).then(
      evaluation => {
        running.current = false
        if (engine.current === current) setEvaluations(map => new Map(map).set(next, evaluation))
        else setRetry(n => n + 1)
      },
      () => {
        running.current = false
        // The engine closes itself after an error; the next search starts a fresh one.
        if (engine.current === current) {
          engine.current = null
          setFailed(set => new Set(set).add(next))
        } else setRetry(n => n + 1)
      },
    )
  }, [fens, focus, evaluations, failed, retry])

  const status: LiveEngineStatus = evaluations.has(focus) ? 'done' : failed.has(focus) ? 'error' : 'thinking'
  return { evaluations, status }
}
