import { Button, ProgressBar } from '@heroui/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GameReview, PositionEvaluation } from '../core'
import { PRESETS } from '../core'
import type { ReviewRun } from '../hooks/useGameReview'
import { GRADES, formatEval, whiteChance } from '../ui/format'

export type Landing = 'complete' | 'abort'

interface Props {
  run: ReviewRun
  /** Positions in the game, including the start. */
  total: number
  /** Set once the run ends. The graph flies home, then `onLanded` fires. */
  landing: Landing | null
  /** The finished review, drawn while landing so the hand-off is seamless. */
  review: GameReview | null
  /** Short label for a position index, such as "7… Nf6". */
  label: (index: number) => string
  /** Where the graph lives in the report panel. */
  slotRef: RefObject<HTMLElement | null>
  onCancel: () => void
  onLanded: () => void
}

const EASE = 'cubic-bezier(.22,.8,.24,1)'
/** A fast review still stays centre stage long enough to be seen. */
const MIN_STAGE_MS = 1200

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const onScreen = (rect: DOMRect | undefined): rect is DOMRect =>
  !!rect && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight
/** Transform that places an element laid out at `to` over the rectangle `from`. */
const flip = (from: DOMRect, to: DOMRect) =>
  `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`

/** Live review progress: the evaluation graph leaves the panel, draws itself centre stage, then flies back. */
export function ReviewFlight({ run, total, landing, review, label, slotRef, onCancel, onLanded }: Props) {
  const graphRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const landed = useRef(onLanded)
  const [mountedAt] = useState(() => performance.now())
  useLayoutEffect(() => {
    landed.current = onLanded
  })

  useLayoutEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    const reduce = reducedMotion()
    const from = slotRef.current?.getBoundingClientRect()
    const to = graph.getBoundingClientRect()
    const fade = { duration: reduce ? 1 : 320, easing: 'ease-out', fill: 'backwards' as const }
    const animations = [
      !reduce && onScreen(from)
        ? graph.animate([{ transform: flip(from, to) }, { transform: 'none' }], { duration: 620, easing: EASE })
        : graph.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: reduce ? 1 : 260 }),
      scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], fade),
      sheetRef.current?.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { ...fade, delay: reduce ? 0 : 260 }),
      headRef.current?.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { ...fade, delay: reduce ? 0 : 340 }),
      chromeRef.current?.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { ...fade, delay: reduce ? 0 : 340 }),
    ]
    // Measurements above must never include a previous run's transform.
    return () => animations.forEach(animation => animation?.cancel())
  }, [slotRef])

  useEffect(() => {
    if (!landing) return
    let done = false
    const finish = () => {
      if (done) return
      done = true
      landed.current()
    }
    let frame = 0
    const land = () => {
      const graph = graphRef.current
      // A hidden view has nothing to animate.
      if (!graph || graph.getClientRects().length === 0) return finish()
      for (const el of [graph, headRef.current, chromeRef.current, sheetRef.current, scrimRef.current]) {
        for (const animation of el?.getAnimations() ?? []) animation.finish()
      }
      const reduce = reducedMotion()
      const slot = slotRef.current?.getBoundingClientRect()
      const fade = { duration: reduce ? 1 : 220, easing: 'ease-in', fill: 'forwards' as const }
      headRef.current?.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], fade)
      chromeRef.current?.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(10px)' }], fade)
      sheetRef.current?.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.94)' }], fade)
      scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...fade, duration: reduce ? 1 : 520 })
      const flight = landing === 'complete' && !reduce && onScreen(slot)
        ? graph.animate([{ transform: 'none' }, { transform: flip(slot, graph.getBoundingClientRect()) }], { duration: 620, delay: 120, easing: EASE, fill: 'forwards' })
        : graph.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.96)' }], fade)
      flight.finished.then(finish, finish)
    }
    const hold = reducedMotion() ? 0 : Math.max(0, mountedAt + MIN_STAGE_MS - performance.now())
    // Then wait a frame so the panel has settled (it scrolls to the top for a new review).
    const timer = window.setTimeout(() => { frame = requestAnimationFrame(land) }, hold)
    // Background tabs may never run the frame or finish the animation.
    const fallback = window.setTimeout(finish, hold + 3000)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      window.clearTimeout(fallback)
    }
  }, [landing, slotRef, mountedAt])

  const final = landing === 'complete' ? review : null
  const positions = final?.positions ?? run.positions
  const latest = positions.at(-1)
  const progress = run.progress

  return (
    <div className="review-flight" data-landing={landing ?? undefined}>
      <div ref={scrimRef} className="review-flight__scrim" aria-hidden="true" />
      <section className="review-flight__stage" aria-label="Review in progress">
        <div ref={sheetRef} className="review-flight__sheet" aria-hidden="true" />
        <header ref={headRef} className="review-flight__head">
          <div>
            <p className="review-flight__eyebrow">{PRESETS[run.preset].label} review</p>
            <h3 className="review-flight__title">Reading the game</h3>
          </div>
          <p className="review-flight__now tabular" aria-hidden="true">
            {latest && <span>{label(positions.length - 1)}</span>}
            {latest && <span className="eval-chip">{formatEval(latest)}</span>}
          </p>
        </header>
        <LiveGraph ref={graphRef} positions={positions} total={total} review={final} />
        <div ref={chromeRef} className="review-flight__footer">
          <ProgressBar
            aria-label="Review progress"
            value={progress?.percent ?? 0}
            isIndeterminate={progress === null}
            size="sm"
          >
            <div className="review-flight__progress-label">
              <span>{progress ? `${progress.percent}%` : 'Starting engine'}</span>
              <ProgressBar.Output className="tabular">
                {progress ? `${progress.completed} / ${progress.total} positions` : ''}
              </ProgressBar.Output>
            </div>
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
          <Button size="sm" variant="secondary" onPress={onCancel} isDisabled={landing !== null}>Cancel</Button>
        </div>
      </section>
    </div>
  )
}

function LiveGraph({ ref, positions, total, review }: {
  ref: RefObject<HTMLDivElement | null>
  positions: PositionEvaluation[]
  total: number
  review: GameReview | null
}) {
  const last = Math.max(1, total - 1)
  const x = (i: number) => (i / last) * 100
  const values = positions.map(whiteChance)
  const points = values.map((v, i) => `${x(i)},${100 - v}`).join(' ')
  const head = values.length ? x(values.length - 1) : 0
  const headValue = values.at(-1) ?? 50

  return (
    <div ref={ref} className="eval-graph review-flight__graph" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="100" className="eval-graph__black" />
        {values.length > 0 && <polygon points={`0,100 ${points} ${head},100`} className="eval-graph__white" />}
        <line x1="0" x2="100" y1="50" y2="50" className="eval-graph__mid" vectorEffect="non-scaling-stroke" />
        {values.length > 1 && <polyline points={points} className="review-flight__trace" vectorEffect="non-scaling-stroke" />}
      </svg>
      {review?.moves.map(m => (m.grade === 'blunder' || m.grade === 'best') && (
        <span
          key={m.ply}
          className="eval-graph__dot review-flight__dot"
          style={{ left: `${x(m.ply)}%`, top: `${100 - values[m.ply]}%`, background: GRADES[m.grade].tone }}
        />
      ))}
      <div className="review-flight__veil" style={{ left: `${head}%` }}>
        <span className="review-flight__head-dot" style={{ top: `${100 - headValue}%` }} />
      </div>
    </div>
  )
}
