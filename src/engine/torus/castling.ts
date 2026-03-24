import type { Color, Key, Piece, Pieces, Pos } from 'chessground/types'
import { key2pos, pos2key } from 'chessground/util'
import { opposite } from 'chessground/util'
import type { CastlingRights } from './castlingTypes'

function kingKeyOf(pieces: Pieces, side: Color): Key | undefined {
  for (const [k, p] of pieces) {
    if (p.color === side && p.role === 'king') return k
  }
  return undefined
}

export type { CastlingRights } from './castlingTypes'

/** Standard e-file for castling (file index 4). */
export const E_FILE = 4
export const A_FILE = 0
export const H_FILE = 7

export function initialCastlingRights(): CastlingRights {
  return {
    white: { K: true, Q: true },
    black: { K: true, Q: true },
  }
}

/** No castling — used when computing attacks (king cannot “attack” via castle). */
export function emptyCastlingRights(): CastlingRights {
  return {
    white: { K: false, Q: false },
    black: { K: false, Q: false },
  }
}

/** Infer rights from current pieces (for migrating saves without castling field). */
export function deriveCastlingFromBoard(pieces: Pieces): CastlingRights {
  const r = initialCastlingRights()
  const wk = pieces.get('e1')
  if (wk?.role !== 'king' || wk.color !== 'white') {
    r.white.K = false
    r.white.Q = false
  }
  const wrA = pieces.get('a1')
  if (wrA?.role !== 'rook' || wrA.color !== 'white') r.white.Q = false
  const wrH = pieces.get('h1')
  if (wrH?.role !== 'rook' || wrH.color !== 'white') r.white.K = false

  const bk = pieces.get('e5')
  if (bk?.role !== 'king' || bk.color !== 'black') {
    r.black.K = false
    r.black.Q = false
  }
  const brA = pieces.get('a5')
  if (brA?.role !== 'rook' || brA.color !== 'black') r.black.Q = false
  const brH = pieces.get('h5')
  if (brH?.role !== 'rook' || brH.color !== 'black') r.black.K = false

  return r
}

function isCastlingKingside(orig: Pos, dest: Pos): boolean {
  return dest[1] === orig[1] && orig[0] === E_FILE && dest[0] === 6
}

function isCastlingQueenside(orig: Pos, dest: Pos): boolean {
  return dest[1] === orig[1] && orig[0] === E_FILE && dest[0] === 2
}

/** King e-file → g/c file, same rank, 2 files — paired rook moves on that rank. */
export function isCastlingMove(orig: Key, dest: Key): boolean {
  const o = key2pos(orig)
  const d = key2pos(dest)
  return (
    o[0] === E_FILE &&
    d[1] === o[1] &&
    (isCastlingKingside(o, d) || isCastlingQueenside(o, d))
  )
}

/**
 * Valid king destination keys for castling (geometry + rook + not through/into check).
 * `isAttacked` must be true if the opponent attacks that square.
 */
export function legalCastlingDests(
  pieces: Pieces,
  side: Color,
  rights: CastlingRights,
  isAttacked: (pieces: Pieces, sq: Key, by: Color) => boolean,
  kingInCheck: boolean,
): Key[] {
  const out: Key[] = []
  const opp = opposite(side)
  const kk = kingKeyOf(pieces, side)
  if (!kk || kingInCheck) return out
  const kpos = key2pos(kk)
  if (kpos[0] !== E_FILE) return out
  const rk = kpos[1]
  const r = side === 'white' ? rights.white : rights.black

  if (r.K) {
    const f = pos2key([5, rk])
    const g = pos2key([6, rk])
    const h = pos2key([7, rk])
    if (!pieces.get(f) && !pieces.get(g)) {
      const rook = pieces.get(h)
      if (rook?.role === 'rook' && rook.color === side) {
        if (!isAttacked(pieces, f, opp) && !isAttacked(pieces, g, opp)) {
          out.push(g)
        }
      }
    }
  }

  if (r.Q) {
    const a = pos2key([0, rk])
    const b = pos2key([1, rk])
    const c = pos2key([2, rk])
    const d = pos2key([3, rk])
    if (!pieces.get(b) && !pieces.get(c) && !pieces.get(d)) {
      const rook = pieces.get(a)
      if (rook?.role === 'rook' && rook.color === side) {
        if (!isAttacked(pieces, d, opp) && !isAttacked(pieces, c, opp)) {
          out.push(c)
        }
      }
    }
  }

  return out
}

export function applyCastlingOnBoard(
  pieces: Pieces,
  orig: Key,
  dest: Key,
  color: Color,
): Pieces {
  const next = new Map(pieces)
  const o = key2pos(orig)
  const d = key2pos(dest)
  const rk = o[1]
  next.delete(orig)
  next.set(dest, { color, role: 'king' })
  if (isCastlingKingside(o, d)) {
    const rf = pos2key([H_FILE, rk])
    const rt = pos2key([5, rk])
    const rook = next.get(rf)
    if (rook?.role === 'rook' && rook.color === color) {
      next.delete(rf)
      next.set(rt, { color, role: 'rook' })
    }
  } else if (isCastlingQueenside(o, d)) {
    const rf = pos2key([A_FILE, rk])
    const rt = pos2key([3, rk])
    const rook = next.get(rf)
    if (rook?.role === 'rook' && rook.color === color) {
      next.delete(rf)
      next.set(rt, { color, role: 'rook' })
    }
  }
  return next
}

export function updateCastlingRights(
  rights: CastlingRights,
  orig: Key,
  dest: Key,
  before: Pieces,
  piece: Piece,
): CastlingRights {
  const next: CastlingRights = {
    white: { ...rights.white },
    black: { ...rights.black },
  }
  const c = piece.color

  if (piece.role === 'king') {
    if (c === 'white') {
      next.white.K = false
      next.white.Q = false
    } else {
      next.black.K = false
      next.black.Q = false
    }
  }

  if (piece.role === 'rook') {
    if (orig === 'a1' && c === 'white') next.white.Q = false
    if (orig === 'h1' && c === 'white') next.white.K = false
    if (orig === 'a5' && c === 'black') next.black.Q = false
    if (orig === 'h5' && c === 'black') next.black.K = false
  }

  const captured = before.get(dest)
  if (captured?.role === 'rook') {
    if (dest === 'a1' && captured.color === 'white') next.white.Q = false
    if (dest === 'h1' && captured.color === 'white') next.white.K = false
    if (dest === 'a5' && captured.color === 'black') next.black.Q = false
    if (dest === 'h5' && captured.color === 'black') next.black.K = false
  }

  return next
}
