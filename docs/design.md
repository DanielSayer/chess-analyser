# Interface notes

Layout updated 11 November 2026 from the user's Chessigma screenshots; visual identity reworked 12 November 2026 so it no longer reads as Chessigma. The app has two distinct screens: a centred game library and a board-focused review. Design work is implemented directly, without delegates.

## Layout

- The navigation rail is a numbered contents list (01 Your games, 02 Game review) with the theme switch and About at the foot. It is 228px wide on large screens, 204px at smaller desktop widths, and collapses to icons below 1150px.
- The library is a centred column, up to 760px wide, under a ruled masthead. It contains the player line with a W/L/½ form guide, three pill actions and a ledger of games grouped by day. Import and filters expand in place. There is no decorative empty chessboard.
- Games show a W/L/½ result tile, opponent, rating, opening in serif italic, colour, time control and move count. The Review action opens the review. Day headings are italic with a rule and a +/−/= record.
- The review uses a large board on the left and a report on the right. The report contains its evaluation graph, Summary and Moves tabs, player comparison, critical moments and review controls. No game-list sidebar competes with the board.
- Board size follows the available width and viewport height. The report is 370px wide, narrowing to 330px and 310px on smaller desktops. Below 980px it sits underneath the board.
- Below 700px navigation becomes a compact top bar. Library rows, import controls and the board fit a narrow screen without horizontal scrolling.

## Visual language

The concept is an annotated scoresheet: printed paper, ink and a red pen.

- Two themes share one identity. Paper (light, default) and Ink (dark) follow the system setting until the user picks one; the choice is stored in this browser only.
- Type: Fraunces for headlines, names and big numbers; Instrument Sans for interface text; JetBrains Mono for notation, clocks, ratings and captions. All three are bundled, so no font requests leave the app.
- Accent is a vermilion "red pen", used for primary actions, current navigation, selections, the best-move arrow and the evaluation cursor. Results use green, claret and stone and always carry a letter.
- The brand mark is the "!?" annotation glyph. It also appears on the welcome screen and the report heading.
- The board is cream and teal inside a book-diagram frame (heavy rule, gap, board). Last-move and selection tints are opaque per square colour so they stay warm on teal. Pieces are react-chessboard's standard set.
- Player clocks look like a chess clock: the side to move is lit. The report uses underlined tabs, a ruled scoresheet move grid and a margin-note style for the selected move or explored line.
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
