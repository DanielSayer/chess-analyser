import { useCallback, useState } from 'react'
import './App.css'
import { GameLibrary } from './components/GameLibrary'
import { GameWorkspace } from './components/GameWorkspace'
import { Navigation } from './components/Navigation'
import type { View } from './components/Navigation'
import { PlayPage } from './components/PlayPage'
import type { GameReview, ImportedGame } from './core'
import { useLibrary } from './hooks/useLibrary'
import { PLAY_STORAGE_KEY } from './hooks/usePlayGame'
import { useTheme } from './hooks/useTheme'

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
  const selected = state.games.find(game => game.id === selectedId) ?? null
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
      setReviews(new Map()); setSelectedId(null); setPlayKey(k => k + 1); setView('games')
    }
    return error
  }, [library])
  const cached = selected ? reviews.get(selected.id) : null
  return (
    <div className="app" data-view={activeView}>
      <Navigation view={activeView} canReview={selected !== null} hasLocalData={state.username !== null || state.reviewedIds.size > 0} theme={theme} onTheme={setTheme} onNavigate={navigate} onClear={clearAll} />
      <main className="main">
        <section className="library-view" hidden={activeView !== 'games'} aria-label="Your game library">
          <GameLibrary library={library} selectedId={selectedId} reviews={reviews} onSelect={selectGame} />
        </section>
        {selected && state.username && <section className="review-view" hidden={activeView !== 'board'} aria-label="Analysis workspace">
          <GameWorkspace key={selected.id} game={selected} username={state.username} isActive={activeView === 'board'} cachedReview={cached?.pgn === selected.pgn ? cached : null} onReviewComplete={onReviewComplete} onReviewSaved={library.markReviewed} onStorageIssue={library.flagStorage} onBack={() => navigate('games')} />
        </section>}
        {playOpened && <section className="review-view play-view" hidden={activeView !== 'play'} aria-label="Play over the board">
          <PlayPage key={playKey} isActive={activeView === 'play'} />
        </section>}
      </main>
    </div>
  )
}
