import { Button, ListBox, SearchField, Select, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { ArrowUpRight, Check, Clock3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { GameReview, ImportedGame } from '../core'
import type { Outcome } from '../ui/format'
import { capitalise, gameDate, outcomeFor, playerSide, timeControlLabel } from '../ui/format'

interface Props {
  username: string
  games: ImportedGame[]
  selectedId: string | null
  reviewedIds: ReadonlySet<string>
  reviews: ReadonlyMap<string, GameReview>
  filtersVisible: boolean
  onSelect: (game: ImportedGame) => void
}

type ResultFilter = 'all' | Outcome
const OUTCOME_LABEL: Record<Outcome, string> = { win: 'Won', loss: 'Lost', draw: 'Drawn' }

function dayLabel(timestamp: number) {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}

export function GameList({ username, games, selectedId, reviewedIds, reviews, filtersVisible, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ResultFilter>('all')
  const [timeClass, setTimeClass] = useState('all')
  const timeClasses = useMemo(() => [...new Set(games.map(game => game.timeClass))].sort(), [games])
  const activeTimeClass = timeClass === 'all' || timeClasses.includes(timeClass) ? timeClass : 'all'
  const filtered = useMemo(() => games.filter(game => {
    if (result !== 'all' && outcomeFor(game, username) !== result) return false
    if (activeTimeClass !== 'all' && game.timeClass !== activeTimeClass) return false
    const needle = query.trim().toLowerCase()
    const opponent = game[playerSide(game, username) === 'white' ? 'black' : 'white'].username
    return !needle || opponent.toLowerCase().includes(needle) || (game.opening ?? '').toLowerCase().includes(needle)
  }), [games, username, query, result, activeTimeClass])
  const groups = useMemo(() => {
    const days = new Map<string, ImportedGame[]>()
    for (const game of filtered) {
      const day = dayLabel(game.endTime)
      const group = days.get(day) ?? []
      group.push(game)
      days.set(day, group)
    }
    return [...days].map(([label, entries]) => ({ label, entries }))
  }, [filtered])
  const filtersActive = query.trim() !== '' || result !== 'all' || activeTimeClass !== 'all'

  return (
    <div className="game-list">
      <div id="game-filters" className="game-list__filters" hidden={!filtersVisible}>
        <div className="game-list__search-row">
          <SearchField value={query} onChange={setQuery} aria-label="Filter by opponent or opening" fullWidth>
            <SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder="Search opponent or opening" /><SearchField.ClearButton /></SearchField.Group>
          </SearchField>
          <Select aria-label="Time control" className="game-list__time" selectedKey={activeTimeClass} onSelectionChange={key => setTimeClass(String(key ?? 'all'))} isDisabled={timeClasses.length < 2}>
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover><ListBox><ListBox.Item id="all" textValue="All speeds">All speeds</ListBox.Item>{timeClasses.map(value => <ListBox.Item key={value} id={value} textValue={capitalise(value)}>{capitalise(value)}</ListBox.Item>)}</ListBox></Select.Popover>
          </Select>
        </div>
        <ToggleButtonGroup aria-label="Result" selectionMode="single" disallowEmptySelection selectedKeys={[result]} onSelectionChange={keys => setResult(([...keys][0] as ResultFilter) ?? 'all')} size="sm" fullWidth>
          <ToggleButton id="all">All</ToggleButton><ToggleButton id="win">Won</ToggleButton><ToggleButton id="loss">Lost</ToggleButton><ToggleButton id="draw">Drawn</ToggleButton>
        </ToggleButtonGroup>
      </div>
      {filtersActive && !filtersVisible && <p className="active-filters">Showing filtered games <Button size="sm" variant="ghost" onPress={() => { setQuery(''); setResult('all'); setTimeClass('all') }}>Clear filters</Button></p>}
      {filtered.length === 0 ? <div className="game-list__empty"><p>{games.length ? 'No games match these filters.' : 'No completed standard games in the months loaded so far.'}</p>{filtersActive && <Button size="sm" variant="tertiary" onPress={() => { setQuery(''); setResult('all'); setTimeClass('all') }}>Clear filters</Button>}</div> : <div className="game-list__groups">
        {groups.map(({ label, entries }) => {
          const wins = entries.filter(game => outcomeFor(game, username) === 'win').length
          const draws = entries.filter(game => outcomeFor(game, username) === 'draw').length
          return <section className="game-day" key={label}>
            <header className="game-day__heading"><h3>{label}</h3><span className="day-record tabular"><span>{wins}W</span><span>{entries.length - wins - draws}L</span><span>{draws}D</span></span></header>
            <ListBox aria-label={`${label} games for ${username}`} className="game-list__items" selectionMode="single" disallowEmptySelection selectedKeys={selectedId ? [selectedId] : []} onAction={id => { const game = entries.find(item => item.id === id); if (game) onSelect(game) }} items={entries} dependencies={[reviewedIds, username, reviews]}>
              {game => <GameRow game={game} username={username} reviewed={reviewedIds.has(game.id)} review={reviews.get(game.id)} />}
            </ListBox>
          </section>
        })}
      </div>}
    </div>
  )
}

function GameRow({ game, username, reviewed, review }: { game: ImportedGame; username: string; reviewed: boolean; review?: GameReview }) {
  const side = playerSide(game, username)
  const opponent = game[side === 'white' ? 'black' : 'white']
  const outcome = outcomeFor(game, username)
  const text = `${OUTCOME_LABEL[outcome]} as ${side} against ${opponent.username}, ${gameDate(game.endTime)}`
  const score = review?.pgn === game.pgn ? review[side].accuracy : null
  const moveCount = game.pgn.replace(/\{[^}]*\}/g, '').replace(/\[[^\]]*\]/g, '').match(/\b\d+\.(?!\.)/g)?.length ?? 0
  return (
    <ListBox.Item id={game.id} textValue={text} aria-label={`${text}${reviewed ? ', reviewed' : ''}`} className={`game-row is-${outcome}`}>
      <span className="opponent-avatar" aria-hidden="true">{opponent.username[0].toUpperCase()}</span>
      <span className="game-row__main">
        <span className="game-row__title"><span className="game-row__opponent">{opponent.username}</span>{opponent.rating !== null && <span className="game-row__rating tabular">{opponent.rating}</span>}</span>
        <span className="game-row__meta"><span className={`side-dot is-${side}`} aria-hidden="true" /><Clock3 size={12} aria-hidden="true" /><span className="game-row__time">{timeControlLabel(game)}</span><span className="meta-dot">·</span><span className="game-row__opening">{game.opening ?? 'Unknown opening'}</span>{moveCount > 0 && <span className="game-row__moves">· {moveCount} moves</span>}</span>
      </span>
      <span className="game-row__review"><span className={`game-row__action ${reviewed ? 'is-reviewed' : ''}`}>{score !== null && score !== undefined ? <>{score.toFixed(1)} <Check size={14} /></> : reviewed ? <><Check size={14} /> Reviewed</> : <>Analyse <ArrowUpRight size={14} /></>}</span></span>
    </ListBox.Item>
  )
}
