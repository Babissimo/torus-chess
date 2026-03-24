import type { Pos } from 'chessground/types'
import { key2pos, pos2key } from 'chessground/util'

export function wrap8(n: number): number {
  return ((n % 8) + 8) % 8
}

/** Torus add: file and rank wrap mod 8. */
export function addPos(a: Pos, d: [number, number]): Pos {
  return [wrap8(a[0] + d[0]), wrap8(a[1] + d[1])]
}

export { key2pos, pos2key }

/** Pawn push direction in rank index: both colors advance toward +rank (torus rule). */
export function pawnPushDelta(): [number, number] {
  return [0, 1]
}

export function whitePawnStartRank(): number {
  return 1
}

/** Black pawns start on chess rank 6 → index 5. */
export function blackPawnStartRank(): number {
  return 5
}
