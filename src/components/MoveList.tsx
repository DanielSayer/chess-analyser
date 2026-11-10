import { useEffect, useRef } from 'react'
import type { GameReview, ParsedPly } from '../core'
import { GradeBadge } from './GradeBadge'

interface Props {
  plies: ParsedPly[]
  review: GameReview | null
  index: number
  inVariation: boolean
  onSelect: (index: number) => void
}

const QUIET = new Set(['best', 'excellent', 'good', 'forced'])

export function MoveList({ plies, review, index, inVariation, onSelect }: Props) {
  const ref = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const list = ref.current
    const active = list?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!list || !active) return
    // Scroll only the list, never the page.
    const top = active.offsetTop - list.offsetTop
    if (top < list.scrollTop) list.scrollTop = top - 8
    else if (top + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + active.offsetHeight - list.clientHeight + 8
  }, [index])

  const rows: ParsedPly[][] = []
  for (let i = 0; i < plies.length; i += 2) rows.push(plies.slice(i, i + 2))
  const startsWithBlack = plies[0]?.side === 'black'

  return (
    <ol ref={ref} className={`move-list ${inVariation ? 'is-dimmed' : ''}`} aria-label="Moves">
      {rows.map((row, r) => (
        <li key={r} className="move-list__row">
          <span className="move-list__no tabular">{r + 1}.</span>
          {startsWithBlack && r === 0 && <span className="move-list__cell" />}
          {row.map(ply => {
            const reviewed = review?.moves[ply.ply - 1]
            const showBadge = reviewed && !QUIET.has(reviewed.grade)
            return (
              <button
                key={ply.ply}
                type="button"
                className="move-list__cell move"
                aria-current={index === ply.ply ? 'step' : undefined}
                onClick={() => onSelect(ply.ply)}
              >
                <span className="move__san">{ply.san}</span>
                {reviewed && showBadge && <GradeBadge grade={reviewed.grade} size="sm" />}
              </button>
            )
          })}
        </li>
      ))}
    </ol>
  )
}
