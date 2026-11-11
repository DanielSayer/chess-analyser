# Interface notes

Updated 11 November 2026 from the user's supplied Chessigma screenshots. The app has two distinct screens: a centred game library and a board-focused review. Design work is implemented directly, without delegates.

## Layout

- The navigation rail holds Your games, Game review and About. It is 216px wide on large screens, 190px at smaller desktop widths, and collapses to icons below 1150px.
- The library is a centred column, up to 720px wide. It contains the player card, recent-result strip, three main actions and date-grouped games. Import and filters expand in place. There is no decorative empty chessboard.
- Games show an opponent initial, rating, colour played, time control, opening and move count. The result is a coloured edge. The Analyse action opens the review. Dates and daily result counts belong to each group.
- The review uses a large board on the left and a report on the right. The report contains its evaluation graph, Summary and Moves tabs, player comparison, critical moments and review controls. No game-list sidebar competes with the board.
- Board size follows the available width and viewport height. The report is 370px wide, narrowing to 330px and 310px on smaller desktops. Below 980px it sits underneath the board.
- Below 700px navigation becomes a compact top bar. Library rows, import controls and the board fit a narrow screen without horizontal scrolling.

## Visual language

- Neutral charcoal surfaces replace the old green-grey palette. Primary actions and selected navigation use a warm yellow accent with a short bottom shadow.
- The board uses pale grey and slate squares. Pieces are react-chessboard's standard set. Branding is a simple original rook mark.
- Green, red and grey distinguish game results. Move-grade badges keep their distinct colours and text labels.
- HeroUI supplies accessible form controls, buttons, tabs, dialogs, progress and listbox interactions. Application CSS controls the overall layout and hierarchy.
- The reference's coaching, pricing, account and unrelated training sections are outside this app's scope.

## Behaviour

- Returning to the library keeps the selected game and completed review in memory. Game review reopens the same position. Opening another game cancels the previous game's active review.
- Replay shortcuts only run while the review screen is active, and ignore text fields and other widgets that own those keys. Hidden reviews cannot intercept keys on the library page.
- Finishing or loading a review scrolls its report to the top so the new results are visible.
- Trying a move starts an explored line. Changing that position cancels the old position search. Exploration pauses while a full game review runs or the review screen is hidden.
- Changing the player resets game filters. Browser-storage failures still fall back to the session's in-memory reviews.

## Verification

The browser suite covers the full mocked import and real-engine review flow, returning to the library and review, reload persistence, import errors, older months, stale imports, cancelled reviews and unavailable storage. Layout screenshots are captured at 1910, 1440, 1024 and 390 pixels. Test imports are synthetic; the Stockfish worker is real.

A separate live check uses the public Chess.com username supplied in the user's screenshots. Screenshots and the API responses' status summary are saved under ignored `.artifacts/`.
