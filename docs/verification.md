# Verification, 10 November 2026

## Automated checks

`npm run check` passed on Windows with Node.js 26.7 and npm 11.13:

- Strict TypeScript checking.
- 23 unit tests across five files.
- Production build, including the locally copied Stockfish engine and licence files.
- 10 Playwright Chromium tests, including the actual WebAssembly worker, full UI review flow, persistence, cancellation, stale requests, error handling, unavailable storage and desktop/mobile overflow.

UI integration tests mock Chess.com's public responses with synthetic games. The chess engine in those tests is real. Test-generated screenshots are local verification artifacts, not production game data.

## Live import and production smoke check

A separate fresh Chromium session ran the built `dist/` app through Vite's production preview on a temporary local port. No API mocks or application servers were used.

1. Entered the public Chess.com username `erik` and pressed Import.
2. Imported 22 completed standard-chess games from the November and October 2026 monthly archives.
3. Selected the newest game and completed a Quick review with the shipped Stockfish WebAssembly worker. Both players' accuracy and move grades were rendered.
4. Reloaded, selected the game again and confirmed the saved review returned without additional Chess.com requests.
5. Observed no uncaught application exceptions. The temporary production preview process was stopped after the check.

The archive-index request and both monthly requests returned HTTP 200. This verifies one live public account and game at the time of the check, not every possible Chess.com response or browser.

Local evidence, ignored by Git:

- `.artifacts/live-smoke.json`
- `.artifacts/screens/live-erik-review.png`
- `.artifacts/screens/final-1440-review.png`
- `.artifacts/screens/final-390-review.png`

The Opus UI delegate also inspected 1200px and 1024px layouts, the mobile games and variation views, loading, errors and About states.

## Known limits

- Explored pawn promotions select a queen automatically.
- Reviews use time-bounded Stockfish Lite searches. Scores and achieved depths can vary between runs and devices.
- Vite emits a chunk-size advisory for the current 693 KB JavaScript bundle. The full HeroUI stylesheet is about 484 KB before compression. Code splitting is a future optimisation.
- There is no remote repository, deployed site or cross-device data sync configured.
