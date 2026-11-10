import { Chess } from 'chess.js'
import type { AnalysisPreset, EngineLine, OperationOptions, PositionEvaluation } from './types'

export const ENGINE_NAME = 'Stockfish 19 Lite'
export const PRESETS: Record<AnalysisPreset, { depth: number; moveTime: number; label: string }> = {
  quick: { depth: 10, moveTime: 150, label: 'Quick' },
  standard: { depth: 14, moveTime: 500, label: 'Standard' },
  deep: { depth: 18, moveTime: 1500, label: 'Deep' },
}

export interface EngineWorker {
  postMessage(message: string): void
  terminate(): void
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

/** UCI evaluations are relative to side-to-move; normalise them exactly once. */
export function parseUciInfo(text: string, fen: string): { multipv: number; line: EngineLine } | null {
  const score = /\bscore (cp|mate) (-?\d+)/.exec(text)
  const depth = /\bdepth (\d+)/.exec(text)
  const pv = /\bpv (.+)$/.exec(text)
  if (!score || !depth || !pv || /\b(lowerbound|upperbound)\b/.test(text)) return null
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1
  const value = Number(score[2]) * sign
  const mate = score[1] === 'mate' ? value : null
  return {
    multipv: Number(/\bmultipv (\d+)/.exec(text)?.[1] ?? 1),
    line: {
      centipawns: mate === null ? value : Math.sign(value) * 100_000,
      mate,
      depth: Number(depth[1]),
      moves: pv[1].trim().split(/\s+/).filter(move => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)),
    },
  }
}

export function terminalEvaluation(fen: string): PositionEvaluation | null {
  const chess = new Chess(fen)
  if (!chess.isCheckmate() && !chess.isDraw()) return null
  const losingWhite = chess.turn() === 'w'
  const mate = chess.isCheckmate() ? (losingWhite ? -1 : 1) : null
  return { fen, centipawns: mate ? Math.sign(mate) * 100_000 : 0, mate, depth: 0, moves: [], lines: [], bestMove: null }
}

export class StockfishEngine {
  private worker: EngineWorker | null = null
  private ready: Promise<void> | null = null
  private busy = false
  private disposed = false
  private rejectPending: ((reason: Error) => void) | null = null
  private readonly factory: () => EngineWorker

  constructor(factory?: () => EngineWorker) {
    this.factory = factory ?? (() => new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`) as EngineWorker)
  }

  private waitFor(
    send: () => void,
    onLine: (line: string) => boolean,
    signal?: AbortSignal,
    timeout = 30_000,
  ): Promise<void> {
    const worker = this.worker!
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        worker.removeEventListener('message', message)
        worker.removeEventListener('error', failed)
        signal?.removeEventListener('abort', aborted)
        this.rejectPending = null
        if (error) reject(error)
        else resolve()
      }
      const message = ((event: MessageEvent) => {
        for (const line of String(event.data).split('\n')) if (onLine(line.trim())) { finish(); break }
      }) as EventListener
      const failed = (() => finish(new Error('Stockfish could not start. Reload the page and try again.'))) as EventListener
      const aborted = () => finish(new DOMException('Analysis cancelled', 'AbortError'))
      const timer = setTimeout(() => finish(new Error('Stockfish took too long to respond. Try a faster analysis setting.')), timeout)
      this.rejectPending = error => finish(error)
      worker.addEventListener('message', message)
      worker.addEventListener('error', failed)
      signal?.addEventListener('abort', aborted, { once: true })
      if (signal?.aborted) { aborted(); return }
      try { send() } catch { failed(new Event('error')) }
    })
  }

  async initialise(signal?: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error('This analysis engine has been closed.')
    signal?.throwIfAborted()
    if (!this.ready) {
      this.worker = this.factory()
      this.ready = (async () => {
        await this.waitFor(() => this.worker!.postMessage('uci'), line => line === 'uciok', signal)
        await this.waitFor(() => {
          this.worker!.postMessage('setoption name Hash value 32')
          this.worker!.postMessage('isready')
        }, line => line === 'readyok', signal)
      })()
    }
    await this.ready
  }

  async evaluate(
    fen: string,
    options: OperationOptions & { preset?: AnalysisPreset; multiPv?: number } = {},
  ): Promise<PositionEvaluation> {
    options.signal?.throwIfAborted()
    if (this.disposed) throw new Error('This analysis engine has been closed.')
    if (this.busy) throw new Error('Wait for the current position to finish analysing.')
    const terminal = terminalEvaluation(fen)
    if (terminal) return terminal
    this.busy = true
    try {
      await this.initialise(options.signal)
      const settings = PRESETS[options.preset ?? 'standard']
      const lines = new Map<number, EngineLine>()
      let bestMove: string | null = null
      await this.waitFor(() => {
        this.worker!.postMessage(`setoption name MultiPV value ${Math.max(1, Math.min(3, options.multiPv ?? 1))}`)
        this.worker!.postMessage(`position fen ${fen}`)
        this.worker!.postMessage(`go depth ${settings.depth} movetime ${settings.moveTime}`)
      }, text => {
        const info = parseUciInfo(text, fen)
        if (info) lines.set(info.multipv, info.line)
        if (text.startsWith('bestmove ')) {
          const move = text.split(' ')[1]
          bestMove = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) ? move : null
          return true
        }
        return false
      }, options.signal, settings.moveTime + 15_000)
      const primary = lines.get(1)
      if (!primary) throw new Error('Stockfish returned no evaluation for this position.')
      return { ...primary, fen, bestMove, lines: [...lines.entries()].sort(([a], [b]) => a - b).map(([, line]) => line) }
    } catch (error) {
      this.dispose()
      throw error
    } finally {
      this.busy = false
    }
  }

  dispose(): void {
    this.disposed = true
    this.rejectPending?.(new DOMException('Analysis cancelled', 'AbortError'))
    this.worker?.terminate()
    this.worker = null
  }
}

export async function analysePosition(
  fen: string,
  options: OperationOptions & { preset?: AnalysisPreset; multiPv?: number } = {},
): Promise<PositionEvaluation> {
  const engine = new StockfishEngine()
  try { return await engine.evaluate(fen, options) } finally { engine.dispose() }
}
