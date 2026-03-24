import { read, write } from 'chessground/fen'
import type { FEN, Key } from 'chessground/types'

/** Permissive: move piece from orig to dest on canonical board; no rules beyond taking destination. */
export function applyPermissiveCanonicalMove(fen: FEN, orig: Key, dest: Key): FEN {
  if (orig === dest) return fen
  const pieces = read(fen)
  const piece = pieces.get(orig)
  if (!piece) return fen
  pieces.delete(orig)
  pieces.set(dest, piece)
  return write(pieces)
}

/** Same canonical FEN on every mini-board (aligned orientation). */
export function deriveFenForBoard(canonicalFen: FEN): FEN {
  return write(read(canonicalFen))
}
