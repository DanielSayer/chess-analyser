import { Button, ListBox, SearchField, Select, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { CircleCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ImportedGame } from '../core'
import type { Outcome } from '../ui/format'
import { capitalise, gameDate, outcomeFor, playerSide, timeControlLabel } from '../ui/format'

interface Props {
  username: string
  games: ImportedGame[]
  selectedId: string | null
  reviewedIds: ReadonlySet<string>
  onSelect: (game: ImportedGame) => void
}

type ResultFilter = 'all' | Outcome

const OUTCOME_LETTER: Record<Outcome, string> = { win: 'W', loss: 'L', draw: 'D' }
const OUTCOME_LABEL: Record<Outcome, string> = { win: 'Won', loss: 'Lost', draw: 'Drawn' }

export function GameList({ username, games, selectedId, reviewedIds, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ResultFilter>('all')
  const [timeClass, setTimeClass] = useState('all')

  const timeClasses = useMemo(() => [...new Set(games.map(game => game.timeClass))].sort(), [games])
  const activeTimeClass = timeClass === 'all' || timeClasses.includes(timeClass) ? timeClass : 'all'

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return games.filter(game => {
      if (result !== 'all' && outcomeFor(game, username) !== result) return false
      if (activeTimeClass !== 'all' && game.timeClass !== activeTimeClass) return false
      if (!needle) return true
      const opponent = game[playerSide(game, username) === 'white' ? 'black' : 'white'].username
      return opponent.toLowerCase().includes(needle) || (game.opening ?? '').toLowerCase().includes(needle)
    })
  }, [games, username, query, result, activeTimeClass])

  const filtersActive = query.trim() !== '' || result !== 'all' || activeTimeClass !== 'all'
  const clearFilters = () => { setQuery(''); setResult('all'); setTimeClass('all') }

  return (
    <div className="game-list">
      <div className="game-list__filters">
        <div className="game-list__search-row">
          <SearchField value={query} onChange={setQuery} aria-label="Filter by opponent or opening" fullWidth>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Select
            aria-label="Time control"
            className="game-list__time"
            selectedKey={activeTimeClass}
            onSelectionChange={key => setTimeClass(String(key ?? 'all'))}
            isDisabled={timeClasses.length < 2}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="All speeds">All speeds</ListBox.Item>
                {timeClasses.map(value => (
                  <ListBox.Item key={value} id={value} textValue={capitalise(value)}>{capitalise(value)}</ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <ToggleButtonGroup
          aria-label="Result"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[result]}
          onSelectionChange={keys => setResult(([...keys][0] as ResultFilter) ?? 'all')}
          size="sm"
          fullWidth
        >
          <ToggleButton id="all">All</ToggleButton>
          <ToggleButton id="win">Won</ToggleButton>
          <ToggleButton id="loss">Lost</ToggleButton>
          <ToggleButton id="draw">Drawn</ToggleButton>
        </ToggleButtonGroup>
      </div>

      {filtered.length === 0 ? (
        <div className="game-list__empty">
          <p>No games match these filters.</p>
          {filtersActive && <Button size="sm" variant="tertiary" onPress={clearFilters}>Clear filters</Button>}
        </div>
      ) : (
        <ListBox
          aria-label={`Games for ${username}`}
          className="game-list__items"
          selectionMode="single"
          selectedKeys={selectedId ? [selectedId] : []}
          onSelectionChange={keys => {
            const id = [...keys][0]
            const game = filtered.find(g => g.id === id)
            if (game) onSelect(game)
          }}
          items={filtered}
          dependencies={[reviewedIds, username]}
        >
          {game => <GameRow game={game} username={username} reviewed={reviewedIds.has(game.id)} />}
        </ListBox>
      )}
    </div>
  )
}

function GameRow({ game, username, reviewed }: { game: ImportedGame; username: string; reviewed: boolean }) {
  const side = playerSide(game, username)
  const opponent = game[side === 'white' ? 'black' : 'white']
  const outcome = outcomeFor(game, username)
  const text = `${OUTCOME_LABEL[outcome]} as ${side} against ${opponent.username}, ${gameDate(game.endTime)}`
  return (
    <ListBox.Item id={game.id} textValue={text} aria-label={`${text}${reviewed ? ", reviewed" : ""}`} className="game-row">
      <span className={`game-row__result is-${outcome}`} aria-hidden="true">{OUTCOME_LETTER[outcome]}</span>
      <span className="game-row__main">
        <span className="game-row__title">
          <span className={`side-dot is-${side}`} aria-hidden="true" />
          <span className="game-row__opponent">{opponent.username}</span>
          {opponent.rating !== null && <span className="game-row__rating tabular">{opponent.rating}</span>}
        </span>
        <span className="game-row__meta">{game.opening ?? 'Unknown opening'}</span>
      </span>
      <span className="game-row__side">
        <span className="game-row__date tabular">{gameDate(game.endTime)}</span>
        <span className="game-row__tc">
          {reviewed && <CircleCheck size={13} className="game-row__reviewed" aria-label="Reviewed" />}
          {timeControlLabel(game)}
        </span>
      </span>
    </ListBox.Item>
  )
}
