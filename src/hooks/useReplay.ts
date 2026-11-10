import { Chess } from 'chess.js'
import { useCallback, useMemo, useState } from 'react'
import type { ParsedGame } from '../core'

export interface SquareMove {
  from: string
  to: string
}

/** A line explored away from the played game. `fens[0]` is the branch point. */
export interface Variation {
  baseIndex: number
  fens: string[]
  sans: string[]
  moves: SquareMove[]
  cursor: number
}

function uciSquares(uci: string): SquareMove {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function useReplay(parsed: ParsedGame) {
  const fens = useMemo(() => [parsed.initialFen, ...parsed.plies.map(ply => ply.after)], [parsed])
  const lastIndex = fens.length - 1
  const [index, setIndex] = useState(0)
  const [variation, setVariation] = useState<Variation | null>(null)

  const fen = variation ? variation.fens[variation.cursor] : fens[index]

  const lastMove: SquareMove | null = variation
    ? variation.cursor > 0
      ? variation.moves[variation.cursor - 1]
      : variation.baseIndex > 0 ? uciSquares(parsed.plies[variation.baseIndex - 1].uci) : null
    : index > 0 ? uciSquares(parsed.plies[index - 1].uci) : null

  const goTo = useCallback((target: number) => {
    setVariation(null)
    setIndex(clamp(target, 0, lastIndex))
  }, [lastIndex])

  const step = useCallback((delta: number) => {
    if (variation) {
      setVariation({ ...variation, cursor: clamp(variation.cursor + delta, 0, variation.fens.length - 1) })
    } else {
      setIndex(i => clamp(i + delta, 0, lastIndex))
    }
  }, [variation, lastIndex])

  const toStart = useCallback(() => {
    if (variation) setVariation({ ...variation, cursor: 0 })
    else setIndex(0)
  }, [variation])

  const toEnd = useCallback(() => {
    if (variation) setVariation({ ...variation, cursor: variation.fens.length - 1 })
    else setIndex(lastIndex)
  }, [variation, lastIndex])

  const exitVariation = useCallback(() => {
    if (!variation) return
    setIndex(variation.baseIndex)
    setVariation(null)
  }, [variation])

  /** Plays a legal move from the shown position. Returns false for an illegal move. */
  const playMove = useCallback((from: string, to: string): boolean => {
    const chess = new Chess(fen)
    let move
    try {
      move = chess.move({ from, to, promotion: 'q' })
    } catch {
      return false
    }
    const uci = `${from}${to}${move.promotion ?? ''}`
    if (!variation && index < lastIndex && parsed.plies[index].uci === uci) {
      setIndex(index + 1)
      return true
    }
    const square = { from, to }
    if (variation) {
      const keep = variation.cursor
      setVariation({
        ...variation,
        fens: [...variation.fens.slice(0, keep + 1), chess.fen()],
        sans: [...variation.sans.slice(0, keep), move.san],
        moves: [...variation.moves.slice(0, keep), square],
        cursor: keep + 1,
      })
    } else {
      setVariation({ baseIndex: index, fens: [fen, chess.fen()], sans: [move.san], moves: [square], cursor: 1 })
    }
    return true
  }, [fen, variation, index, lastIndex, parsed])

  /** Opens a SAN line from a game position as a variation, showing its first move. */
  const showLine = useCallback((baseIndex: number, sans: string[]) => {
    const chess = new Chess(fens[baseIndex])
    const next: Variation = { baseIndex, fens: [chess.fen()], sans: [], moves: [], cursor: 0 }
    for (const san of sans) {
      try {
        const move = chess.move(san)
        next.fens.push(chess.fen())
        next.sans.push(move.san)
        next.moves.push({ from: move.from, to: move.to })
      } catch {
        break
      }
    }
    if (!next.sans.length) return
    next.cursor = 1
    setVariation(next)
  }, [fens])

  return { fens, index, lastIndex, variation, fen, lastMove, goTo, step, toStart, toEnd, exitVariation, playMove, showLine, setVariation }
}
