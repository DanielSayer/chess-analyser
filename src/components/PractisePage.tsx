import { Button, Spinner } from '@heroui/react'
import { ArrowRight, Eye, FlipVertical2, Lightbulb, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { GameReview, Puzzle, Side } from '../core'
import { isPromotion } from '../core'
import { usePractice } from '../hooks/usePractice'
import type { PracticeAttempt } from '../hooks/usePractice'
import { useReplayKeys } from '../hooks/useReplayKeys'
import { AnalysisBoard } from './AnalysisBoard'
import type { BoardArrow } from './AnalysisBoard'
import { GradeBadge } from './GradeBadge'
import { PromotionPicker } from './PromotionPicker'
import { GRADES, moveNumber, numberedLine } from '../ui/format'

const BEST_ARROW = 'rgba(224, 80, 31, 0.82)'
const other = (side: Side): Side => (side === 'white' ? 'black' : 'white')
const capital = (side: Side) => (side === 'white' ? 'White' : 'Black')
const noop = () => {}

interface Props {
  isActive: boolean
  username: string | null
  sessionReviews: ReadonlyMap<string, GameReview>
  focus: { id: string; key: number } | null
  /** Opens the puzzle's game in the review at the mistake, when that game is available. */
  onOpenGame?: (puzzle: Puzzle) => void
  canOpenGame: (puzzle: Puzzle) => boolean
  onGoToGames: () => void
}

export function PractisePage({ isActive, username, sessionReviews, focus, onOpenGame, canOpenGame, onGoToGames }: Props) {
  const practice = usePractice({ isActive, username, sessionReviews, focus })
  const { puzzle, attempt } = practice
  const [flipped, setFlipped] = useState(false)
  const [promotion, setPromotion] = useState<{ fen: string; from: string; to: string } | null>(null)

  useReplayKeys({ prev: noop, next: noop, start: noop, end: noop, flip: () => setFlipped(f => !f), escape: () => setPromotion(null) }, isActive)

  if (practice.loading) return <div className="view-loading"><Spinner size="lg" aria-label="Loading practice" /></div>
  if (!puzzle) return <PracticeEmpty hasPlayer={username !== null} onGoToGames={onGoToGames} />

  const solvedOrShown = attempt.status === 'solved' || attempt.status === 'revealed'
  const shownAnswer = attempt.status === 'solved' || attempt.status === 'checking' ? attempt.answer?.ply ?? null : null
  const fen = shownAnswer?.after ?? puzzle.fen
  const pendingPromotion = promotion?.fen === fen ? promotion : null
  const orientation = flipped ? other(puzzle.side) : puzzle.side
  const arrows: BoardArrow[] = attempt.status === 'revealed'
    ? [{ from: puzzle.bestMove.slice(0, 2), to: puzzle.bestMove.slice(2, 4), color: BEST_ARROW }]
    : []
  const lastMove = shownAnswer
    ? { from: shownAnswer.uci.slice(0, 2), to: shownAnswer.uci.slice(2, 4) }
    : puzzle.previousMove ? { from: puzzle.previousMove.slice(0, 2), to: puzzle.previousMove.slice(2, 4) } : null

  const onMove = (from: string, to: string) => {
    if (isPromotion(fen, from, to)) { setPromotion({ fen, from, to }); return false }
    return practice.answer({ from, to })
  }

  const opponent = puzzle.side === 'white' ? puzzle.black : puzzle.white
  const you = puzzle.side === 'white' ? puzzle.white : puzzle.black
  const top = other(orientation)
  const name = (side: Side) => (side === 'white' ? puzzle.white : puzzle.black)

  return (
    <div className="workspace practise">
      <div className="workspace__board">
        <header className="game-header">
          <div className="game-header__text">
            <h2 className="game-header__title"><span role="status">{solvedOrShown ? 'Position done' : `${capital(puzzle.side)} to move`}</span></h2>
            <p className="game-header__meta">
              <span>{puzzle.local ? 'Played on this device' : `${you} vs ${opponent}`}</span>
              {puzzle.date && <span>{puzzle.date.replaceAll('.', '-')}</span>}
              {puzzle.opening && <span>{puzzle.opening}</span>}
            </p>
          </div>
        </header>
        <div className="board-area">
          <PracticeStrip name={name(top)} side={top} toMove={!solvedOrShown && puzzle.side === top} />
          <div className="board-row">
            <div className="eval-bar is-off" aria-hidden="true" />
            <div className="board-frame" data-testid="practice-board" data-puzzle={puzzle.id}>
              <AnalysisBoard
                id="practice-board"
                fen={fen}
                orientation={orientation}
                lastMove={lastMove}
                moveGrade={attempt.status === 'solved' ? attempt.answer?.grade ?? null : null}
                arrows={arrows}
                animate
                interactive={!solvedOrShown && attempt.status !== 'checking' && !pendingPromotion}
                hint={attempt.hint && !solvedOrShown ? puzzle.bestMove.slice(0, 2) : null}
                onMove={onMove}
              />
              {pendingPromotion && (
                <PromotionPicker
                  side={puzzle.side}
                  onPick={piece => { setPromotion(null); practice.answer({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece }) }}
                  onCancel={() => setPromotion(null)}
                />
              )}
            </div>
          </div>
          <PracticeStrip name={name(other(top))} side={other(top)} toMove={!solvedOrShown && puzzle.side !== top} />
        </div>
        <div className="replay-controls">
          <span className="replay-controls__position">Move {Math.ceil(puzzle.ply / 2)} · {capital(puzzle.side)} to play</span>
          <div className="replay-controls__tools">
            <Button isIconOnly size="sm" variant="secondary" aria-label="Flip board" onPress={() => setFlipped(f => !f)}>
              <FlipVertical2 size={16} />
            </Button>
          </div>
        </div>
      </div>

      <aside className="workspace__panel practise-panel" aria-label="Practice">
        <header className="report-heading">
          <div><h2>Practise <em>mistakes</em></h2><p>Positions from your reviewed games</p></div>
          <span className="report-heading__mark" aria-hidden="true">?!</span>
        </header>

        <PracticeProgress summary={practice.summary} session={practice.session} />

        <section className="insight practise-task" aria-label="The position">
          <span className="insight__label">In the game</span>
          <p className="insight__title">
            <GradeBadge grade={puzzle.played.grade} />
            <span className="tabular">{moveNumber(puzzle.ply)} {puzzle.played.san}</span>
            <span className="insight__grade" style={{ color: GRADES[puzzle.played.grade].tone }}>{GRADES[puzzle.played.grade].label}</span>
          </p>
          <p>Find a better move for {puzzle.local ? capital(puzzle.side) : `${capital(puzzle.side)} (you)`}. Good or better counts.</p>
        </section>

        <AttemptNote puzzle={puzzle} attempt={attempt} />

        <section className="analysis-card practise-actions">
          {solvedOrShown ? (
            <>
              <Button variant="primary" className="practise-actions__next" onPress={practice.next}>Next position <ArrowRight size={16} /></Button>
              <div className="practise-actions__row">
                <Button variant="secondary" onPress={practice.retry}><RotateCcw size={16} /> Try again</Button>
                {canOpenGame(puzzle) && onOpenGame && <Button variant="secondary" onPress={() => onOpenGame(puzzle)}>Open in review</Button>}
              </div>
            </>
          ) : (
            <>
              <div className="practise-actions__row">
                <Button variant="secondary" onPress={practice.showHint} isDisabled={attempt.hint || attempt.status === 'checking'}><Lightbulb size={16} /> Hint</Button>
                <Button variant="secondary" onPress={practice.reveal}><Eye size={16} /> Show solution</Button>
              </div>
              <Button variant="tertiary" className="practise-actions__skip" onPress={practice.next}>Skip for now</Button>
            </>
          )}
          <p className="analysis-card__hint">Solved means right first time without a hint. Missed positions come back sooner.</p>
        </section>
      </aside>
    </div>
  )
}

function PracticeStrip({ name, side, toMove }: { name: string; side: Side; toMove: boolean }) {
  return (
    <div className={`player-strip ${toMove ? 'is-to-move' : ''}`}>
      <span className={`player-strip__piece is-${side}`} aria-hidden="true" />
      <span className="player-strip__name">{name}</span>
      {toMove && <span className="player-strip__clock">To move</span>}
    </div>
  )
}

function PracticeProgress({ summary, session }: { summary: ReturnType<typeof usePractice>['summary']; session: ReturnType<typeof usePractice>['session'] }) {
  return (
    <dl className="practise-progress" aria-label="Progress">
      <div><dt>Positions</dt><dd className="tabular">{summary.total}</dd></div>
      <div><dt>New</dt><dd className="tabular">{summary.fresh}</dd></div>
      <div><dt>To retry</dt><dd className="tabular">{summary.failed}</dd></div>
      <div><dt>Solved</dt><dd className="tabular">{summary.solved}</dd></div>
      {session.done > 0 && <p className="practise-progress__session">This session: <strong className="tabular">{session.solved}/{session.done}</strong> solved{session.streak > 1 && <> · streak <strong className="tabular">{session.streak}</strong></>}</p>}
    </dl>
  )
}

function AttemptNote({ puzzle, attempt }: { puzzle: Puzzle; attempt: PracticeAttempt }) {
  const line = puzzle.bestLine.length > 1 ? numberedLine(puzzle.fen, puzzle.bestLine.slice(0, 6)) : null
  const answer = attempt.answer
  let body
  if (attempt.status === 'checking' && answer) {
    body = <p className="practise-note__checking"><Spinner size="sm" color="current" /> Checking <strong className="mono">{answer.ply.san}</strong></p>
  } else if (attempt.status === 'solved' && answer) {
    const grade = answer.grade ?? 'best'
    body = (
      <>
        <p className="insight__title"><GradeBadge grade={grade} /> <span className="tabular">{answer.ply.san}</span> <span className="insight__grade" style={{ color: GRADES[grade].tone }}>{grade === 'best' ? 'Best move' : GRADES[grade].label}</span></p>
        <p>
          {grade === 'best'
            ? 'That is the engine’s move.'
            : <>Good enough. The engine preferred <strong className="mono">{puzzle.bestSan}</strong>.</>}
        </p>
        {line && <p className="muted mono practise-note__line">{line}</p>}
      </>
    )
  } else if (attempt.status === 'wrong' && answer) {
    const isGameMove = answer.ply.uci === puzzle.played.uci
    body = (
      <p>
        {answer.grade && <GradeBadge grade={answer.grade} size="sm" />}{' '}
        <strong className="mono">{answer.ply.san}</strong>{' '}
        {isGameMove ? 'is the move from the game.' : `is ${answer.grade ? `a ${GRADES[answer.grade].label.toLowerCase()}` : 'not good enough'}.`} Try another move.
      </p>
    )
  } else if (attempt.status === 'revealed') {
    body = (
      <>
        <p>The engine plays <strong className="mono">{puzzle.bestSan}</strong>.</p>
        {line && <p className="muted mono practise-note__line">{line}</p>}
      </>
    )
  } else {
    body = <p className="muted">{attempt.hint ? 'The highlighted piece has a better move.' : 'Drag or click a piece to answer.'}</p>
  }
  return <section className={`insight practise-note is-${attempt.status}`} aria-label="Your answer" aria-live="polite">{body}</section>
}

function PracticeEmpty({ hasPlayer, onGoToGames }: { hasPlayer: boolean; onGoToGames: () => void }) {
  return (
    <div className="practise-empty">
      <span className="report-heading__mark" aria-hidden="true">?!</span>
      <h2>No positions to practise yet</h2>
      <p>{hasPlayer
        ? 'Review a game and its mistakes and blunders turn into positions to practise here. Games without mistakes add nothing.'
        : 'Import your Chess.com games and review one. Its mistakes and blunders turn into positions to practise here.'}</p>
      <Button variant="primary" onPress={onGoToGames}>Your games <ArrowRight size={16} /></Button>
    </div>
  )
}
