import { useEffect, useLayoutEffect, useRef } from 'react'

export interface ReplayKeyHandlers {
  prev: () => void
  next: () => void
  start: () => void
  end: () => void
  flip: () => void
  escape: () => void
}

// Widgets that own arrow keys or text entry. Replay shortcuts stay out of their way.
const INTERACTIVE = [
  'input', 'textarea', 'select', '[contenteditable=""]', '[contenteditable="true"]',
  '[role="listbox"]', '[role="option"]', '[role="combobox"]', '[role="slider"]', '[role="tablist"]',
  '[role="tab"]', '[role="radiogroup"]', '[role="radio"]', '[role="menu"]', '[role="dialog"]', '[role="grid"]',
].join(',')

/** True when the focused element uses this key itself. */
export function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return false
  const owner = target.closest(INTERACTIVE)
  if (!owner) return false
  // A vertical list only uses Up/Down, so Left/Right can still step through
  // moves while a game in the list keeps focus.
  const verticalList = owner.matches('[role="option"]') && owner.closest('[role="listbox"]:not([aria-orientation="horizontal"])') !== null
  return !(verticalList && (key === 'ArrowLeft' || key === 'ArrowRight'))
}

export function useReplayKeys(handlers: ReplayKeyHandlers, enabled = true) {
  const ref = useRef(handlers)
  useLayoutEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || ownsKey(event.target, event.key)) return
      // A modal dialog anywhere on the page owns the keyboard.
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return
      const actions: Record<string, (() => void) | undefined> = {
        ArrowLeft: ref.current.prev,
        ArrowRight: ref.current.next,
        Home: ref.current.start,
        End: ref.current.end,
        f: ref.current.flip,
        F: ref.current.flip,
        Escape: ref.current.escape,
      }
      const action = actions[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
