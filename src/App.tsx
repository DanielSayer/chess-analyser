import { useCallback, useState } from 'react'
import './App.css'
import { GameLibrary } from './components/GameLibrary'
import { GameWorkspace } from './components/GameWorkspace'
import { Navigation } from './components/Navigation'
import type { View } from './components/Navigation'
import { PlayPage } from './components/PlayPage'
import type { GameReview, ImportedGame, Side } from './core'
import { useLibrary } from './hooks/useLibrary'
import { PLAY_STORAGE_KEY } from './hooks/usePlayGame'
import { useTheme } from './hooks/useTheme'

const noop = () => {}

export default function App() {
  const library = useLibrary()
  const { theme, setTheme } = useTheme()
  const { state } = library
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>(() => (location.hash === '#play' ? 'play' : 'games'))
  // Remounts the play page after local data is cleared.
  const [playKey, setPlayKey] = useState(0)
  // Play mounts on first visit, then stays mounted so its engine and game survive tab switches.
  const [playOpened, setPlayOpened] = useState(view === 'play')
  if (view === 'play' && !playOpened) setPlayOpened(true)
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
    history.replaceState(null, '', next === 'play' ? '#play' : location.pathname + location.search)
    window.scrollTo({ top: 0 })
  }, [])
  const clearAll = useCallback(async () => {
    const error = await library.clearAll()
    if (!error) {
      try { localStorage.removeItem(PLAY_STORAGE_KEY) } catch { /* storage unavailable */ }
      setReviews(new Map()); setSelectedId(null); setLocalGame(null); setPlayKey(k => k + 1); setView('games')
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
  const cached = selected ? reviews.get(selected.id) : null
  return (
    <div className="app" data-view={activeView}>
      <Navigation view={activeView} canReview={selected !== null} hasLocalData={state.username !== null || state.reviewedIds.size > 0} theme={theme} onTheme={setTheme} onNavigate={navigate} onClear={clearAll} />
      <main className="main">
        <section className="library-view" hidden={activeView !== 'games'} aria-label="Your game library">
          <GameLibrary library={library} selectedId={selectedId} reviews={reviews} onSelect={selectGame} />
        </section>
        {selected && viewer && <section className="review-view" hidden={activeView !== 'board'} aria-label="Analysis workspace">
          {/* Keyed by PGN too: a local game reviewed again after more moves starts fresh. */}
          <GameWorkspace key={`${selected.id}:${selected.pgn}`} game={selected} username={viewer} isActive={activeView === 'board'} cachedReview={cached?.pgn === selected.pgn ? cached : null} onReviewComplete={onReviewComplete} onReviewSaved={isLocal ? noop : library.markReviewed} onStorageIssue={library.flagStorage} onBack={() => navigate(isLocal ? 'play' : 'games')} backLabel={isLocal ? 'Play' : 'Games'} />
        </section>}
        {playOpened && <section className="review-view play-view" hidden={activeView !== 'play'} aria-label="Play over the board">
          <PlayPage key={playKey} isActive={activeView === 'play'} onReview={reviewLocal} />
        </section>}
      </main>
    </div>
  )
}
