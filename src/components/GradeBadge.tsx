import type { MoveGrade } from '../core'
import { GRADES } from '../ui/format'

export function GradeBadge({ grade, size = 'md' }: { grade: MoveGrade; size?: 'sm' | 'md' | 'board' }) {
  const meta = GRADES[grade]
  return (
    <span
      className={`grade-badge grade-badge--${size}`}
      style={{ background: meta.tone }}
      role="img"
      aria-label={meta.label}
      title={meta.label}
    >
      {meta.symbol}
    </span>
  )
}
