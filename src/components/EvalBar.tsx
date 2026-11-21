import { useState } from 'react'
import type { Side } from '../core'
import { formatEval, whiteChance } from '../ui/format'

type Evaluation = { centipawns: number; mate: number | null; depth?: number }

interface Props {
  evaluation: Evaluation | null
  orientation: Side
}

/**
 * Vertical bar showing White's winning chances, drawn from the viewer's side.
 * While a new position is pending (evaluation null) it holds the last value
 * instead of snapping back to 50/50.
 */
export function EvalBar({ evaluation: incoming, orientation }: Props) {
  const [held, setHeld] = useState<Evaluation | null>(incoming)
  if (incoming && incoming !== held) setHeld(incoming)
  const evaluation = incoming ?? held
  const pending = !incoming && !!held
  const white = evaluation ? whiteChance(evaluation) : 50
  const label = evaluation ? formatEval(evaluation) : ''
  const whiteAhead = white >= 50
  return (
    <div
      className={`eval-bar${pending ? ' is-pending' : ''}`}
      data-orientation={orientation}
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={evaluation ? `${label} (White's view)${pending ? ', updating' : ''}` : 'Not analysed'}
    >
      <div className="eval-bar__white" style={{ height: `${white}%` }} />
      {evaluation && (
        <span className={`eval-bar__label ${whiteAhead ? 'is-white' : 'is-black'}`} data-end={whiteAhead === (orientation === 'white') ? 'bottom' : 'top'}>
          {label.replace(/^\+/, '')}
        </span>
      )}
    </div>
  )
}
