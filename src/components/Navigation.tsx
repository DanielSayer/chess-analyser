import { Button } from '@heroui/react'
import { BarChart3, House, Moon, Sun } from 'lucide-react'
import type { Theme } from '../hooks/useTheme'
import { AboutDialog } from './AboutDialog'
import { Logo } from './Logo'

interface Props {
  view: 'games' | 'board'
  canReview: boolean
  hasLocalData: boolean
  theme: Theme
  onTheme: (theme: Theme) => void
  onNavigate: (view: 'games' | 'board') => void
  onClear: () => Promise<string | null>
}

export function Navigation({ view, canReview, hasLocalData, theme, onTheme, onNavigate, onClear }: Props) {
  const next: Theme = theme === 'paper' ? 'ink' : 'paper'
  return (
    <aside className="navigation" aria-label="Main navigation">
      <a className="brand" href="#games" onClick={event => { event.preventDefault(); onNavigate('games') }}>
        <span className="brand__mark"><Logo /></span>
        <span className="brand__text"><span className="brand__name">Chess <em>Analyser</em></span><span className="brand__tag">annotate your games</span></span>
      </a>
      <nav className="navigation__links" aria-label="Workspace">
        <Button variant="ghost" className="nav-link" aria-label="Your games" aria-current={view === 'games' ? 'page' : undefined} onPress={() => onNavigate('games')}>
          <span className="nav-link__no" aria-hidden="true">01</span><House size={19} strokeWidth={1.8} /><span>Your games</span>
        </Button>
        <Button variant="ghost" className="nav-link" aria-label="Game review" aria-current={view === 'board' ? 'page' : undefined} isDisabled={!canReview} onPress={() => onNavigate('board')}>
          <span className="nav-link__no" aria-hidden="true">02</span><BarChart3 size={19} strokeWidth={1.8} /><span>Game review</span>
        </Button>
      </nav>
      <div className="navigation__bottom">
        <div className="navigation__tools">
          <Button size="sm" variant="ghost" className="theme-toggle" aria-label={`Switch to ${next === 'ink' ? 'dark' : 'light'} theme`} onPress={() => onTheme(next)}>
            {theme === 'paper' ? <Moon size={16} /> : <Sun size={16} />}<span>{next === 'ink' ? 'Dark' : 'Light'}</span>
          </Button>
          <AboutDialog hasLocalData={hasLocalData} onClear={onClear} />
        </div>
      </div>
    </aside>
  )
}
