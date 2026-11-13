# UI integration contract

Import from `src/core/index.ts`. The core has no React dependency. All request and engine operations reject on failure. Catch errors at the UI boundary, preserve entered data, and offer a retry.

## Imports

- `normaliseUsername(input)` trims and lowercases a public Chess.com username, or throws an actionable validation error.
- `importRecentGames(username, { signal })` fetches the archive index then loads months serially, newest first, until at least 20 games or three months have been loaded. Returns `{ username, games, remainingArchives }`. The whole loaded month is retained so games are never lost between pages.
- `fetchArchiveBatch(username, remainingArchives, { signal })` loads the next batch of older months with the same contract.
- `mergeGames(existing, incoming)` deduplicates by URL and sorts newest first.
- `loadGames(username)`, `saveGames(games)`, `loadLastUsername()`, `saveLastUsername(username)` provide IndexedDB persistence. A storage failure must not prevent using in-memory imports.

`endTime` is a Unix timestamp in seconds. Results are stored per player, for example `win`, `resigned`, `checkmated`, `agreed`, `stalemate`. Only standard chess with usable PGN is imported. All source games are public completed games. The source URL on each game is validated and safe to use in a link.

## Analysis and board state

- `parseGame(game.pgn)` returns `{ initialFen, headers, plies }`. Each ply has `san`, `uci`, `side`, `before`, `after`, `legalMoves`, optional PGN `clock`, and a 1-based `ply` number.
- Board index 0 is the starting position. Index N is the position after half-move N. This matches `review.positions[N]`. A reviewed move is `review.moves[N - 1]`.
- `analyseGame(game, { preset, signal, onProgress })` runs the actual locally shipped Stockfish worker. Presets are `quick`, `standard`, `deep`. Progress is `{ completed, total, percent }`.
- `GameReview` contains every evaluated position, reviewed moves, both player summaries, and up to five critical half-moves. All scores are from White's perspective. `centipawns / 100` is the score in pawns. `mate` is signed: positive means White has forced mate, negative means Black. Final checkmates have `mate` +/-1 with no best move.
- Each reviewed move has `grade`, `accuracy`, loss values, `bestMove` in UCI, `bestSan`, and a SAN `bestLine`. The preferred line starts at that move's `before` position, not its `after` position.
- `analysePosition(fen, { preset, multiPv: 3, signal })` analyses a position on demand. It returns up to three engine lines; `lineToSan(fen, line.moves)` converts each to SAN. This creates a separate worker and should be debounced and cancelled when leaving the position. Whole-game analysis takes priority over exploratory analysis.
- `sideForUsername(game, username)` returns the importing player's board orientation.
- `uciToSan(fen, uci)` is available for displaying recommendations. Use chess.js directly to explore legal variations and maintain a separate variation history. Support returning to the actual game.

## Persistence and races

- `saveReview(review)` writes a completed review. Do not save partial analysis.
- `loadReview(game)` returns only a compatible review for the exact game ID, PGN and engine, or null.
- `loadReviewedIds()` helps mark saved games. A review must still be loaded with `loadReview` before use.
- `clearLocalData()` removes saved games, reviews and remembered username. Only invoke this via an explicit user action.
- Use AbortController plus request/run identity checks. When changing username, game or starting a new run, cancel superseded work. Late import, storage reads, position analysis and progress callbacks must not update the newly selected game/player.
- Cancelling a rerun must retain an earlier completed review. The page must remain usable after failure or cancellation.
- Browser storage can be unavailable. Keep the app usable in memory and show a concise persistence notice if needed.

## Scoring

The move-accuracy equations come from https://lichess.org/page/accuracy. Game accuracy is our arithmetic mean of move accuracy. It is neither Chess.com's proprietary score nor Lichess's volatility-weighted game score. Grades use Chess.com's published expected-points bands on the Lichess winning-chance scale (`GRADE_THRESHOLDS`). A leading run of moves into positions from the bundled Lichess opening catalogue is graded `book` and not judged, unless a move loses 10% or more. `analyseGame` loads the book lazily via `loadOpeningBook()`; `buildReview` takes it as an optional argument. `REVIEW_VERSION` is 2; `loadReview` regrades version-1 reviews from their stored positions without re-running the engine. We do not invent a brilliant-move detector or a performance rating. Explain this briefly where users inspect accuracy details, without filling the normal review flow with implementation text.

## Validation

`npm run check` runs strict type checking, unit tests, a production build, and Playwright tests. `tests/browser/engine.spec.ts` uses the real WASM worker. Add UI browser tests with deterministic mocked Chess.com responses; state that these imports are mocked. Check desktop and narrow mobile screenshots, keyboard controls, empty/error/loading states, import failures, engine cancellation and reload persistence.
