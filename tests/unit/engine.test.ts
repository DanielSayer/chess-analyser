import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { parseUciInfo, StockfishEngine, terminalEvaluation } from '../../src/core/engine'
import type { EngineWorker } from '../../src/core/engine'

class FakeWorker extends EventTarget implements EngineWorker {
  messages: string[] = []
  terminated = false
  respond = true
  postMessage(message: string): void {
    this.messages.push(message)
    queueMicrotask(() => {
      if (this.terminated) return
      if (message === 'uci') this.emit('uciok')
      if (message === 'isready') this.emit('readyok')
      if (message.startsWith('go ') && this.respond) {
        this.emit('info depth 10 multipv 1 score cp 24 pv e2e4 e7e5')
        this.emit('bestmove e2e4 ponder e7e5')
      }
    })
  }
  emit(data: string): void { this.dispatchEvent(new MessageEvent('message', { data })) }
  terminate(): void { this.terminated = true }
}

describe('Stockfish protocol', () => {
  it('normalises Black-to-move scores and mate signs to White', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'
    expect(parseUciInfo('info depth 12 score cp 120 pv e7e5', fen)?.line.centipawns).toBe(-120)
    expect(parseUciInfo('info depth 12 score mate -3 pv e7e5', fen)?.line.mate).toBe(3)
    expect(parseUciInfo('info depth 12 score cp 120 lowerbound pv e7e5', fen)).toBeNull()
  })

  it('handles checkmate and drawn terminal positions without engine guesses', () => {
    const mate = new Chess()
    for (const move of ['f3', 'e5', 'g4', 'Qh4#']) mate.move(move)
    expect(terminalEvaluation(mate.fen())).toMatchObject({ centipawns: -100000, mate: -1, bestMove: null })
    expect(terminalEvaluation('8/8/8/8/8/1k6/8/1K6 w - - 0 1')).toMatchObject({ centipawns: 0, mate: null })
  })

  it('waits for UCI readiness and returns the finished position', async () => {
    const worker = new FakeWorker()
    const engine = new StockfishEngine(() => worker)
    const result = await engine.evaluate(new Chess().fen(), { preset: 'quick' })
    expect(worker.messages.slice(0, 3)).toEqual(['uci', 'setoption name Hash value 32', 'isready'])
    expect(result).toMatchObject({ bestMove: 'e2e4', centipawns: 24, depth: 10 })
    engine.dispose()
    expect(worker.terminated).toBe(true)
  })

  it('terminates a cancelled search so late bestmove messages cannot contaminate a retry', async () => {
    const worker = new FakeWorker()
    worker.respond = false
    const engine = new StockfishEngine(() => worker)
    await engine.initialise()
    const abort = new AbortController()
    const pending = engine.evaluate(new Chess().fen(), { signal: abort.signal })
    await Promise.resolve()
    abort.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
    worker.emit('bestmove d2d4')
    await expect(engine.evaluate(new Chess().fen())).rejects.toThrow('closed')
  })
})
