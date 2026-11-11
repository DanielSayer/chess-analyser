import { Button } from '@heroui/react'
import { BarChart3, ChevronRight, HardDrive, House } from 'lucide-react'
import { AboutDialog } from './AboutDialog'
import { Logo } from './Logo'

interface Props {
  view: 'games' | 'board'
  canReview: boolean
  hasLocalData: boolean
  onNavigate: (view: 'games' | 'board') => void
  onClear: () => Promise<string | null>
}

export function Navigation({ view, canReview, hasLocalData, onNavigate, onClear }: Props) {
  return (
    <aside className="navigation" aria-label="Main navigation">
      <a className="brand" href="#games" onClick={event => { event.preventDefault(); onNavigate('games') }}>
        <Logo /><span className="brand__name">Chess Analyser</span>
      </a>
      <nav className="navigation__links" aria-label="Workspace">
        <Button variant="secondary" className="nav-link" aria-current={view === 'games' ? 'page' : undefined} onPress={() => onNavigate('games')}>
          <House size={21} strokeWidth={1.8} /><span>Your games</span><ChevronRight size={17} className="nav-link__arrow" />
        </Button>
        <Button variant="secondary" className="nav-link" aria-current={view === 'board' ? 'page' : undefined} isDisabled={!canReview} onPress={() => onNavigate('board')}>
          <BarChart3 size={21} strokeWidth={1.8} /><span>Game review</span><ChevronRight size={17} className="nav-link__arrow" />
        </Button>
      </nav>
      <div className="navigation__bottom">
        <div className="device-note"><HardDrive size={17} /><div><strong>On your device</strong><span>Free, unlimited analysis</span></div></div>
        <AboutDialog hasLocalData={hasLocalData} onClear={onClear} />
      </div>
    </aside>
  )
}
