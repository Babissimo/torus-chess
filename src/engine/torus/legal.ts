import type { Color, Key, Pieces, Role } from 'chessground/types'
import { opposite } from 'chessground/util'
import { read, write } from 'chessground/fen'
import type { FEN } from 'chessground/types'
import type { CastlingRights } from './castlingTypes'
import {
  findKingKey,
  legalCastlingDests,
  updateCastlingRights,
} from './castling'
import {
  applyTorusMove,
  isPawnPromotionSquare,
  isSquareAttacked,
  pseudoLegalDests,
  pseudoLegalDestsForSquare,
} from './pseudoLegal'

const PROMOTION_ROLES: Role[] = ['queen', 'rook', 'bishop', 'knight']

export { isSquareAttacked } from './pseudoLegal'

export function inCheck(pieces: Pieces, side: Color): boolean {
  const king = findKingKey(pieces, side)
  if (!king) return false
  return isSquareAttacked(pieces, king, opposite(side))
}

/** Pseudo-legal + castling king destinations, filtered for leaving king in check. */
export function legalDests(
  pieces: Pieces,
  side: Color,
  rights: CastlingRights,
): Map<Key, Key[]> {
  const pseudo = pseudoLegalDests(pieces, side)
  const kingKey = findKingKey(pieces, side)
  if (kingKey) {
    const castle = legalCastlingDests(
      pieces,
      side,
      rights,
      isSquareAttacked,
      inCheck(pieces, side),
    )
    if (castle.length) {
      const cur = pseudo.get(kingKey) ?? []
      pseudo.set(kingKey, [...new Set([...cur, ...castle])])
    }
  }

  const legal = new Map<Key, Key[]>()
  for (const [from, tos] of pseudo) {
    const ok: Key[] = []
    for (const to of tos) {
      const promotion = isPawnPromotionSquare(pieces, from, to, side)
      if (promotion) {
        let anyLegal = false
        for (const pr of PROMOTION_ROLES) {
          const after = applyTorusMove(pieces, from, to, pr)
          if (!inCheck(after, side)) {
            anyLegal = true
            break
          }
        }
        if (anyLegal) ok.push(to)
      } else {
        const after = applyTorusMove(pieces, from, to)
        if (!inCheck(after, side)) ok.push(to)
      }
    }
    if (ok.length) legal.set(from, ok)
  }
  return legal
}

export function legalDestsFromFen(
  fen: FEN,
  side: Color,
  rights: CastlingRights,
): Map<Key, Key[]> {
  return legalDests(read(fen), side, rights)
}

/** Apply a legal move; returns new FEN and updated castling rights. */
export function tryApplyLegalMove(
  fen: FEN,
  side: Color,
  orig: Key,
  dest: Key,
  rights: CastlingRights,
  promoteTo: Role = 'queen',
): { fen: FEN; pieces: Pieces; rights: CastlingRights } | null {
  const pieces = read(fen)
  const piece = pieces.get(orig)
  if (!piece || piece.color !== side) return null

  let tos = pseudoLegalDestsForSquare(pieces, orig, piece)
  if (piece.role === 'king') {
    const castle = legalCastlingDests(
      pieces,
      side,
      rights,
      isSquareAttacked,
      inCheck(pieces, side),
    )
    if (castle.length) {
      const merged = new Set<Key>(tos)
      for (const c of castle) merged.add(c)
      tos = [...merged]
    }
  }
  if (!tos.includes(dest)) return null

  const promotion = isPawnPromotionSquare(pieces, orig, dest, side)
  const next = promotion
    ? applyTorusMove(pieces, orig, dest, promoteTo)
    : applyTorusMove(pieces, orig, dest)
  if (inCheck(next, side)) return null
  const newRights = updateCastlingRights(rights, orig, dest, pieces, piece)
  return { fen: write(next), pieces: next, rights: newRights }
}
