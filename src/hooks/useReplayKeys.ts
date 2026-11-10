import { useEffect, useRef } from 'react'

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

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null
}

export function useReplayKeys(handlers: ReplayKeyHandlers, enabled = true) {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return
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
