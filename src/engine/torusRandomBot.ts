import { read } from 'chessground/fen'
import type { Color, Key, Role } from 'chessground/types'
import {
  applyTorusMove,
  inCheck,
  isPawnPromotionSquare,
  legalDestsFromFen,
} from './torus'
import type { CastlingRights } from './torus/castlingTypes'

const PROMO_ROLES: Role[] = ['knight', 'bishop', 'rook', 'queen']

export function pickRandomLegalMove(
  fen: string,
  turnColor: Color,
  castling: CastlingRights,
): { orig: Key; dest: Key; promoteTo: Role } | null {
  const pieces = read(fen)
  const dests = legalDestsFromFen(fen, turnColor, castling)
  let n = 0
  let pick: { orig: Key; dest: Key; promoteTo: Role } | null = null
  for (const [orig, ds] of dests) {
    for (const dest of ds) {
      if (isPawnPromotionSquare(pieces, orig, dest, turnColor)) {
        for (const pr of PROMO_ROLES) {
          const after = applyTorusMove(pieces, orig, dest, pr)
          if (!inCheck(after, turnColor)) {
            n += 1
            if (Math.random() < 1 / n) pick = { orig, dest, promoteTo: pr }
          }
        }
      } else {
        n += 1
        if (Math.random() < 1 / n) pick = { orig, dest, promoteTo: 'queen' }
      }
    }
  }
  return pick
}
