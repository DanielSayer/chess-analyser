import { Button } from '@heroui/react'
import { defaultPieces } from 'react-chessboard'
import type { MoveInput, Side } from '../core'

export type PromotionPiece = NonNullable<MoveInput['promotion']>

const PROMOTIONS: PromotionPiece[] = ['q', 'r', 'b', 'n']
const PIECE_NAME: Record<PromotionPiece, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }

/** Overlay over a board frame. The frame must be positioned. */
export function PromotionPicker({ side, onPick, onCancel }: { side: Side; onPick: (piece: PromotionPiece) => void; onCancel: () => void }) {
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
