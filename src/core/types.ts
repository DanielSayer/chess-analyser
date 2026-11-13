export type Side = 'white' | 'black'
export type AnalysisPreset = 'quick' | 'standard' | 'deep'
export type MoveGrade = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced'

export interface Player {
  username: string
  rating: number | null
  result: string
}

export interface ImportedGame {
  id: string
  url: string
  pgn: string
  white: Player
  black: Player
  endTime: number
  timeClass: string
  timeControl: string
  rated: boolean
  opening: string | null
  eco: string | null
}

export interface ImportResult {
  username: string
  games: ImportedGame[]
  remainingArchives: string[]
}

export interface ParsedPly {
  ply: number
  san: string
  uci: string
  side: Side
  before: string
  after: string
  legalMoves: number
  clock: string | null
}

export interface ParsedGame {
  initialFen: string
  plies: ParsedPly[]
  headers: Record<string, string>
}

export interface EngineLine {
  /** All scores are from White's perspective, regardless of side to move. */
  centipawns: number
  mate: number | null
  depth: number
  moves: string[]
}

export interface PositionEvaluation extends EngineLine {
  fen: string
  bestMove: string | null
  lines: EngineLine[]
}

export interface ReviewedMove extends ParsedPly {
  grade: MoveGrade
  centipawnLoss: number
  winningChanceLoss: number
  accuracy: number
  bestMove: string | null
  bestSan: string | null
  /** A legal continuation from the position BEFORE this move, in SAN. */
  bestLine: string[]
}

export interface SideSummary {
  accuracy: number | null
  averageCentipawnLoss: number | null
  counts: Record<MoveGrade, number>
  moveCount: number
}

export interface GameReview {
  version: 1
  engine: string
  gameId: string
  /** Binds cached results to exact immutable game input. */
  pgn: string
  preset: AnalysisPreset
  createdAt: string
  initialFen: string
  moves: ReviewedMove[]
  /** One entry for the start, followed by one for each played half-move. */
  positions: PositionEvaluation[]
  white: SideSummary
  black: SideSummary
  /** Half-move numbers ordered by loss of winning chances. */
  criticalPlies: number[]
  opening: string | null
  eco: string | null
}

export interface AnalysisProgress {
  completed: number
  total: number
  percent: number
  /** The evaluation just completed, in game order. Absent before the first one. */
  position?: PositionEvaluation
}

export interface OperationOptions {
  signal?: AbortSignal
}

export interface AnalyseOptions extends OperationOptions {
  preset?: AnalysisPreset
  onProgress?: (progress: AnalysisProgress) => void
}
