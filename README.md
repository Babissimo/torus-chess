# Torus Chess

A browser chess variant on an **8×8 torus** (edges wrap in both directions), with a **custom start** (Black on ranks 5–6; pawns move toward decreasing rank, as in the in-app blurb). Built with **React**, **TypeScript**, **Vite**, **Chessground**, and a small torus rules engine (legal moves, castling state, check detection).

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/`). The app redirects into a game path under `/fen/…`.

Production build and preview (uses base path `/torus-chess/` for GitHub Pages):

```bash
npm run build
npm run preview
```

## GitHub Pages

The repo includes a workflow that builds and deploys the `dist` output. Set **Settings → Pages → Source: GitHub Actions**. The site expects to live at `https://<user>.github.io/torus-chess/` (see `vite.config.ts` `base` if your repo slug differs).

## Game URL (current encoding)

The shareable path is a single format:

`/fen/{w|b}/{KQkq or -}/{lastMove or -}/{eight rank strings}`

Example: turn, castling rights, last move (`-` if none), then eight board ranks using a FEN-like piece alphabet. Invalid paths fall back to the default start position.

## What works today

- **Torus geometry** — Wrapping moves; four repeating Chessground tiles in a panning viewport so you can scroll the torus without hitting a hard edge.
- **Rules** — Legal move generation, king-in-check filtering, castling rights in state and URL, last-move in URL.
- **Modes** — Over-the-board (URL only), correspondence (URL + `localStorage`), **vs bot** (you are White; Black plays a **uniform random legal move** after a short delay).
- **Pawn promotion** — When a pawn hits its promotion rank, a modal offers **queen, rook, bishop, knight** (not auto-queen only).
- **UI** — Dark chrome, check highlighting, multi-board selection highlight, drag-to-pan on empty squares; layout uses a square viewport with `min(100%, min(96vw, 900px))` and container-query-based cell sizing so the grid tracks the clipped board area.

## Roadmap (planned work)

Roughly in line with current priorities:

| Area | Status / intent |
|------|------------------|
| **Reactive design — fit to view & polish UI** | Layout is usable on desktop and narrow viewports, but typography, spacing, safe areas, and touch UX still need a deliberate responsive pass. |
| **Colour promotion ranks** | Engine knows promotion ranks; the board does not yet visually distinguish those squares (e.g. tint or marker). |
| **Bots** | A minimal random Black bot exists; stronger or configurable opponents are open work. |
| **Pawn promotions** | **Done** for interactive play (including underpromotion). Further work might be bot promotion policy, animation, or URL details if extended encodings are added. |
| **Alternative game encoding URLs** | Only the segmented `/fen/…` scheme exists today; shorter or alternate encodings (e.g. compressed state) are planned. |
| **Fix viewport container thing** | CSS already works around Chessground bounds vs tile size and `cqmin` vs max-width clamps; remaining edge cases (alignment, resize, very small screens) are tracked for cleanup. |
| **Undo** | Not implemented; needs a move stack (and policy for URL + bot + correspondence). |
| **Help menu** | No in-app rules or controls reference yet. |
| **Rotation?** | Board orientation is fixed to White’s view everywhere; optional flip / rotate is exploratory. |

## License

Add a `LICENSE` file when you choose one.
