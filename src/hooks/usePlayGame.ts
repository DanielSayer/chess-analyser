import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GameEnd, MoveInput, ParsedPly, PositionEvaluation, Side } from '../core'
import { START_FEN, playMove, ruleEnding } from '../core'

export const PLAY_STORAGE_KEY = 'chess-analyser:play'

export interface PlaySettings {
  orientation: Side
  autoFlip: boolean
  /** Engine on: evaluation bar, grades and hints. Off stops analysis entirely. */
  showAnalysis: boolean
  showHint: boolean
}

interface Saved {
  version: 1
  /** Identifies this game's saved review. A new game gets a new one. */
  startedAt: number
  plies: ParsedPly[]
  /** Resignations and agreed draws. Rule endings are recomputed from the moves. */
  manualEnd: GameEnd | null
  evaluations: PositionEvaluation[]
  settings: PlaySettings
}

const DEFAULT_SETTINGS: PlaySettings = { orientation: 'white', autoFlip: false, showAnalysis: true, showHint: false }

/** Replays saved moves so a corrupted or edited save can't load an illegal game. */
function restore(): Saved | null {
  try {
    const raw = localStorage.getItem(PLAY_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    if (saved?.version !== 1 || !Array.isArray(saved.plies)) return null
    const plies: ParsedPly[] = []
    let fen = START_FEN
    for (const ply of saved.plies) {
      const next = playMove(fen, plies.length + 1, { from: ply.uci.slice(0, 2), to: ply.uci.slice(2, 4), promotion: ply.uci[4] as MoveInput['promotion'] })
      if (!next) break
      plies.push(next)
      fen = next.after
    }
    return {
      version: 1,
      startedAt: typeof saved.startedAt === 'number' ? saved.startedAt : Date.now(),
      plies,
      manualEnd: plies.length === saved.plies.length ? saved.manualEnd ?? null : null,
      evaluations: Array.isArray(saved.evaluations) ? saved.evaluations.filter(e => typeof e?.fen === 'string' && Array.isArray(e.lines)) : [],
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    }
  } catch { return null }
}

/** One over-the-board game, kept in this browser between visits. */
export function usePlayGame() {
  const [initial] = useState(restore)
  const [startedAt, setStartedAt] = useState(() => initial?.startedAt ?? Date.now())
  const [plies, setPlies] = useState<ParsedPly[]>(initial?.plies ?? [])
  const [manualEnd, setManualEnd] = useState<GameEnd | null>(initial?.manualEnd ?? null)
  const [cursor, setCursor] = useState(plies.length)
  const [settings, setSettings] = useState<PlaySettings>(initial?.settings ?? DEFAULT_SETTINGS)
  // Long jumps skip piece animation.
  const [jumped, setJumped] = useState(false)

  const fens = useMemo(() => [START_FEN, ...plies.map(ply => ply.after)], [plies])
  const end = useMemo(() => ruleEnding(START_FEN, plies) ?? manualEnd, [plies, manualEnd])
  const live = cursor === plies.length
  const fen = fens[cursor]
  const turn: Side = fens.at(-1)!.split(' ')[1] === 'w' ? 'white' : 'black'

  const move = useCallback((input: MoveInput): boolean => {
    if (!live || end) return false
    const next = playMove(fens.at(-1)!, plies.length + 1, input)
    if (!next) return false
    setPlies([...plies, next])
    setCursor(plies.length + 1)
    setJumped(false)
    if (settings.autoFlip && !ruleEnding(START_FEN, [...plies, next])) {
      setSettings(s => ({ ...s, orientation: next.side === 'white' ? 'black' : 'white' }))
    }
    return true
  }, [live, end, fens, plies, settings.autoFlip])

  const undo = useCallback(() => {
    if (manualEnd) { setManualEnd(null); setCursor(plies.length); return }
    if (!plies.length) return
    const next = plies.slice(0, -1)
    setPlies(next)
    setCursor(next.length)
    setJumped(false)
    if (settings.autoFlip) setSettings(s => ({ ...s, orientation: next.length % 2 === 0 ? 'white' : 'black' }))
  }, [manualEnd, plies, settings.autoFlip])

  const newGame = useCallback(() => {
    setPlies([])
    setManualEnd(null)
    setCursor(0)
    setStartedAt(Date.now())
    setJumped(true)
    if (settings.autoFlip) setSettings(s => ({ ...s, orientation: 'white' }))
  }, [settings.autoFlip])

  /** Drops every move after the viewed position, so play continues from there. */
  const playFromHere = useCallback(() => {
    setPlies(plies.slice(0, cursor))
    setManualEnd(null)
    setJumped(false)
  }, [plies, cursor])

  const goTo = useCallback((index: number) => {
    const next = Math.max(0, Math.min(plies.length, index))
    setJumped(Math.abs(next - cursor) > 1)
    setCursor(next)
  }, [plies.length, cursor])

  const resign = useCallback((side: Side) => setManualEnd({ result: side === 'white' ? '0-1' : '1-0', reason: 'resignation' }), [])
  const agreeDraw = useCallback(() => setManualEnd({ result: '1/2-1/2', reason: 'agreement' }), [])
  const updateSettings = useCallback((patch: Partial<PlaySettings>) => setSettings(s => ({ ...s, ...patch })), [])

  return {
    initialEvaluations: initial?.evaluations ?? [],
    id: `local-${startedAt}`, startedAt,
    plies, fens, fen, cursor, live, end, manualEnd, turn, settings, jumped,
    move, undo, newGame, playFromHere, goTo, resign, agreeDraw, updateSettings,
  }
}

export type PlayGame = ReturnType<typeof usePlayGame>

/** Saves the game, its analysis and the board settings. Storage failures keep the game in memory. */
export function usePlayPersistence(game: PlayGame, evaluations: ReadonlyMap<string, PositionEvaluation>) {
  const { plies, manualEnd, settings, fens, startedAt } = game
  useEffect(() => {
    const saved: Saved = {
      version: 1,
      startedAt,
      plies,
      manualEnd,
      settings,
      evaluations: fens.map(fen => evaluations.get(fen)).filter((e): e is PositionEvaluation => e !== undefined),
    }
    try { localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify(saved)) } catch { /* storage unavailable */ }
  }, [plies, manualEnd, settings, fens, evaluations, startedAt])
}

/** Whether the side to move is in check in `fen`. */
export function inCheck(fen: string): boolean {
  try { return new Chess(fen).inCheck() } catch { return false }
}
