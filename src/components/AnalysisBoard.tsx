import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import type { Side } from '../core'
import type { SquareMove } from '../hooks/useReplay'

export interface BoardArrow {
  from: string
  to: string
  color: string
}

interface Props {
  fen: string
  orientation: Side
  lastMove: SquareMove | null
  arrows: BoardArrow[]
  onMove: (from: string, to: string) => boolean
}

const LAST_MOVE: CSSProperties = { background: 'rgba(214, 196, 92, 0.42)' }
const SELECTED: CSSProperties = { background: 'rgba(95, 208, 138, 0.5)' }
const TARGET: CSSProperties = { background: 'radial-gradient(circle, rgba(10, 20, 14, 0.38) 22%, transparent 24%)' }
const CAPTURE: CSSProperties = { background: 'radial-gradient(circle, transparent 58%, rgba(10, 20, 14, 0.38) 60%)' }

export function AnalysisBoard({ fen, orientation, lastMove, arrows, onMove }: Props) {
  const [selection, setSelection] = useState<{ fen: string; square: string } | null>(null)
  const chess = useMemo(() => new Chess(fen), [fen])
  const selected = selection?.fen === fen ? selection.square : null
  const turn = chess.turn()

  const targets = useMemo(() => {
    if (!selected) return []
    return chess.moves({ square: selected as Square, verbose: true })
  }, [chess, selected])

  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) {
    squareStyles[lastMove.from] = LAST_MOVE
    squareStyles[lastMove.to] = LAST_MOVE
  }
  if (selected) squareStyles[selected] = SELECTED
  for (const move of targets) squareStyles[move.to] = move.captured ? CAPTURE : TARGET

  const ownPiece = (square: string) => chess.get(square as Square)?.color === turn

  return (
    <Chessboard
      options={{
        id: 'analysis-board',
        position: fen,
        boardOrientation: orientation,
        showAnimations: true,
        animationDurationInMs: 160,
        allowDrawingArrows: true,
        arrows: arrows.map(arrow => ({ startSquare: arrow.from, endSquare: arrow.to, color: arrow.color })),
        clearArrowsOnPositionChange: true,
        squareStyles,
        lightSquareStyle: { backgroundColor: 'var(--board-light)' },
        darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
        lightSquareNotationStyle: { color: 'var(--board-dark)', fontWeight: 600 },
        darkSquareNotationStyle: { color: 'var(--board-light)', fontWeight: 600 },
        boardStyle: { borderRadius: 6, overflow: 'hidden' },
        dropSquareStyle: { boxShadow: 'inset 0 0 0 3px rgba(95, 208, 138, 0.75)' },
        canDragPiece: ({ piece }) => piece.pieceType[0] === turn,
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          setSelection(null)
          return targetSquare ? onMove(sourceSquare, targetSquare) : false
        },
        onSquareClick: ({ square }) => {
          if (selected && targets.some(move => move.to === square)) {
            setSelection(null)
            onMove(selected, square)
            return
          }
          setSelection(ownPiece(square) && square !== selected ? { fen, square } : null)
        },
      }}
    />
  )
}
