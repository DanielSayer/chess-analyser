import { Alert, Button, Skeleton, Spinner } from '@heroui/react'
import { ChevronDown, Download, RotateCw, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GameReview, ImportedGame } from '../core'
import type { useLibrary } from '../hooks/useLibrary'
import { capitalise, outcomeFor, playerSide } from '../ui/format'
import { GameList } from './GameList'
import { ImportForm } from './ImportForm'
import { Logo } from './Logo'

interface Props {
  library: ReturnType<typeof useLibrary>
  selectedId: string | null
  reviews: ReadonlyMap<string, GameReview>
  onSelect: (game: ImportedGame) => void
}

export function GameLibrary({ library, selectedId, reviews, onSelect }: Props) {
  const { state } = library
  const [editing, setEditing] = useState(false)
  const [filters, setFilters] = useState(false)
  const busy = state.status === 'importing'
  const loadingOlder = state.status === 'loading-older'
  useEffect(() => {
    if (state.username && state.status === 'idle' && !state.importError) setEditing(false)
  }, [state.username, state.status, state.importError])
  const latest = state.games[0]
  const player = latest && state.username ? latest[playerSide(latest, state.username)] : null
  const remaining = state.remainingArchives?.length ?? 0

  return (
    <div className={`library-page ${state.username ? '' : 'library-page--welcome'}`}>
      <header className="library-title">
        <div><p className="eyebrow">CHESS.COM GAME ANALYSIS</p><h1>Your games</h1></div>
        <span className="library-title__note"><span className="status-dot" /> Stockfish, on your device</span>
      </header>
      {!state.username && state.status !== 'restoring' && <div className="welcome">
        <div className="welcome__mark"><Logo /></div><h2>Every game has something to show you.</h2>
        <p>Import your Chess.com games. Pick one to replay, find the turning points and see what to play next time.</p>
      </div>}
      {state.username && <section className="player-card" aria-label="Selected player">
        <span className="player-avatar">{state.username[0].toUpperCase()}</span>
        <div className="player-card__identity"><h2>{state.username}</h2><p>{latest ? `${capitalise(latest.timeClass)}${player?.rating ? ` · ${player.rating}` : ''}` : 'Chess.com player'} <span>· {state.games.length} {state.games.length === 1 ? 'game' : 'games'}</span></p></div>
        <Button isIconOnly variant="ghost" aria-label={editing ? 'Close player editor' : 'Change player'} onPress={() => setEditing(value => !value)}>{editing ? <X size={19} /> : <ChevronDown size={21} />}</Button>
      </section>}
      <div className="player-editor" hidden={!!state.username && !editing && !busy}>
        <ImportForm key={state.username ?? ''} busy={busy} pendingUsername={state.pendingUsername} initialValue={state.username ?? ''} onImport={library.importPlayer} onCancel={library.cancel} />
        {!state.username && <p className="import-note">Public games only. No sign-in needed.</p>}
      </div>
      {state.importError && <Alert status="danger" className="sidebar__alert"><Alert.Indicator /><Alert.Content><Alert.Title>Import failed</Alert.Title><Alert.Description>{state.importError}{state.games.length > 0 && ' Your current list is unchanged.'}</Alert.Description></Alert.Content></Alert>}
      {state.storageIssue && <p className="storage-note" role="status">Browser storage is unavailable, so games and reviews last only until this tab closes.</p>}
      {state.status === 'restoring' ? <div className="game-list__skeleton" aria-label="Loading saved games">{[0, 1, 2].map(i => <Skeleton key={i} className="skeleton-row" />)}</div> : state.username && <>
        {state.games.length > 0 && <div className="recent-results" aria-label="Recent game results">
          {state.games.slice(0, 10).reverse().map(game => <button key={game.id} type="button" className={`recent-result is-${outcomeFor(game, state.username!)}`} aria-label={`Open ${outcomeFor(game, state.username!)} against ${game[playerSide(game, state.username!) === 'white' ? 'black' : 'white'].username}`} aria-pressed={selectedId === game.id} onClick={() => onSelect(game)} />)}
        </div>}
        <div className="library-actions">
          <Button variant="secondary" onPress={() => void library.importPlayer(state.username!)} isDisabled={busy || loadingOlder}><RotateCw size={17} /> Refresh</Button>
          {loadingOlder ? <Button variant="primary" onPress={library.cancel}><Spinner size="sm" color="current" /> Cancel import</Button> : <Button variant="primary" aria-label={remaining > 0 ? 'Load older games' : 'Import games'} onPress={() => remaining > 0 ? void library.loadOlder() : void library.importPlayer(state.username!)} isDisabled={busy}><Download size={17} /> {remaining > 0 ? 'Import more games' : 'Import games'}</Button>}
          <Button variant="secondary" aria-expanded={filters} aria-controls="game-filters" onPress={() => setFilters(value => !value)}><SlidersHorizontal size={17} /> Filters</Button>
        </div>
        <div className="library-caption"><span>{state.synced ? 'Newest games first' : 'Saved on this device'}</span><span>{loadingOlder ? 'Loading older games' : state.remainingArchives === null ? 'Refresh to find older games' : remaining > 0 ? `${remaining} ${remaining === 1 ? 'month' : 'months'} left to import` : 'All archived months are loaded.'}</span></div>
        {state.olderError && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{state.olderError}</Alert.Description></Alert.Content></Alert>}
        <GameList key={state.username} username={state.username} games={state.games} selectedId={selectedId} reviewedIds={state.reviewedIds} reviews={reviews} filtersVisible={filters} onSelect={onSelect} />
      </>}
    </div>
  )
}
