/**
 * Stage 2 — torus board: same material as standard chess but Black starts closer to White.
 * - White: back rank rank 1, pawns rank 2 (unchanged vs standard layout).
 * - Black: back rank rank 5, pawns rank 6.
 * Black’s forward direction is opposite to White’s (toward decreasing rank index).
 *
 * Piece placement only (chessground `read` / `write`); turn is tracked separately in UI state.
 */
export const TORUS_INITIAL_FEN =
  '8/8/pppppppp/rnbqkbnr/8/8/PPPPPPPP/RNBQKBNR'
