import { mod } from '../engine/viewMapping'
import {
  FIXED_X_TRANSLATE_CELLS,
  TILES_PER_SIDE,
  VIEWPORT_CELLS,
} from './torusGridConstants'

export function modCentered(n: number, m: number): number {
  const r = mod(n, m)
  return r >= m / 2 ? r - m : r
}

/**
 * Wrap pan.x so CSS total X translate stays near one torus period. Full translate in px is
 * `FIXED_X_TRANSLATE_CELLS * cellPx + panX` (matches App.css). Valid totals keep a 16-cell-wide
 * grid covering a 9-cell viewport: grid left edge in [−7, 0] cell widths → [−7·cellPx, 0].
 */
export function modPanXForTorus(panX: number, wrapX: number): number {
  const cellPx = wrapX / 8
  const staticTxPx = FIXED_X_TRANSLATE_CELLS * cellPx
  const minTotalPx = (VIEWPORT_CELLS - TILES_PER_SIDE) * cellPx
  const maxTotalPx = 0
  const centerPx = (minTotalPx + maxTotalPx) / 2
  const totalPx = staticTxPx + panX
  const wrapped = modCentered(totalPx - centerPx, wrapX) + centerPx
  return wrapped - staticTxPx
}

/** Layout size (subpixel) so one 8-cell wrap matches the painted CSS grid period. */
export function gridLayoutWidthPx(grid: HTMLElement): number {
  const br = grid.getBoundingClientRect().width
  return br > 0 ? br : grid.clientWidth
}

export function gridLayoutHeightPx(grid: HTMLElement): number {
  const br = grid.getBoundingClientRect().height
  return br > 0 ? br : grid.clientHeight
}
