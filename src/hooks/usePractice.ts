import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameReview, MoveGrade, MoveInput, ParsedPly, PracticeRecord, Puzzle } from '../core'
import {
  StockfishEngine, collectPuzzles, judgeAttempt, loadAllReviews, loadPracticeRecords, orderPuzzles, playMove,
  recordResult, savePracticeRecord, summarisePractice,
} from '../core'

export type PracticeStatus = 'solving' | 'checking' | 'wrong' | 'solved' | 'revealed'

export interface PracticeAttempt {
  status: PracticeStatus
  /** The latest answer, kept so the note can describe it. */
  answer: { ply: ParsedPly; grade: MoveGrade | null } | null
  hint: boolean
  /** Whether this showing of the puzzle has been recorded yet. */
  recorded: boolean
}

const FRESH: PracticeAttempt = { status: 'solving', answer: null, hint: false, recorded: false }

/**
 * Practice session over saved reviews. Reviews and progress reload whenever
 * the page becomes active, so newly reviewed games appear. Browser storage
 * failures fall back to this session's reviews and in-memory progress.
 */
export function usePractice({ isActive, username, sessionReviews, focus }: {
  isActive: boolean
  username: string | null
  sessionReviews: ReadonlyMap<string, GameReview>
  /** A puzzle to show next, e.g. picked from a review. A new `key` shows it again. */
  focus: { id: string; key: number } | null
}) {
  const [stored, setStored] = useState<GameReview[] | null>(null)
  const [records, setRecords] = useState<ReadonlyMap<string, PracticeRecord>>(new Map())
  const [currentId, setCurrentId] = useState<string | null>(null)
  // Tied to a puzzle id, so showing another puzzle starts fresh without resetting state.
  const [attemptState, setAttemptState] = useState<PracticeAttempt & { id: string | null }>({ ...FRESH, id: null })
  const [session, setSession] = useState({ done: 0, solved: 0, streak: 0 })

  useEffect(() => {
    if (!isActive) return
    let live = true
    loadAllReviews().then(reviews => { if (live) setStored(reviews) }, () => { if (live) setStored([]) })
    loadPracticeRecords().then(
      list => { if (live) setRecords(current => new Map([...list.map(r => [r.id, r] as const), ...current])) },
      () => {},
    )
    return () => { live = false }
  }, [isActive])

  const puzzles = useMemo(() => {
    const reviews = new Map((stored ?? []).map(review => [review.gameId, review]))
    for (const review of sessionReviews.values()) reviews.set(review.gameId, review)
    return collectPuzzles(reviews.values(), username)
  }, [stored, sessionReviews, username])

  const ordered = useMemo(() => orderPuzzles(puzzles, records), [puzzles, records])
  // An asked-for puzzle wins once; otherwise the current one stays until the player moves on.
  const [handledFocus, setHandledFocus] = useState<number | null>(null)
  if (focus && focus.key !== handledFocus && puzzles.some(p => p.id === focus.id)) {
    setHandledFocus(focus.key)
    setCurrentId(focus.id)
    setAttemptState({ ...FRESH, id: null })
  }
  const puzzle = puzzles.find(p => p.id === currentId) ?? ordered[0] ?? null
  if (puzzle && puzzle.id !== currentId) setCurrentId(puzzle.id)
  const attempt: PracticeAttempt = puzzle && attemptState.id === puzzle.id ? attemptState : FRESH
  const setAttempt = useCallback((id: string, next: PracticeAttempt) => setAttemptState({ ...next, id }), [])

  const engine = useRef<StockfishEngine | null>(null)
  const search = useRef<AbortController | null>(null)
  useEffect(() => () => { search.current?.abort(); engine.current?.dispose() }, [])

  const record = useCallback((id: string, solved: boolean) => {
    const next = recordResult(records.get(id), id, solved)
    savePracticeRecord(next).catch(() => { /* in-memory progress still works */ })
    setRecords(current => new Map(current).set(id, next))
    setSession(s => ({ done: s.done + 1, solved: s.solved + (solved ? 1 : 0), streak: solved ? s.streak + 1 : 0 }))
  }, [records])

  /** The first decisive answer is recorded: solved only if right first time without a hint. */
  const settle = useCallback((target: Puzzle, before: PracticeAttempt, ply: ParsedPly, correct: boolean, grade: MoveGrade | null) => {
    if (!before.recorded) record(target.id, correct && !before.hint)
    setAttempt(target.id, { ...before, status: correct ? 'solved' : 'wrong', answer: { ply, grade }, recorded: true })
  }, [record, setAttempt])

  /** Plays an answer. Returns false when the move is illegal or the puzzle is finished. */
  const answer = useCallback((input: MoveInput): boolean => {
    if (!puzzle || attempt.status === 'checking' || attempt.status === 'solved' || attempt.status === 'revealed') return false
    const ply = playMove(puzzle.fen, puzzle.ply, input)
    if (!ply) return false
    const verdict = judgeAttempt(puzzle, ply)
    if (verdict.status !== 'evaluate') {
      settle(puzzle, attempt, ply, verdict.status === 'correct', verdict.grade)
      return true
    }
    setAttempt(puzzle.id, { ...attempt, status: 'checking', answer: { ply, grade: null } })
    const controller = new AbortController()
    search.current?.abort()
    search.current = controller
    engine.current ??= new StockfishEngine()
    const current = engine.current
    current.evaluate(ply.after, { preset: 'standard', signal: controller.signal }).then(
      after => {
        if (controller.signal.aborted) return
        const result = judgeAttempt(puzzle, ply, after)
        if (result.status !== 'evaluate') settle(puzzle, attempt, ply, result.status === 'correct', result.grade)
      },
      () => {
        // A failed or cancelled search closes its engine; the next answer starts a fresh one.
        if (engine.current === current) engine.current = null
        if (!controller.signal.aborted) setAttempt(puzzle.id, { ...attempt, status: 'solving', answer: null })
      },
    )
    return true
  }, [puzzle, attempt, settle, setAttempt])

  const showHint = useCallback(() => {
    if (puzzle && (attempt.status === 'solving' || attempt.status === 'wrong')) setAttempt(puzzle.id, { ...attempt, hint: true })
  }, [puzzle, attempt, setAttempt])

  const reveal = useCallback(() => {
    if (!puzzle || attempt.status === 'solved' || attempt.status === 'revealed') return
    search.current?.abort()
    if (!attempt.recorded) record(puzzle.id, false)
    setAttempt(puzzle.id, { ...attempt, status: 'revealed', recorded: true })
  }, [puzzle, attempt, record, setAttempt])

  /** Moves on. An unfinished puzzle is skipped without counting against the player. */
  const next = useCallback(() => {
    search.current?.abort()
    const following = ordered.find(p => p.id !== puzzle?.id) ?? puzzle
    setCurrentId(following?.id ?? null)
    setAttemptState({ ...FRESH, id: null })
  }, [ordered, puzzle])

  /** Plays the same position again. Its result is already recorded. */
  const retry = useCallback(() => {
    if (puzzle) setAttempt(puzzle.id, { ...FRESH, recorded: attempt.recorded })
  }, [puzzle, attempt.recorded, setAttempt])

  return {
    loading: stored === null,
    puzzle,
    attempt,
    summary: summarisePractice(puzzles, records),
    session,
    answer,
    showHint,
    reveal,
    next,
    retry,
  }
}
