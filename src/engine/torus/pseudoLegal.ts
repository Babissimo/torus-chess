import type { Color, Key, Piece, Pieces, Pos, Role } from 'chessground/types'
import { opposite } from 'chessground/util'
import { applyCastlingOnBoard, isCastlingMove } from './castling'
import {
  addPos,
  blackPawnStartRank,
  key2pos,
  pawnPushDelta,
  pos2key,
  whitePawnStartRank,
} from './coords'

const ROOK_DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const BISHOP_DIRS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]
const KING_DIRS: [number, number][] = [
  ...ROOK_DIRS,
  ...BISHOP_DIRS,
]
const KNIGHT_JUMPS: [number, number][] = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
]

function rayMoves(
  orig: Pos,
  dirs: [number, number][],
  pieces: Pieces,
  color: Color,
): Key[] {
  const out: Key[] = []
  for (const dir of dirs) {
    let cur = orig
    for (let i = 0; i < 7; i++) {
      cur = addPos(cur, dir)
      const k = pos2key(cur)
      const p = pieces.get(k)
      if (!p) {
        out.push(k)
        continue
      }
      if (p.color !== color) out.push(k)
      break
    }
  }
  return out
}

function knightMoves(orig: Pos, pieces: Pieces, color: Color): Key[] {
  const out: Key[] = []
  for (const d of KNIGHT_JUMPS) {
    const k = pos2key(addPos(orig, d))
    const p = pieces.get(k)
    if (!p || p.color !== color) out.push(k)
  }
  return out
}

function kingMoves(orig: Pos, pieces: Pieces, color: Color): Key[] {
  const out: Key[] = []
  for (const d of KING_DIRS) {
    const k = pos2key(addPos(orig, d))
    const p = pieces.get(k)
    if (!p || p.color !== color) out.push(k)
  }
  return out
}

function pawnMoves(
  orig: Pos,
  pieces: Pieces,
  color: Color,
): Key[] {
  const out: Key[] = []
  const [df, dr] = pawnPushDelta()
  const one = addPos(orig, [df, dr])
  const k1 = pos2key(one)
  if (!pieces.get(k1)) {
    out.push(k1)
    const startRank = color === 'white' ? whitePawnStartRank() : blackPawnStartRank()
    if (orig[1] === startRank) {
      const two = addPos(orig, [df * 2, dr * 2])
      const k2 = pos2key(two)
      if (!pieces.get(k2)) out.push(k2)
    }
  }
  for (const side of [-1, 1] as const) {
    const cap = addPos(orig, [side, dr])
    const kc = pos2key(cap)
    const target = pieces.get(kc)
    if (target && target.color === opposite(color)) out.push(kc)
  }
  return out
}

function movesForPiece(
  orig: Key,
  piece: Piece,
  pieces: Pieces,
): Key[] {
  const pos = key2pos(orig)
  const { color, role } = piece
  switch (role) {
    case 'pawn':
      return pawnMoves(pos, pieces, color)
    case 'knight':
      return knightMoves(pos, pieces, color)
    case 'bishop':
      return rayMoves(pos, BISHOP_DIRS, pieces, color)
    case 'rook':
      return rayMoves(pos, ROOK_DIRS, pieces, color)
    case 'queen':
      return rayMoves(pos, KING_DIRS, pieces, color)
    case 'king':
      return kingMoves(pos, pieces, color)
    default:
      return []
  }
}

/** All pseudo-legal moves for `side` (may leave king in check). */
export function pseudoLegalDests(pieces: Pieces, side: Color): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>()
  for (const [k, p] of pieces) {
    if (p.color !== side) continue
    const d = movesForPiece(k, p, pieces)
    if (d.length) dests.set(k, d)
  }
  return dests
}

/** Promotion rank index after a pawn move (auto-queen in `applyTorusMove`). White: rank 8; black: rank 4. */
export function promotionRankIndex(color: Color): number {
  return color === 'white' ? 7 : 3
}

/** True if `orig` is a pawn of `side` and `dest` is on that side’s promotion rank. */
export function isPawnPromotionSquare(
  pieces: Pieces,
  orig: Key,
  dest: Key,
  side: Color,
): boolean {
  const piece = pieces.get(orig)
  if (!piece || piece.role !== 'pawn' || piece.color !== side) return false
  return key2pos(dest)[1] === promotionRankIndex(side)
}

export function applyTorusMove(
  pieces: Pieces,
  orig: Key,
  dest: Key,
  promoteTo: Role = 'queen',
): Pieces {
  const piece = pieces.get(orig)
  if (!piece) return pieces

  if (piece.role === 'king' && isCastlingMove(orig, dest)) {
    return applyCastlingOnBoard(pieces, orig, dest, piece.color)
  }

  const next = new Map(pieces)
  next.delete(orig)
  let role: Role = piece.role
  if (piece.role === 'pawn') {
    const r = key2pos(dest)[1]
    if (r === promotionRankIndex(piece.color)) {
      role = promoteTo
    }
  }
  next.set(dest, { color: piece.color, role })
  return next
}
