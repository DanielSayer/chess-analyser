# Chess Analyser

A browser app for importing completed Chess.com games and reviewing them with local Stockfish analysis. Built with React, TypeScript, Vite and HeroUI v3. No application backend, account or API key is required.

## Run locally

Use Node.js 22.22 or later and npm. Development was verified on Windows with Node.js 26.7.

```powershell
cd C:\Users\danie\Projects\chess-analyser
npm ci
npm run dev
```

Open the local URL printed by Vite. Enter a Chess.com username, import the games, select one and press **Review game**. Quick, Standard and Deep settings trade analysis time for search depth. Completed games and reviews are saved in this browser and restored on the next visit.

The `predev` and `prebuild` scripts copy the pinned Stockfish JavaScript, WebAssembly and licence files from the installed npm package into `public/engine/`. Those generated files are ignored by Git and included in the production build. There is no runtime dependency on an engine CDN.

## What is included

- Recent public standard-chess games, with older monthly archives available on request.
- Search by opponent or opening, and filter by result or speed.
- Replay with move navigation, keyboard shortcuts, board flipping and recorded clocks where provided.
- Full-game review with per-move grades, accuracy for both players, best continuations, an evaluation graph and critical moments.
- Legal move exploration with up to three local engine lines and a return to the played game.
- Progress, cancellation, retries and completed-review preservation after failed or cancelled reruns.
- Local persistence, an in-memory fallback when browser storage is unavailable, and an explicit clear-data action.
- Responsive desktop and mobile layouts, with an About dialog for shortcuts, scoring and engine licences.

## Architecture and data

The UI calls framework-independent services in [`src/core`](src/core/index.ts). Their contract is documented in [`docs/core-services.md`](docs/core-services.md). Interface decisions are recorded in [`docs/design.md`](docs/design.md).

The app contacts only the public Chess.com API for imports:

```text
GET https://api.chess.com/pub/player/{username}/games/archives
GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}
```

Archive requests run sequentially. Import loads whole months, newest first, until it has at least 20 eligible games or has checked three months. **Load older games** continues through the remaining archive list. Monthly responses are not sliced, so games are not lost between batches. Refresh gets the recent archives again and merges them with games already loaded.

PGNs are parsed with chess.js. Stockfish 19 Lite, pinned to Stockfish.js 19.0.1, runs as an isolated single-threaded Web Worker. Every score is normalised to White's perspective. IndexedDB stores imported games, complete reviews and the last username. Cached reviews must match the exact PGN and engine before reuse. The site has no analytics or server-side storage.

## Scoring and current limits

Move accuracy uses the [published Lichess winning-chance and move-accuracy equations](https://lichess.org/page/accuracy). Game accuracy is this app's arithmetic mean of move accuracy. It is neither Chess.com's proprietary accuracy nor Lichess's weighted game-accuracy score. Move grades apply [Chess.com's published expected-points bands](https://support.chess.com/en/articles/8572705) (2 / 5 / 10 / 20% winning-chance loss for Excellent / Good / Inaccuracy / Mistake / Blunder) to the Lichess winning-chance curve, not Chess.com's rating-aware model. Opening theory from the [Lichess opening catalogue](https://github.com/lichess-org/chess-openings) (CC0, bundled) is graded Book, unless the move costs a mistake or worse (catalogued traps such as Fool's Mate). Regenerate it with `node scripts/build-openings.mjs`. There is no claimed brilliant-move detector or estimated performance rating.

Analysis speed depends on the user's device. Each preset limits both search depth and time per position, so the achieved depth can be lower than the selected target. The lite engine uses a smaller network than full Stockfish. Results can change with search settings.

- Only completed standard chess is imported. Variants, live games, PGN upload and Lichess imports are outside this version's scope.
- Explored pawn promotions currently choose a queen automatically.
- Local data belongs to this browser. There is no cross-device synchronisation. Clearing browser data removes saved reviews.
- The production bundle currently includes the full HeroUI stylesheet and emits Vite's JavaScript chunk-size advisory. No code splitting has been added yet.

## Verification

```powershell
npx playwright install chromium
npm run check
```

The check runs strict TypeScript checking, unit tests, a production build and Playwright tests. Browser tests start their own Vite server on `127.0.0.1:4178`; close an unrelated server on that port before testing.

- Unit tests cover import validation, sequential archive loading, cancellation, score perspective, terminal positions, grading, exact-PGN cache binding, persistence and formatting.
- Browser UI tests use explicitly mocked Chess.com responses with synthetic games. Review and variation analysis use the real shipped Stockfish WebAssembly engine.
- Browser tests cover import, filters, replay, review, saved restoration, errors, stale imports, cancellation, storage failure and desktop/mobile overflow.
- A separate manual browser smoke check against the production build imported a real public player, reviewed a real game with the local engine and restored the review on reload without further API requests. Its local output and screenshots are kept under ignored `.artifacts/`. See [`docs/verification.md`](docs/verification.md) for the dated results.

## Production build

```powershell
npm run build
npm run preview
```

Deploy the generated `dist/` folder to static hosting. Serve JavaScript and WebAssembly with their normal MIME types. This engine build does not require special cross-origin-isolation headers or a Node/PHP application server. No hosting service or remote repository is configured by this project.

## Engine licence

Stockfish.js is GPL-3.0. The engine is served unmodified with its licence, notice and checksums under `engine/`. Complete corresponding engine source and build scripts are available at the pinned [Stockfish.js v19.0.1 tag](https://github.com/nmrugg/stockfish.js/tree/v19.0.1). See the app's About dialog or the generated `engine/NOTICE.txt` and `engine/COPYING.txt` files.
