import type { Key } from 'chessground/types'

export const BOARD_OFFSETS = [-1, 0] as const
export type BoardOffset = (typeof BOARD_OFFSETS)[number]

export type BoardCoords = { dx: number; dy: number }

export const mod = (n: number, m: number): number => ((n % m) + m) % m

/**
 * Canonical square for a click/drag. All boards share one orientation: visual id = canonical id.
 * (Torus wrap is enforced in the rules engine later, not by shifting FEN per window.)
 */
export function canonicalKeyAt(visualKey: Key): Key {
  return visualKey
}

/** Same square label on every mini-board. */
export function visualKeyForCanonicalOnBoard(canonicalKey: Key): Key {
  return canonicalKey
}

export type VisualProjection = BoardCoords & { key: Key }

/** All mini-boards: same canonical square appears at the same visual key on each. */
export function visualProjectionsForCanonical(canonicalKey: Key): VisualProjection[] {
  const out: VisualProjection[] = []
  for (const dy of BOARD_OFFSETS) {
    for (const dx of BOARD_OFFSETS) {
      out.push({ dx, dy, key: canonicalKey })
    }
  }
  return out
}

export function boardIndexFromCoords(dx: number, dy: number): number {
  return (dy + 1) * 2 + (dx + 1)
}

export function coordsFromBoardIndex(index: number): BoardCoords {
  return { dx: (index % 2) - 1, dy: Math.floor(index / 2) - 1 }
}
