import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { GameReview } from '../core'
import { GRADES, formatEval, moveNumber, whiteChance } from '../ui/format'

interface Props {
  review: GameReview
  index: number
  onSelect: (index: number) => void
}

/** White's winning chances over the game. Click or use arrow keys to move through it. */
export function EvalGraph({ review, index, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const last = review.positions.length - 1
  const values = review.positions.map(whiteChance)
  const x = (i: number) => (last ? (i / last) * 100 : 0)
  const points = values.map((v, i) => `${x(i)},${100 - v}`).join(' ')
  const area = `0,100 ${points} 100,100`

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || !rect.width) return
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    onSelect(Math.round(ratio * last))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: last }
    if (!(event.key in moves)) return
    event.preventDefault()
    onSelect(Math.max(0, Math.min(last, moves[event.key])))
  }

  const current = review.positions[index]
  const move = index > 0 ? review.moves[index - 1] : null
  const valueText = `${move ? `${moveNumber(move.ply)} ${move.san}` : 'Start'}, ${formatEval(current)}`

  return (
    <div
      ref={ref}
      className="eval-graph"
      role="slider"
      tabIndex={0}
      aria-label="Evaluation graph"
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={index}
      aria-valuetext={valueText}
      onPointerDown={pick}
      onPointerMove={event => { if (event.buttons === 1) pick(event) }}
      onKeyDown={onKeyDown}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width="100" height="100" className="eval-graph__black" />
        <polygon points={area} className="eval-graph__white" />
        <line x1="0" x2="100" y1="50" y2="50" className="eval-graph__mid" vectorEffect="non-scaling-stroke" />
      </svg>
      {review.moves.map(m => m.grade === 'blunder' && (
        <span
          key={m.ply}
          className="eval-graph__dot"
          style={{ left: `${x(m.ply)}%`, top: `${100 - values[m.ply]}%`, background: GRADES[m.grade].tone }}
          aria-hidden="true"
        />
      ))}
      <span className="eval-graph__cursor" style={{ left: `${x(index)}%` }} aria-hidden="true" />
    </div>
  )
}
