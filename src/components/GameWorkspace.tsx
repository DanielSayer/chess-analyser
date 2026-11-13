import { Alert, Button, ButtonGroup, Link, Spinner, Tabs, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import {
  ArrowLeft, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ExternalLink, FlipVertical2, Lightbulb, Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisPreset, GameReview, ImportedGame, ParsedGame, Side } from '../core'
import { PRESETS, lineToSan, parseGame, sideForUsername } from '../core'
import { useGameReview } from '../hooks/useGameReview'
import type { ReviewRun } from '../hooks/useGameReview'
import { usePositionLines } from '../hooks/usePositionLines'
import { useReplay } from '../hooks/useReplay'
import { useReplayKeys } from '../hooks/useReplayKeys'
import { AnalysisBoard } from './AnalysisBoard'
import type { BoardArrow } from './AnalysisBoard'
import { EvalBar } from './EvalBar'
import { EvalGraph } from './EvalGraph'
import { GradeBadge } from './GradeBadge'
import { MoveList } from './MoveList'
import { ReviewFlight } from './ReviewFlight'
import type { Landing } from './ReviewFlight'
import { ReviewSummary } from './ReviewSummary'
import {
  GRADES, capitalise, endingText, formatEval, fullDate, moveNumber, numberedLine, scoreline, timeControlLabel,
} from '../ui/format'

interface Props {
  game: ImportedGame
  username: string
  cachedReview: GameReview | null
  onReviewComplete: (review: GameReview) => void
  onReviewSaved: (gameId: string) => void
  onStorageIssue: () => void
  onBack?: () => void
  isActive?: boolean
}

const BEST_ARROW = 'rgba(224, 80, 31, 0.82)'
const PRESET_HINT: Record<AnalysisPreset, string> = {
  quick: 'Fastest, rough grades',
  standard: 'Balanced speed and accuracy',
  deep: 'Slowest, most reliable',
}

export function GameWorkspace(props: Props) {
  const parsed = useMemo<ParsedGame | Error>(() => {
    try {
      return parseGame(props.game.pgn)
    } catch (error) {
      return error instanceof Error ? error : new Error('This game cannot be read.')
    }
  }, [props.game.pgn])

  if (parsed instanceof Error) {
    return (
      <div className="workspace workspace--message">
        <GameHeader game={props.game} onBack={props.onBack} />
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Can't open this game</Alert.Title>
            <Alert.Description>{parsed.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      </div>
    )
  }
  return <Workspace {...props} parsed={parsed} />
}

function GameHeader({ game, onBack }: { game: ImportedGame; onBack?: () => void }) {
  return (
    <header className="game-header">
      {onBack && (
        <Button size="sm" variant="ghost" onPress={onBack} className="game-header__back">
          <ArrowLeft size={16} /> Games
        </Button>
      )}
      <div className="game-header__text">
        <h2 className="game-header__title">
          {game.opening ?? 'Unknown opening'}
          {game.eco && <span className="game-header__eco">{game.eco}</span>}
        </h2>
        <p className="game-header__meta">
          <span>{capitalise(game.timeClass)} · {timeControlLabel(game)}</span>
          <span>{fullDate(game.endTime)}</span>
          <span><strong className="tabular">{scoreline(game)}</strong> {endingText(game)}</span>
        </p>
      </div>
      <Link href={game.url} target="_blank" rel="noreferrer noopener" className="game-header__link">
        Chess.com <ExternalLink size={13} aria-hidden="true" />
      </Link>
    </header>
  )
}

function clockAt(parsed: ParsedGame, index: number, side: Side): string | null {
  for (let i = Math.min(index, parsed.plies.length) - 1; i >= 0; i--) {
    if (parsed.plies[i].side === side && parsed.plies[i].clock) return parsed.plies[i].clock
  }
  return null
}

function PlayerStrip({ game, side, clock, accuracy, toMove }: {
  game: ImportedGame; side: Side; clock: string | null; accuracy: number | null; toMove: boolean
}) {
  const player = game[side]
  return (
    <div className={`player-strip ${toMove ? 'is-to-move' : ''}`}>
      <span className={`player-strip__piece is-${side}`} aria-hidden="true" />
      <span className="player-strip__name">{player.username}</span>
      {player.rating !== null && <span className="player-strip__rating tabular">{player.rating}</span>}
      {accuracy !== null && <span className="player-strip__accuracy tabular" title="Accuracy">{accuracy.toFixed(1)}%</span>}
      {clock && <span className="player-strip__clock tabular">{clock.replace(/^0:/, '').replace(/\.\d+$/, '')}</span>}
    </div>
  )
}

function Workspace({ game, username, cachedReview, onReviewComplete, onReviewSaved, onStorageIssue, onBack, parsed, isActive = true }: Props & { parsed: ParsedGame }) {
  const analysis = useGameReview(game, { cached: cachedReview, onComplete: onReviewComplete, onSaved: onReviewSaved, onStorageIssue })
  const replay = useReplay(parsed)
  const [flipped, setFlipped] = useState(false)
  const [showBest, setShowBest] = useState(true)
  const [preset, setPreset] = useState<AnalysisPreset>(cachedReview?.preset ?? 'standard')
  const [tab, setTab] = useState<'summary' | 'moves'>('summary')
  const panelRef = useRef<HTMLElement>(null)
  const graphSlotRef = useRef<HTMLDivElement>(null)

  const review = analysis.review
  const running = analysis.run !== null

  // The live graph outlives its run long enough to fly back into the panel.
  const [flight, setFlight] = useState<{ run: ReviewRun; landing: Landing | null } | null>(null)
  if (analysis.run && flight?.run !== analysis.run) {
    setFlight({ run: analysis.run, landing: null })
  } else if (!analysis.run && flight && !flight.landing) {
    setFlight({ ...flight, landing: analysis.cancelled || analysis.error ? 'abort' : 'complete' })
  }
  useEffect(() => {
    if (review) panelRef.current?.scrollTo({ top: 0 })
  }, [review])
  const viewer = sideForUsername(game, username)
  const orientation: Side = flipped ? (viewer === 'white' ? 'black' : 'white') : viewer
  const { variation, index } = replay

  const lines = usePositionLines(variation ? replay.fen : null, isActive && variation !== null && !running)

  useReplayKeys({
    prev: () => replay.step(-1),
    next: () => replay.step(1),
    start: replay.toStart,
    end: replay.toEnd,
    flip: () => setFlipped(f => !f),
    escape: replay.exitVariation,
  }, isActive)

  const evaluation = variation
    ? variation.cursor === 0 && review ? review.positions[variation.baseIndex] : lines.evaluation
    : review?.positions[index] ?? null

  const arrows: BoardArrow[] = []
  if (showBest) {
    const best = variation ? lines.evaluation?.bestMove : review?.positions[index]?.bestMove
    if (best) arrows.push({ from: best.slice(0, 2), to: best.slice(2, 4), color: BEST_ARROW })
  }

  const turn: Side = replay.fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const top: Side = orientation === 'white' ? 'black' : 'white'
  const strip = (side: Side) => (
    <PlayerStrip
      game={game}
      side={side}
      clock={variation ? null : clockAt(parsed, index, side)}
      accuracy={review?.[side].accuracy ?? null}
      toMove={turn === side}
    />
  )

  return (
    <div className="workspace">
      <div className="workspace__board">
        <GameHeader game={game} onBack={onBack} />
        <div className="board-area">
          {strip(top)}
          <div className="board-row">
            <EvalBar evaluation={evaluation} orientation={orientation} />
            <div className="board-frame" data-testid="board">
              <AnalysisBoard
                fen={replay.fen}
                orientation={orientation}
                lastMove={replay.lastMove}
                moveGrade={!variation && index > 0 ? review?.moves[index - 1]?.grade ?? null : null}
                arrows={arrows}
                animate={!replay.jumped}
                onMove={replay.playMove}
              />
            </div>
          </div>
          {strip(top === 'white' ? 'black' : 'white')}
        </div>

        <div className="replay-controls">
          <ButtonGroup aria-label="Replay" size="sm" variant="secondary">
            <Button isIconOnly aria-label="First position" onPress={replay.toStart}><ChevronFirst size={18} /></Button>
            <Button isIconOnly aria-label="Previous move" onPress={() => replay.step(-1)}><ChevronLeft size={18} /></Button>
            <Button isIconOnly aria-label="Next move" onPress={() => replay.step(1)}><ChevronRight size={18} /></Button>
            <Button isIconOnly aria-label="Last position" onPress={replay.toEnd}><ChevronLast size={18} /></Button>
          </ButtonGroup>
          <span className="replay-controls__position tabular" aria-live="polite">
            {variation ? `Line, move ${variation.cursor} of ${variation.sans.length}` : index === 0 ? 'Start' : `${moveNumber(index)} ${parsed.plies[index - 1].san}`}
          </span>
          <div className="replay-controls__tools">
            <ToggleButton
              isIconOnly
              size="sm"
              aria-label="Show best move arrow"
              isSelected={showBest}
              onChange={setShowBest}
            >
              <Lightbulb size={16} />
            </ToggleButton>
            <Button isIconOnly size="sm" variant="secondary" aria-label="Flip board" onPress={() => setFlipped(f => !f)}>
              <FlipVertical2 size={16} />
            </Button>
          </div>
        </div>

      </div>

      <aside ref={panelRef} className="workspace__panel" aria-label="Game review">
        <header className="report-heading"><div><h2>Game <em>review</em></h2><p>{running ? 'Taking a closer look at your moves.' : review ? 'Find the moments that mattered.' : 'Ready to take a closer look?'}</p></div><span className="report-heading__mark" aria-hidden="true">{review ? '!' : '!?'}</span></header>
        <div ref={graphSlotRef} className="report-graph">
          {flight ? <div className="report-graph__ghost" aria-hidden="true" /> : review ? <EvalGraph review={review} index={variation ? variation.baseIndex : index} onSelect={replay.goTo} /> : <div className="report-graph__empty"><span /><p>Evaluation appears after your review</p></div>}
        </div>
        {(review || variation || index > 0) && <div className="report-insight">
        <MoveInsight
          parsed={parsed}
          review={review}
          index={index}
          replay={replay}
          lines={lines}
          running={running}
        />

        </div>}
        <section className="analysis-card">
          <div className="analysis-card__controls">
            <ToggleButtonGroup
              aria-label="Review depth"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[preset]}
              onSelectionChange={keys => setPreset(([...keys][0] as AnalysisPreset) ?? 'standard')}
              size="sm"
              fullWidth
              isDisabled={running}
            >
              {(Object.keys(PRESETS) as AnalysisPreset[]).map(key => (
                <ToggleButton key={key} id={key}>{PRESETS[key].label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button variant={review ? 'secondary' : 'primary'} onPress={() => analysis.start(preset)} isDisabled={analysis.loadingSaved || running}>
              {running ? 'Reviewing…' : review ? 'Re-run' : 'Review game'}
            </Button>
          </div>
          <p className="analysis-card__hint">
            {PRESET_HINT[preset]}. Depth {PRESETS[preset].depth}, runs on this device.
          </p>
          {analysis.cancelled && (
            <p className="analysis-card__note" role="status">
              Review cancelled.{review ? ' Showing the previous review.' : ''}
            </p>
          )}
          {analysis.error && (
            <Alert status="danger" className="analysis-card__error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Review failed</Alert.Title>
                <Alert.Description>{analysis.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {review && !running && (
            <p className="analysis-card__meta">
              {review.engine} · {PRESETS[review.preset].label} · {new Date(review.createdAt).toLocaleDateString()}
            </p>
          )}
        </section>

        <Tabs selectedKey={tab} onSelectionChange={key => setTab(key as 'summary' | 'moves')} className="panel-tabs">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Review sections">
              <Tabs.Tab id="summary">Summary<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="moves">Moves<Tabs.Indicator /></Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="summary" className="panel-tabs__panel">
            {review ? (
              <ReviewSummary game={game} review={review} index={variation ? -1 : index} onSelect={replay.goTo} />
            ) : analysis.loadingSaved ? (
              <div className="panel-empty"><Spinner size="sm" color="current" /> Checking for a saved review</div>
            ) : (
              <div className="report-preview">
                <div className="report-players">{(['white', 'black'] as Side[]).map(side => <div key={side}><span className="report-player-avatar">{game[side].username[0].toUpperCase()}</span><strong>{game[side].username}</strong><span>{game[side].rating}</span></div>)}</div>
                <div className="report-preview__accuracy"><span>—</span><p>Accuracy</p><span>—</span></div>
                <p className="panel-empty__title">{running ? 'Analysing your game…' : 'Your review starts here'}</p><p className="muted">See your accuracy, best moves and the moments to learn from.</p>
              </div>
            )}
          </Tabs.Panel>
          <Tabs.Panel id="moves" className="panel-tabs__panel">
            <MoveList plies={parsed.plies} review={review} index={variation ? -1 : index} inVariation={variation !== null} onSelect={replay.goTo} />
          </Tabs.Panel>
        </Tabs>
      </aside>
      {flight && (
        <ReviewFlight
          key={flight.run.id}
          run={analysis.run ?? flight.run}
          total={parsed.plies.length + 1}
          landing={flight.landing}
          review={review}
          label={i => (i === 0 ? 'Start' : `${moveNumber(i)} ${parsed.plies[i - 1].san}`)}
          slotRef={graphSlotRef}
          onCancel={analysis.cancel}
          onLanded={() => setFlight(f => (f?.run.id === flight.run.id ? null : f))}
        />
      )}
    </div>
  )
}

type Replay = ReturnType<typeof useReplay>

function MoveInsight({ parsed, review, index, replay, lines, running }: {
  parsed: ParsedGame
  review: GameReview | null
  index: number
  replay: Replay
  lines: ReturnType<typeof usePositionLines>
  running: boolean
}) {
  const { variation } = replay
  if (variation) {
    return (
      <section className="insight insight--variation" aria-label="Explored line">
        <div className="insight__head">
          <span className="insight__label">Exploring</span>
          <Button size="sm" variant="primary" onPress={replay.exitVariation}>
            <Undo2 size={15} /> Back to game
          </Button>
        </div>
        <p className="insight__line">
          {variation.sans.map((san, i) => (
            <button
              key={i}
              type="button"
              className={`line-move ${variation.cursor === i + 1 ? 'is-active' : ''}`}
              onClick={() => replay.setVariation({ ...variation, cursor: i + 1 })}
            >
              {numberedLine(variation.fens[i], [san])}
            </button>
          ))}
        </p>
        <div className="engine-lines" aria-live="polite">
          {running ? (
            <p className="muted">Engine lines pause while the full review runs.</p>
          ) : lines.status === 'done' && lines.evaluation ? (
            lines.evaluation.lines.length === 0 ? (
              <p className="muted">Game over in this position.</p>
            ) : (
              <ol className="engine-lines__list">
                {lines.evaluation.lines.map((line, i) => (
                  <li key={i}>
                    <span className="eval-chip tabular">{formatEval(line)}</span>
                    <span className="engine-lines__moves">{numberedLine(replay.fen, lineToSan(replay.fen, line.moves).slice(0, 8))}</span>
                  </li>
                ))}
              </ol>
            )
          ) : lines.status === 'error' ? (
            <p className="muted">The engine could not analyse this position.</p>
          ) : (
            <p className="muted"><Spinner size="sm" color="current" /> Engine thinking</p>
          )}
        </div>
      </section>
    )
  }

  if (index === 0) {
    return (
      <section className="insight">
        <p className="insight__title">Starting position</p>
        <p className="muted">Use the arrow keys or the buttons to step through. Drag a piece to try your own move.</p>
      </section>
    )
  }

  const ply = parsed.plies[index - 1]
  const reviewed = review?.moves[index - 1]
  const after = review?.positions[index]
  return (
    <section className="insight" aria-label="Selected move">
      <div className="insight__head">
        <p className="insight__title">
          {reviewed && <GradeBadge grade={reviewed.grade} />}
          <span className="tabular">{moveNumber(index)} {ply.san}</span>
          {reviewed && <span className="insight__grade" style={{ color: GRADES[reviewed.grade].tone }}>{GRADES[reviewed.grade].label}</span>}
        </p>
        {after && <span className="eval-chip tabular">{formatEval(after)}</span>}
      </div>
      {reviewed ? (
        reviewed.grade === 'book' ? (
          <p className="muted">Opening theory{review?.opening ? ` · ${review.opening}` : ''}.</p>
        ) : reviewed.grade !== 'best' && reviewed.grade !== 'forced' && reviewed.bestSan ? (
          <div className="insight__best">
            <p>
              Best was <strong>{reviewed.bestSan}</strong>
              {reviewed.bestLine.length > 1 && <span className="muted"> · {numberedLine(ply.before, reviewed.bestLine.slice(0, 6))}</span>}
            </p>
            <Button size="sm" variant="tertiary" onPress={() => replay.showLine(index - 1, reviewed.bestLine.length ? reviewed.bestLine : [reviewed.bestSan!])}>
              Show line
            </Button>
          </div>
        ) : (
          <p className="muted">{reviewed.grade === 'forced' ? 'The only legal move.' : "Matches the engine's first choice."}</p>
        )
      ) : (
        <p className="muted">{running ? 'Grades appear when the review finishes.' : 'Review the game to grade this move.'}</p>
      )}
    </section>
  )
}
