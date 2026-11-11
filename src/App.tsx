import { useCallback, useState } from 'react'
import './App.css'
import { GameLibrary } from './components/GameLibrary'
import { GameWorkspace } from './components/GameWorkspace'
import { Navigation } from './components/Navigation'
import type { GameReview, ImportedGame } from './core'
import { useLibrary } from './hooks/useLibrary'

export default function App() {
  const library = useLibrary()
  const { state } = library
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'games' | 'board'>('games')
  const [reviews, setReviews] = useState<ReadonlyMap<string, GameReview>>(new Map())
  const selected = state.games.find(game => game.id === selectedId) ?? null
  const activeView = selected ? view : 'games'

  const selectGame = useCallback((game: ImportedGame) => {
    setSelectedId(game.id)
    setView('board')
    window.scrollTo({ top: 0 })
  }, [])
  const onReviewComplete = useCallback((review: GameReview) => {
    setReviews(current => new Map(current).set(review.gameId, review))
  }, [])
  const navigate = useCallback((next: 'games' | 'board') => { setView(next); window.scrollTo({ top: 0 }) }, [])
  const clearAll = useCallback(async () => {
    const error = await library.clearAll()
    if (!error) { setReviews(new Map()); setSelectedId(null); setView('games') }
    return error
  }, [library])
  const cached = selected ? reviews.get(selected.id) : null
  return (
    <div className="app" data-view={activeView}>
      <Navigation view={activeView} canReview={selected !== null} hasLocalData={state.username !== null || state.reviewedIds.size > 0} onNavigate={navigate} onClear={clearAll} />
      <main className="main">
        <section className="library-view" hidden={activeView !== 'games'} aria-label="Your game library">
          <GameLibrary library={library} selectedId={selectedId} reviews={reviews} onSelect={selectGame} />
        </section>
        {selected && state.username && <section className="review-view" hidden={activeView !== 'board'} aria-label="Analysis workspace">
          <GameWorkspace key={selected.id} game={selected} username={state.username} isActive={activeView === 'board'} cachedReview={cached?.pgn === selected.pgn ? cached : null} onReviewComplete={onReviewComplete} onReviewSaved={library.markReviewed} onStorageIssue={library.flagStorage} onBack={() => navigate('games')} />
        </section>}
      </main>
    </div>
  )
}
