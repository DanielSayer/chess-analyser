# Interface notes

The app is one workspace with the board in the middle. There is no landing page. The first screen is the import form and an empty board.

## Layout

- Wide screens use three columns. Games sit on the left (320px), the board column fills the middle, and the review panel (360px) sits on the right.
- From 1180px to 1280px the review panel narrows to 320px. Below 1180px it moves under the board.
- Below 860px the app shows one view at a time. Picking a game switches to the board, and a "Games" button goes back.
- Board size follows the viewport height (`--board-col` in `App.css`), so the replay controls stay visible on a 900px-tall screen.

## Visual language

- Dark green-grey surfaces (`#0e1210` to `#222a25`) and one accent green (`#5fd08a`). The theme overrides HeroUI's dark tokens in `src/index.css`, so HeroUI components pick up the palette.
- Board squares are a muted sage pair (`--board-light`, `--board-dark`). Pieces are react-chessboard's default set. No Chess.com or Chessigma artwork, icons or sounds are used.
- Grade colours run green to red (`--grade-*`). Badges use plain glyphs (★ ✓ • ?! ? ?? →) so they read without colour.
- Section labels are small uppercase captions. Numbers use tabular figures.

## Components

HeroUI v3 supplies the TextField, Button, ButtonGroup, ToggleButton(Group), SearchField, Select, ListBox, Tabs, ProgressBar, Alert, Spinner, Skeleton, Popover, Modal, AlertDialog, Link and Kbd. The board, evaluation bar and graph are custom because HeroUI has nothing equivalent.

## Behaviour worth knowing

- Keyboard replay (← → Home End F Esc) ignores text fields, sliders, tabs, radio groups and open dialogs. Left and Right still work while a row in the games list has focus, because that list only uses Up and Down.
- Dragging or clicking a piece starts an explored line. Engine lines for that position come from one `analysePosition` call at a time. Each new position aborts the last search, which terminates its worker. Explored-line analysis pauses while a full review runs.
- "Show line" opens the engine's preferred line from before the selected move. "Back to game" returns to the move you were inspecting.
- Accuracy is explained in a popover next to the accuracy heading and in the About dialog. The normal flow does not show implementation details.
- Completed reviews are also kept in memory for the session. If browser storage fails, switching games does not lose them.

## Tests

`tests/browser/ui.spec.ts` uses mocked Chess.com responses from `tests/fixtures/ui-games.ts`. Those games are synthetic. Analysis in those tests uses the real Stockfish worker. Screenshots go to `.artifacts/screens/`, which Git ignores.
