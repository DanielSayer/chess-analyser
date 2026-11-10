# Chess Analyser

This is a local-first React + TypeScript + Vite application. Import completed standard-chess games from Chess.com's public API and analyse them in the browser. No application backend, accounts, payments, Lichess import or AI coach is in scope.

## Working conventions

- Delegate all design and UI implementation work to Claude Opus 5.5 using the T3 delegate tool. Do not silently substitute another model.
- Prefer HeroUI v3. Take broad visual inspiration from Chessigma, without copying its code, artwork, branding or exact layout.
- Make focused conventional commits regularly. The user has authorised committing the UI as part of this task.
- Keep the core services independent of React. `src/core/index.ts` is the UI integration contract.
- Never send games or analysis to an application server. Only public Chess.com API requests are needed at runtime.
- Preserve a user's current games and completed reviews when a request fails or analysis is cancelled.
- Run `npm run check` before finishing. Verify the real browser engine and inspect desktop and mobile layouts. Label mocked API tests as mocked.
- Do not add secrets or local browser state to Git.
