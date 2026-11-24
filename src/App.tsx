import { Spinner } from '@heroui/react'
import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import './App.css'
import { GameLibrary } from './components/GameLibrary'
import { Navigation } from './components/Navigation'
import type { View } from './components/Navigation'
import type { GameReview, ImportedGame, Puzzle, Side } from './core'
import { useLibrary } from './hooks/useLibrary'
import { PLAY_STORAGE_KEY } from './hooks/usePlayGame'
import { useTheme } from './hooks/useTheme'

const noop = () => {}

// Review and Play load on demand, so the library opens without the board, engine glue and their UI.
const loadWorkspace = () => import('./components/GameWorkspace')
const loadPlay = () => import('./components/PlayPage')
const loadPractise = () => import('./components/PractisePage')
const GameWorkspace = lazy(() => loadWorkspace().then(module => ({ default: module.GameWorkspace })))
const PlayPage = lazy(() => loadPlay().then(module => ({ default: module.PlayPage })))
const PractisePage = lazy(() => loadPractise().then(module => ({ default: module.PractisePage })))

const HASH_VIEWS: Partial<Record<string, View>> = { '#play': 'play', '#practise': 'practise' }

function ViewLoading() {
  return <div className="view-loading"><Spinner size="lg" aria-label="Loading" /></div>
}

export default function App() {
  const library = useLibrary()
  const { theme, setTheme } = useTheme()
  const { state } = library
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>(() => HASH_VIEWS[location.hash] ?? 'games')
  // Remounts the play page after local data is cleared.
  const [playKey, setPlayKey] = useState(0)
  // Play mounts on first visit, then stays mounted so its engine and game survive tab switches.
  const [playOpened, setPlayOpened] = useState(view === 'play')
  if (view === 'play' && !playOpened) setPlayOpened(true)
  const [practiseOpened, setPractiseOpened] = useState(view === 'practise')
  if (view === 'practise' && !practiseOpened) setPractiseOpened(true)
  // A practice position to show next, and a review position to jump to.
  const [practiceFocus, setPracticeFocus] = useState<{ id: string; key: number } | null>(null)
  const [reviewJump, setReviewJump] = useState<{ gameId: string; ply: number; key: number } | null>(null)
  const [reviews, setReviews] = useState<ReadonlyMap<string, GameReview>>(new Map())
  // A game played on the Play page, opened for review.
  const [localGame, setLocalGame] = useState<{ game: ImportedGame; viewer: Side } | null>(null)
  const selected = localGame?.game.id === selectedId ? localGame.game : state.games.find(game => game.id === selectedId) ?? null
  const isLocal = selected?.source === 'local'
  const viewer = isLocal ? (localGame!.viewer === 'white' ? 'White' : 'Black') : state.username
  const activeView: View = view === 'board' && !selected ? 'games' : view

  const selectGame = useCallback((game: ImportedGame) => {
    setSelectedId(game.id)
    setView('board')
    window.scrollTo({ top: 0 })
  }, [])
  const onReviewComplete = useCallback((review: GameReview) => {
    setReviews(current => new Map(current).set(review.gameId, review))
  }, [])
  const navigate = useCallback((next: View) => {
    setView(next)
    history.replaceState(null, '', next === 'play' || next === 'practise' ? `#${next}` : location.pathname + location.search)
    window.scrollTo({ top: 0 })
  }, [])
  const clearAll = useCallback(async () => {
    const error = await library.clearAll()
    if (!error) {
      try { localStorage.removeItem(PLAY_STORAGE_KEY) } catch { /* storage unavailable */ }
      setReviews(new Map()); setSelectedId(null); setLocalGame(null); setPlayKey(k => k + 1); setPracticeFocus(null); setView('games')
    }
    return error
  }, [library])
  const reviewLocal = useCallback((game: ImportedGame, side: Side) => {
    setLocalGame({ game, viewer: side })
    setSelectedId(game.id)
    setView('board')
    history.replaceState(null, '', location.pathname + location.search)
    window.scrollTo({ top: 0 })
  }, [])
  const gameFor = useCallback((gameId: string) => (localGame?.game.id === gameId ? localGame.game : state.games.find(game => game.id === gameId) ?? null), [localGame, state.games])
  const openPuzzleGame = useCallback((puzzle: Puzzle) => {
    if (!gameFor(puzzle.gameId)) return
    setSelectedId(puzzle.gameId)
    setReviewJump(jump => ({ gameId: puzzle.gameId, ply: puzzle.ply, key: (jump?.key ?? 0) + 1 }))
    setView('board')
    history.replaceState(null, '', location.pathname + location.search)
    window.scrollTo({ top: 0 })
  }, [gameFor])
  const practise = useCallback((puzzleId: string) => {
    setPracticeFocus(focus => ({ id: puzzleId, key: (focus?.key ?? 0) + 1 }))
    navigate('practise')
  }, [navigate])
  const cached = selected ? reviews.get(selected.id) : null
  // Fetch the other screens once the first one is idle, so switching later is instant.
  useEffect(() => {
    const warm = () => { loadWorkspace().catch(noop); loadPlay().catch(noop); loadPractise().catch(noop) }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(warm, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(warm, 2000)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="app" data-view={activeView}>
      <Navigation view={activeView} canReview={selected !== null} hasLocalData={state.username !== null || state.reviewedIds.size > 0} theme={theme} onTheme={setTheme} onNavigate={navigate} onClear={clearAll} />
      <main className="main">
        <section className="library-view" hidden={activeView !== 'games'} aria-label="Your game library">
          <GameLibrary library={library} selectedId={selectedId} reviews={reviews} onSelect={selectGame} />
        </section>
        {selected && viewer && <section className="review-view" hidden={activeView !== 'board'} aria-label="Analysis workspace">
          {/* Keyed by PGN too: a local game reviewed again after more moves starts fresh. */}
          <Suspense fallback={<ViewLoading />}><GameWorkspace key={`${selected.id}:${selected.pgn}`} game={selected} username={viewer} isActive={activeView === 'board'} cachedReview={cached?.pgn === selected.pgn ? cached : null} onReviewComplete={onReviewComplete} onReviewSaved={isLocal ? noop : library.markReviewed} onStorageIssue={library.flagStorage} onBack={() => navigate(isLocal ? 'play' : 'games')} backLabel={isLocal ? 'Play' : 'Games'} jump={reviewJump?.gameId === selected.id ? reviewJump : null} onPractise={practise} /></Suspense>
        </section>}
        {playOpened && <section className="review-view play-view" hidden={activeView !== 'play'} aria-label="Play over the board">
          <Suspense fallback={<ViewLoading />}><PlayPage key={playKey} isActive={activeView === 'play'} onReview={reviewLocal} /></Suspense>
        </section>}
        {practiseOpened && <section className="review-view practise-view" hidden={activeView !== 'practise'} aria-label="Practise mistakes">
          <Suspense fallback={<ViewLoading />}>
            <PractisePage key={playKey} isActive={activeView === 'practise'} username={state.username} sessionReviews={reviews} focus={practiceFocus} canOpenGame={puzzle => gameFor(puzzle.gameId) !== null} onOpenGame={openPuzzleGame} onGoToGames={() => navigate('games')} />
          </Suspense>
        </section>}
      </main>
    </div>
  )
}
