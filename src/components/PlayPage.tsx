import { AlertDialog, Button, ButtonGroup, Label, Spinner, Switch, ToggleButton } from '@heroui/react'
import {
  ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ClipboardCopy, Flag, FlipVertical2, Handshake, Lightbulb, RotateCcw, Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { defaultPieces } from 'react-chessboard'
import type { GradedMove, MoveInput, OpeningBook, PositionEvaluation, Side } from '../core'
import { START_FEN, endText, gradeGame, isPromotion, loadOpeningBook, material, toPgn } from '../core'
import { useLiveEvaluations } from '../hooks/useLiveEvaluations'
import { inCheck, usePlayGame, usePlayPersistence } from '../hooks/usePlayGame'
import type { PlayGame } from '../hooks/usePlayGame'
import { useReplayKeys } from '../hooks/useReplayKeys'
import { AnalysisBoard } from './AnalysisBoard'
import type { BoardArrow } from './AnalysisBoard'
import { EvalBar } from './EvalBar'
import { GradeBadge } from './GradeBadge'
import { MoveList } from './MoveList'
import { GRADES, formatEval, moveNumber, numberedLine } from '../ui/format'

const BEST_ARROW = 'rgba(224, 80, 31, 0.82)'
const PIECE_GLYPH: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const PROMOTIONS: NonNullable<MoveInput['promotion']>[] = ['q', 'r', 'b', 'n']
const PIECE_NAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }
const other = (side: Side): Side => (side === 'white' ? 'black' : 'white')
const capital = (side: Side) => (side === 'white' ? 'White' : 'Black')

export function PlayPage({ isActive }: { isActive: boolean }) {
  const game = usePlayGame()
  const { plies, fens, fen, cursor, live, end, turn, settings } = game
  const engine = useLiveEvaluations(fens, fens.at(-1)!, game.initialEvaluations)
  usePlayPersistence(game, engine.evaluations)

  const [book, setBook] = useState<OpeningBook | undefined>()
  useEffect(() => { loadOpeningBook().then(setBook, () => setBook(new Set())) }, [])
  const graded = useMemo(() => book ? gradeGame(plies, engine.evaluations, book) : plies.map(() => null), [plies, engine.evaluations, book])

  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const pendingPromotion = promotion && live && !end ? promotion : null

  useReplayKeys({
    prev: () => game.goTo(cursor - 1),
    next: () => game.goTo(cursor + 1),
    start: () => game.goTo(0),
    end: () => game.goTo(plies.length),
    flip: () => game.updateSettings({ orientation: other(settings.orientation) }),
    escape: () => { setPromotion(null); game.goTo(plies.length) },
  }, isActive)

  const onMove = (from: string, to: string) => {
    if (isPromotion(fen, from, to)) { setPromotion({ from, to }); return false }
    return game.move({ from, to })
  }

  const { showAnalysis, orientation } = settings
  const evaluation = engine.evaluations.get(fen) ?? null
  const viewedMove = cursor > 0 ? graded[cursor - 1] : null
  const arrows: BoardArrow[] = []
  if (showAnalysis && settings.showHint && evaluation?.bestMove && !(live && end)) {
    arrows.push({ from: evaluation.bestMove.slice(0, 2), to: evaluation.bestMove.slice(2, 4), color: BEST_ARROW })
  }
  const lastPly = cursor > 0 ? plies[cursor - 1] : null
  const top = other(orientation)
  const viewedTurn: Side = fen.split(' ')[1] === 'w' ? 'white' : 'black'

  const status = end ? endText(end) : inCheck(fens.at(-1)!) ? `${capital(turn)} to move · check` : `${capital(turn)} to move`
  const strip = (side: Side) => <PlayerStrip side={side} fen={fen} toMove={!end && live && turn === side} end={end?.result ?? null} />

  return (
    <div className="workspace play">
      <div className="workspace__board">
        <header className="game-header">
          <div className="game-header__text">
            <h2 className="game-header__title"><span role="status">{status}</span></h2>
            <p className="game-header__meta"><span>{plies.length ? `Move ${Math.ceil((plies.length + 1) / 2)}` : 'New game'}</span><span>Analysis runs on this device</span></p>
          </div>
        </header>
        <div className="board-area">
          {strip(top)}
          <div className="board-row">
            {showAnalysis ? <EvalBar evaluation={evaluation} orientation={orientation} /> : <div className="eval-bar is-off" aria-hidden="true" />}
            <div className="board-frame" data-testid="play-board">
              <AnalysisBoard
                id="play-board"
                fen={fen}
                orientation={orientation}
                lastMove={lastPly ? { from: lastPly.uci.slice(0, 2), to: lastPly.uci.slice(2, 4) } : null}
                moveGrade={showAnalysis ? viewedMove?.grade ?? null : null}
                arrows={arrows}
                animate={!game.jumped}
                interactive={live && !end && !pendingPromotion}
                onMove={onMove}
              />
              {pendingPromotion && (
                <PromotionPicker
                  side={turn}
                  onPick={piece => { setPromotion(null); game.move({ ...pendingPromotion, promotion: piece }) }}
                  onCancel={() => setPromotion(null)}
                />
              )}
            </div>
          </div>
          {strip(other(top))}
        </div>

        <div className="replay-controls">
          <ButtonGroup aria-label="Move history" size="sm" variant="secondary">
            <Button isIconOnly aria-label="First position" onPress={() => game.goTo(0)}><ChevronFirst size={18} /></Button>
            <Button isIconOnly aria-label="Previous move" onPress={() => game.goTo(cursor - 1)}><ChevronLeft size={18} /></Button>
            <Button isIconOnly aria-label="Next move" onPress={() => game.goTo(cursor + 1)}><ChevronRight size={18} /></Button>
            <Button isIconOnly aria-label="Current position" onPress={() => game.goTo(plies.length)}><ChevronLast size={18} /></Button>
          </ButtonGroup>
          <span className="replay-controls__position tabular" aria-live="polite">
            {cursor === 0 ? 'Start' : `${moveNumber(cursor)} ${plies[cursor - 1].san}`}
          </span>
          <div className="replay-controls__tools">
            <ToggleButton isIconOnly size="sm" aria-label="Show best move" isSelected={settings.showHint} isDisabled={!showAnalysis} onChange={showHint => game.updateSettings({ showHint })}>
              <Lightbulb size={16} />
            </ToggleButton>
            <Button isIconOnly size="sm" variant="secondary" aria-label="Flip board" onPress={() => game.updateSettings({ orientation: other(orientation) })}>
              <FlipVertical2 size={16} />
            </Button>
          </div>
        </div>
      </div>

      <aside className="workspace__panel play-panel" aria-label="Game">
        <header className="report-heading">
          <div><h2>Over the <em>board</em></h2><p>Two players, one device</p></div>
          <span className="report-heading__mark" aria-hidden="true">{end ? '#' : '!?'}</span>
        </header>

        {end && (
          <section className="play-result" aria-label="Result">
            <span className="play-result__score tabular">{end.result === '1/2-1/2' ? '½-½' : end.result}</span>
            <p>{endText(end)}</p>
          </section>
        )}

        <MoveNote game={game} graded={viewedMove} evaluation={evaluation} engineStatus={engine.status} viewedTurn={viewedTurn} />

        <section className="play-moves">
          <h3 className="section-title">Moves</h3>
          {plies.length ? (
            <MoveList plies={plies} grades={showAnalysis ? graded.map(move => move?.grade) : []} showAll index={cursor} inVariation={false} onSelect={game.goTo} />
          ) : (
            <p className="play-moves__empty">The scoresheet fills in as you play.</p>
          )}
        </section>

        <GameActions game={game} />
      </aside>
    </div>
  )
}

function PlayerStrip({ side, fen, toMove, end }: { side: Side; fen: string; toMove: boolean; end: string | null }) {
  const { captured, lead } = material(fen)[side]
  const score = end === null ? null : end === '1/2-1/2' ? '½' : (end === '1-0') === (side === 'white') ? '1' : '0'
  return (
    <div className={`player-strip ${toMove ? 'is-to-move' : ''}`}>
      <span className={`player-strip__piece is-${side}`} aria-hidden="true" />
      <span className="player-strip__name">{capital(side)}</span>
      <span className="player-strip__captured" aria-label={captured.length ? `${capital(side)} has captured ${captured.length} pieces` : undefined}>
        {captured.map((piece, i) => <span key={i} aria-hidden="true">{PIECE_GLYPH[piece]}</span>)}
        {lead > 0 && <span className="player-strip__lead tabular">+{lead}</span>}
      </span>
      {toMove && <span className="player-strip__clock">To move</span>}
      {score && <span className="player-strip__clock player-strip__score tabular">{score}</span>}
    </div>
  )
}

function PromotionPicker({ side, onPick, onCancel }: { side: Side; onPick: (piece: NonNullable<MoveInput['promotion']>) => void; onCancel: () => void }) {
  return (
    <div className="promotion" role="dialog" aria-label="Choose a promotion piece">
      <div className="promotion__card">
        <p className="promotion__title">Promote to</p>
        <div className="promotion__options">
          {PROMOTIONS.map(piece => (
            <button key={piece} type="button" className="promotion__option" aria-label={PIECE_NAME[piece]} onClick={() => onPick(piece)}>
              {defaultPieces[`${side[0]}${piece.toUpperCase()}`]()}
            </button>
          ))}
        </div>
        <Button size="sm" variant="tertiary" onPress={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function MoveNote({ game, graded, evaluation, engineStatus, viewedTurn }: {
  game: PlayGame
  graded: GradedMove | null
  evaluation: PositionEvaluation | null
  engineStatus: string
  viewedTurn: Side
}) {
  const { cursor, plies, live, settings } = game
  const history = !live && (
    <div className="play-history">
      <p>Viewing an earlier position.</p>
      <div>
        <Button size="sm" variant="tertiary" onPress={game.playFromHere}>Play from here</Button>
        <Button size="sm" variant="primary" onPress={() => game.goTo(plies.length)}>Back to game</Button>
      </div>
    </div>
  )
  if (cursor === 0) {
    return (
      <section className="insight" aria-label="Selected move">
        <p className="insight__title">Starting position</p>
        <p className="muted">Drag or click a piece to move. Flip the board to play from the other side.</p>
        {history}
      </section>
    )
  }
  const ply = plies[cursor - 1]
  let body: ReactNode
  if (!settings.showAnalysis) body = <p className="muted">Analysis is hidden. Turn it on below to see grades and the evaluation.</p>
  else if (!graded) body = engineStatus === 'error'
    ? <p className="muted">The engine could not analyse this position.</p>
    : <p className="muted play-thinking"><Spinner size="sm" color="current" /> Grading this move</p>
  else if (graded.grade === 'book') body = <p className="muted">Opening theory.</p>
  else if (graded.grade === 'forced') body = <p className="muted">The only legal move.</p>
  else if (graded.grade === 'best' || !graded.bestSan) body = <p className="muted">Matches the engine's first choice.</p>
  else body = (
    <p>
      Best was <strong className="mono">{graded.bestSan}</strong>
      {graded.bestLine.length > 1 && <span className="muted"> · {numberedLine(ply.before, graded.bestLine.slice(0, 6))}</span>}
    </p>
  )
  const showGrade = settings.showAnalysis && graded
  return (
    <section className="insight" aria-label="Selected move">
      <div className="insight__head">
        <p className="insight__title">
          {showGrade && <GradeBadge grade={graded.grade} />}
          <span className="tabular">{moveNumber(cursor)} {ply.san}</span>
          {showGrade && <span className="insight__grade" style={{ color: GRADES[graded.grade].tone }}>{GRADES[graded.grade].label}</span>}
        </p>
        {settings.showAnalysis && evaluation && <span className="eval-chip tabular" title={`${capital(viewedTurn)} to move`}>{formatEval(evaluation)}</span>}
      </div>
      {body}
      {history}
    </section>
  )
}

function GameActions({ game }: { game: PlayGame }) {
  const { plies, end, manualEnd, turn, settings } = game
  const [copied, setCopied] = useState<string | null>(null)
  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(toPgn(START_FEN, plies, end))
      setCopied('PGN copied')
    } catch { setCopied('Could not copy the PGN') }
  }
  return (
    <section className="analysis-card play-actions">
      <div className="play-actions__grid">
        <Button variant="secondary" onPress={game.undo} isDisabled={!plies.length && !manualEnd}>
          <Undo2 size={16} /> {manualEnd ? 'Resume' : 'Undo'}
        </Button>
        <Confirm
          trigger={<><RotateCcw size={16} /> New game</>}
          variant="primary"
          skip={!plies.length || end !== null}
          heading="Start a new game?"
          body="The current game and its analysis will be cleared."
          confirm="New game"
          onConfirm={game.newGame}
        />
        <AlertDialog>
          <Button variant="secondary" isDisabled={end !== null || !plies.length}><Flag size={16} /> Resign</Button>
          <AlertDialog.Backdrop>
            <AlertDialog.Container size="sm">
              <AlertDialog.Dialog>
                {({ close }) => (
                  <>
                    <AlertDialog.Header><AlertDialog.Heading>Who resigns?</AlertDialog.Heading></AlertDialog.Header>
                    <AlertDialog.Body><p>The game ends and the other player wins. Undo can take it back.</p></AlertDialog.Body>
                    <AlertDialog.Footer>
                      <Button variant="tertiary" slot="close">Cancel</Button>
                      {[turn, other(turn)].map(side => (
                        <Button key={side} variant={side === turn ? 'danger' : 'secondary'} onPress={() => { game.resign(side); close() }}>{capital(side)} resigns</Button>
                      ))}
                    </AlertDialog.Footer>
                  </>
                )}
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
        <Confirm
          trigger={<><Handshake size={16} /> Draw</>}
          variant="secondary"
          isDisabled={end !== null || !plies.length}
          heading="Agree a draw?"
          body="Both players accept a draw. Undo can take it back."
          confirm="Agree draw"
          onConfirm={game.agreeDraw}
        />
      </div>
      <div className="play-actions__settings">
        <SettingSwitch label="Show evaluation and grades" isSelected={settings.showAnalysis} onChange={showAnalysis => game.updateSettings({ showAnalysis })} />
        <SettingSwitch label="Flip board after each move" isSelected={settings.autoFlip} onChange={autoFlip => game.updateSettings({ autoFlip, ...(autoFlip ? { orientation: turn } : {}) })} />
      </div>
      <Button size="sm" variant="ghost" className="play-actions__copy" onPress={copyPgn} isDisabled={!plies.length}>
        <ClipboardCopy size={15} /> Copy PGN
      </Button>
      {copied && <p className="analysis-card__hint" role="status">{copied}</p>}
    </section>
  )
}

function SettingSwitch({ label, isSelected, onChange }: { label: string; isSelected: boolean; onChange: (value: boolean) => void }) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} size="sm">
      <Switch.Content>
        <Switch.Control><Switch.Thumb /></Switch.Control>
        <Label>{label}</Label>
      </Switch.Content>
    </Switch>
  )
}

function Confirm({ trigger, variant, skip, isDisabled, heading, body, confirm, onConfirm }: {
  trigger: ReactNode
  variant: 'primary' | 'secondary'
  skip?: boolean
  isDisabled?: boolean
  heading: string
  body: string
  confirm: string
  onConfirm: () => void
}) {
  if (skip) return <Button variant={variant} isDisabled={isDisabled} onPress={onConfirm}>{trigger}</Button>
  return (
    <AlertDialog>
      <Button variant={variant} isDisabled={isDisabled}>{trigger}</Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            {({ close }) => (
              <>
                <AlertDialog.Header><AlertDialog.Heading>{heading}</AlertDialog.Heading></AlertDialog.Header>
                <AlertDialog.Body><p>{body}</p></AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button variant="tertiary" slot="close">Cancel</Button>
                  <Button variant="primary" onPress={() => { onConfirm(); close() }}>{confirm}</Button>
                </AlertDialog.Footer>
              </>
            )}
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
