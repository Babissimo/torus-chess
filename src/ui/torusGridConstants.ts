/** Matches `--tiles-per-side` on `.board-viewport` (cells per grid axis). */
export const TILES_PER_SIDE = 16
/** Matches `--squares-visible` on `.board-viewport`. */
export const VIEWPORT_CELLS = 9
/**
 * Matches `--initial-pan-x: calc(N * var(--cell))` on `.torus-four-grid` (cell count on X).
 * With base centering (VIEWPORT−TILES)/2 = −3.5, use 3.5 so net static X = 0 and the viewport
 * stays tile-filled; wrapping uses the same total in `modPanXForTorus`.
 */
export const INITIAL_PAN_X_CELLS = 3.5

export const FIXED_X_TRANSLATE_CELLS =
  (VIEWPORT_CELLS - TILES_PER_SIDE) / 2 + INITIAL_PAN_X_CELLS

/** 2×2 slots of 8×8 cells; one Chessground per logical torus board 0..3 (row-major). */
export const TORUS_SLOT_BOARD_INDEX = [0, 1, 2, 3] as const

/** Pixels before we treat pointer movement as pan (not a click). */
export const PAN_THRESHOLD_PX = 4

/** Pointer speed (px/ms) must exceed this to start coasting after release. */
export const PAN_MOMENTUM_MIN_SPEED_PX_PER_MS = 0.032
/** Coasting ends when speed drops below this (px/ms). */
export const PAN_MOMENTUM_STOP_THRESHOLD_PX_PER_MS = 0.01
/** Exponential damping rate for coasting velocity (per second); higher = quicker stop. */
export const PAN_MOMENTUM_FRICTION_K = 5.5
