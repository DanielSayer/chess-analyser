import type { Side } from '../core'
import { formatEval, whiteChance } from '../ui/format'

interface Props {
  evaluation: { centipawns: number; mate: number | null; depth?: number } | null
  orientation: Side
}

/** Vertical bar showing White's winning chances, drawn from the viewer's side. */
export function EvalBar({ evaluation, orientation }: Props) {
  const white = evaluation ? whiteChance(evaluation) : 50
  const label = evaluation ? formatEval(evaluation) : ''
  const whiteAhead = white >= 50
  return (
    <div
      className="eval-bar"
      data-orientation={orientation}
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={evaluation ? `${label} (White's view)` : 'Not analysed'}
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
