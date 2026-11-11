import { Button, Popover } from '@heroui/react'
import { Info } from 'lucide-react'
import type { GameReview, ImportedGame, Side } from '../core'
import { GradeBadge } from './GradeBadge'
import { GRADES, GRADE_ORDER, moveNumber } from '../ui/format'

interface Props {
  game: ImportedGame
  review: GameReview
  index: number
  onSelect: (index: number) => void
}

function AccuracyNote() {
  return (
    <Popover>
      <Button isIconOnly size="sm" variant="ghost" aria-label="How accuracy is calculated" className="icon-button">
        <Info size={15} />
      </Button>
      <Popover.Content placement="bottom" className="note-popover">
        <Popover.Dialog>
          <Popover.Heading className="note-popover__title">About these scores</Popover.Heading>
          <p>
            Accuracy is this app's own score. Each move is rated from the drop in winning chances, using the published
            Lichess move-accuracy formula, and the game score averages those ratings. It will not match Chess.com's
            numbers.
          </p>
          <p>Grades use fixed thresholds of lost winning chances. Results depend on the review depth you pick.</p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

export function ReviewSummary({ game, review, index, onSelect }: Props) {
  const sides: Side[] = ['white', 'black']
  return (
    <div className="summary">
      <section className="summary__accuracy" aria-labelledby="accuracy-heading">
        <div className="report-players">
          {sides.map(side => (
            <div key={side}><span className="report-player-avatar">{game[side].username[0].toUpperCase()}</span><strong><span className={`side-dot is-${side}`} aria-hidden="true" /> {game[side].username}</strong><span>{game[side].rating}</span></div>
          ))}
        </div>
        <div className="accuracy-comparison">
          <span className="accuracy-value tabular" data-testid="accuracy-white">{review.white.accuracy?.toFixed(1) ?? '—'}</span>
          <div className="section-heading"><h3 id="accuracy-heading">Accuracy</h3><AccuracyNote /></div>
          <span className="accuracy-value tabular" data-testid="accuracy-black">{review.black.accuracy?.toFixed(1) ?? '—'}</span>
        </div>
      </section>

      <section aria-labelledby="grades-heading">
        <h3 id="grades-heading" className="section-title">Move grades</h3>
        <table className="grade-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{game.white.username}</span></th>
              <th scope="col"><span className="sr-only">Grade</span></th>
              <th scope="col"><span className="sr-only">{game.black.username}</span></th>
            </tr>
          </thead>
          <tbody>
            {GRADE_ORDER.map(grade => (
              <tr key={grade} className={review.white.counts[grade] + review.black.counts[grade] === 0 ? 'is-zero' : ''}>
                <td className="tabular">{review.white.counts[grade]}</td>
                <th scope="row"><span><GradeBadge grade={grade} size="sm" /> {GRADES[grade].label}</span></th>
                <td className="tabular">{review.black.counts[grade]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="critical-heading">
        <h3 id="critical-heading" className="section-title">Critical moments</h3>
        {review.criticalPlies.length === 0 ? (
          <p className="muted">No inaccuracies, mistakes or blunders at this depth.</p>
        ) : (
          <ol className="critical-list">
            {review.criticalPlies.map(ply => {
              const move = review.moves[ply - 1]
              return (
                <li key={ply}>
                  <button
                    type="button"
                    className={`critical-item ${index === ply ? 'is-active' : ''}`}
                    onClick={() => onSelect(ply)}
                  >
                    <GradeBadge grade={move.grade} size="sm" />
                    <span className="critical-item__move tabular">{moveNumber(ply)} {move.san}</span>
                    <span className="critical-item__who">{game[move.side].username}</span>
                    <span className="critical-item__loss tabular">−{move.winningChanceLoss.toFixed(0)}%</span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {review.criticalPlies.length > 0 && <p className="fine-print">Percent shows lost winning chances.</p>}
      </section>
    </div>
  )
}
