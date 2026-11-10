import { Alert, Button, Skeleton, Spinner } from '@heroui/react'
import { History, RotateCw } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import './App.css'
import { AboutDialog } from './components/AboutDialog'
import { GameList } from './components/GameList'
import { GameWorkspace } from './components/GameWorkspace'
import { ImportForm } from './components/ImportForm'
import { Logo } from './components/Logo'
import type { GameReview, ImportedGame } from './core'
import { useLibrary } from './hooks/useLibrary'

export default function App() {
  const library = useLibrary()
  const { state } = library
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'games' | 'board'>('games')
  // Completed reviews from this session, so they survive game switches even when storage fails.
  const reviews = useRef(new Map<string, GameReview>())

  const selected = state.games.find(game => game.id === selectedId) ?? null
  const busy = state.status === 'importing'

  const selectGame = useCallback((game: ImportedGame) => {
    setSelectedId(game.id)
    setView('board')
  }, [])

  const onReviewComplete = useCallback((review: GameReview) => {
    reviews.current.set(review.gameId, review)
  }, [])

  const clearAll = useCallback(async () => {
    const error = await library.clearAll()
    if (!error) {
      reviews.current.clear()
      setSelectedId(null)
      setView('games')
    }
    return error
  }, [library])

  const cachedFor = (game: ImportedGame) => {
    const review = reviews.current.get(game.id)
    return review && review.pgn === game.pgn ? review : null
  }

  return (
    <div className="app" data-view={selected ? view : 'games'}>
      <aside className="sidebar" aria-label="Games">
        <div className="brand">
          <Logo />
          <span className="brand__name">Chess Analyser</span>
          <AboutDialog hasLocalData={state.username !== null || state.reviewedIds.size > 0} onClear={clearAll} />
        </div>

        <ImportForm
          key={state.username ?? ''}
          busy={busy}
          pendingUsername={state.pendingUsername}
          initialValue={state.username ?? ''}
          onImport={library.importPlayer}
          onCancel={library.cancel}
        />

        {state.importError && (
          <Alert status="danger" className="sidebar__alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Import failed</Alert.Title>
              <Alert.Description>
                {state.importError}
                {state.username && state.games.length > 0 && ' Your current list is unchanged.'}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {state.storageIssue && (
          <p className="storage-note" role="status">
            Browser storage is unavailable, so games and reviews last only until this tab closes.
          </p>
        )}

        {state.status === 'restoring' ? (
          <div className="game-list__skeleton" aria-label="Loading saved games">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="skeleton-row" />)}
          </div>
        ) : state.username ? (
          <>
            <div className="library-head">
              <div>
                <h2 className="library-head__name">{state.username}</h2>
                <p className="library-head__meta tabular">
                  {state.games.length} {state.games.length === 1 ? 'game' : 'games'}
                  {!state.synced && ' · saved on this device'}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => void library.importPlayer(state.username!)}
                isDisabled={busy || state.status === 'loading-older'}
              >
                <RotateCw size={14} /> Refresh
              </Button>
            </div>

            {state.games.length === 0 ? (
              <div className="game-list__empty">
                <p>No completed standard games in the months loaded so far.</p>
              </div>
            ) : (
              <GameList
                key={state.username}
                username={state.username}
                games={state.games}
                selectedId={selected?.id ?? null}
                reviewedIds={state.reviewedIds}
                onSelect={selectGame}
              />
            )}

            <div className="older">
              {state.status === 'loading-older' ? (
                <div className="older__loading" role="status">
                  <Spinner size="sm" color="current" /> Loading older games
                  <Button size="sm" variant="ghost" onPress={library.cancel}>Cancel</Button>
                </div>
              ) : state.remainingArchives === null ? (
                <p className="muted">Refresh to check for new games and older months.</p>
              ) : state.remainingArchives.length > 0 ? (
                <Button size="sm" variant="tertiary" fullWidth onPress={() => void library.loadOlder()} isDisabled={busy}>
                  <History size={14} /> Load older games
                  <span className="older__count tabular">{state.remainingArchives.length} {state.remainingArchives.length === 1 ? 'month' : 'months'} left</span>
                </Button>
              ) : (
                <p className="muted">All archived months are loaded.</p>
              )}
              {state.olderError && (
                <Alert status="danger" className="sidebar__alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{state.olderError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          </>
        ) : (
          <div className="intro">
            <p>Enter a Chess.com username to load that player's recent public games, newest first.</p>
            <p className="muted">Reviews run on this device with Stockfish. Nothing is uploaded.</p>
          </div>
        )}
      </aside>

      <main className="main">
        {selected && state.username ? (
          <GameWorkspace
            key={selected.id}
            game={selected}
            username={state.username}
            cachedReview={cachedFor(selected)}
            onReviewComplete={onReviewComplete}
            onReviewSaved={library.markReviewed}
            onStorageIssue={library.flagStorage}
            onBack={() => setView('games')}
          />
        ) : (
          <div className="placeholder">
            <div className="placeholder__board" aria-hidden="true">
              <Chessboard
                options={{
                  id: 'placeholder-board',
                  allowDragging: false,
                  showNotation: false,
                  lightSquareStyle: { backgroundColor: 'var(--board-light)' },
                  darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
                  boardStyle: { borderRadius: 6, overflow: 'hidden' },
                }}
              />
            </div>
            <p className="placeholder__text">
              {state.games.length ? 'Pick a game from the list to replay and review it.' : 'Import a player to get started.'}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
