# Joseph’s Squares

Joseph’s Squares is a two-player pencil-and-paper style strategy game inspired by a [Nostr note from @fiatjaf](https://njump.me/nevent1qvzqqqqqqypzqwlsccluhy6xxsr6l9a9uhhxf75g85g8a709tprjcn4e42h053vaqydhwumn8ghj7un9d3shjtnhv4ehgetjde38gcewvdhk6tcprfmhxue69uhhq7tjv9kkjepwve5kzar2v9nzucm0d5hsqgppppzeg4tw3n3qgsfytvgmcj6z544z47zj03hgnf4rrrysnexdpcu9ha5l). This web version lets you experiment with different board sizes and layouts while keeping the original rules intact.

## How to Play

1. Use the toolbar to set your board:
   - **Squares**: between 2 and 6 using the +/- stepper.
   - **Layout**: keep every square in a single row or switch to a staggered grid.
   - **Mode**: toggle between Easy (auto-drawn straight lines) and Freeform (drawn by hand).
2. Player A starts by selecting any unused side of a square. Selecting a side highlights every side on other squares that can be connected without crossing existing lines.
   - In Freeform mode, drag from the starting dot to sketch any curve. Release on another dot to lock it in; releasing elsewhere cancels the line.
   - In Easy mode, simply click the highlighted target side to connect the squares.
3. Click the highlighted target side (Easy) or release on it (Freeform) to complete the connection. Each side can only be used once.
4. Players alternate turns drawing connections. Lines may not cross.
5. If the current player cannot draw a valid line, they lose.

Need a fresh start? Use **Start new game** below the board. The collapsible Rules panel keeps a quick refresher handy without crowding the play space.

## Strategy Notes

- With only two squares, the second player has a forced win once they understand the pattern.
- Larger boards introduce more complex geometry, especially when using the vertical layout. Try five or six squares in a 3+2 or 3+3 arrangement for longer games.
- No “trick” line drawings: keep lines clean and unambiguous so both players can follow the state of the board.

## Running Locally

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser (default is http://localhost:5173).
