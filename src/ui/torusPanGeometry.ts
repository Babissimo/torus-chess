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
 * Wrap pan.x so CSS total X translate stays near one torus period. `FIXED_X_TRANSLATE_CELLS` is
 * the sum of the base centering term and `--initial-pan-x` (see App.css).
 */
export function modPanXForTorus(panX: number, wrapX: number): number {
  const cellPx = wrapX / 8
  const biasPx = FIXED_X_TRANSLATE_CELLS * cellPx
  const loPx = (VIEWPORT_CELLS - TILES_PER_SIDE) * cellPx
  const hiPx = FIXED_X_TRANSLATE_CELLS * cellPx
  const centerPx = (loPx + hiPx) / 2
  const totalPx = biasPx + panX
  const wrapped = modCentered(totalPx - centerPx, wrapX) + centerPx
  return wrapped - biasPx
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
