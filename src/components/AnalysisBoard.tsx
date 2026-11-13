import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import type { MoveGrade, Side } from '../core'
import type { SquareMove } from '../hooks/useReplay'
import { GradeBadge } from './GradeBadge'

export interface BoardArrow {
  from: string
  to: string
  color: string
}

interface Props {
  fen: string
  orientation: Side
  lastMove: SquareMove | null
  moveGrade: MoveGrade | null
  arrows: BoardArrow[]
  animate: boolean
  onMove: (from: string, to: string) => boolean
}

// Opaque tints per square colour, so highlights stay warm on teal.
const isDark = (square: string) => (square.charCodeAt(0) - 96 + Number(square[1])) % 2 === 0
const tint = (light: string, dark: string) => (square: string): CSSProperties => ({ background: isDark(square) ? dark : light })
const LAST_MOVE = tint('#f5d98c', '#d6ad5c')
const SELECTED = tint('#f6b99c', '#dc8a62')
const TARGET: CSSProperties = { background: 'radial-gradient(circle, rgba(31, 27, 22, 0.32) 22%, transparent 24%)' }
const CAPTURE: CSSProperties = { background: 'radial-gradient(circle, transparent 58%, rgba(31, 27, 22, 0.32) 60%)' }

export function AnalysisBoard({ fen, orientation, lastMove, moveGrade, arrows, animate, onMove }: Props) {
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
    squareStyles[lastMove.from] = LAST_MOVE(lastMove.from)
    squareStyles[lastMove.to] = LAST_MOVE(lastMove.to)
  }
  if (selected) squareStyles[selected] = SELECTED(selected)
  for (const move of targets) squareStyles[move.to] = move.captured ? CAPTURE : TARGET

  const ownPiece = (square: string) => chess.get(square as Square)?.color === turn

  return (
    <Chessboard
      options={{
        id: 'analysis-board',
        position: fen,
        boardOrientation: orientation,
        showAnimations: animate,
        animationDurationInMs: 160,
        allowDrawingArrows: true,
        arrows: arrows.map(arrow => ({ startSquare: arrow.from, endSquare: arrow.to, color: arrow.color })),
        clearArrowsOnPositionChange: true,
        squareStyles,
        squareRenderer: ({ square, children }) => (
          <div className="board-square" style={squareStyles[square]}>
            {children}
            {moveGrade && square === lastMove?.to && <GradeBadge grade={moveGrade} size="board" />}
          </div>
        ),
        lightSquareStyle: { backgroundColor: 'var(--board-light)' },
        darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
        lightSquareNotationStyle: { color: 'var(--board-dark)', fontWeight: 600 },
        darkSquareNotationStyle: { color: 'var(--board-light)', fontWeight: 600 },
        boardStyle: { borderRadius: 2, overflow: 'hidden' },
        dropSquareStyle: { boxShadow: 'inset 0 0 0 3px rgba(224, 80, 31, 0.8)' },
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
