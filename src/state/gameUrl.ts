/**
 * Human-readable path: /fen/{w|b}/{KQkq|-}/{lastMove|-}/{8 rank segments}
 */
import { read } from 'chessground/fen'
import type { Color, Key } from 'chessground/types'
import { TORUS_INITIAL_FEN } from '../engine/torus/constants'
import type { CastlingRights } from '../engine/torus/castlingTypes'
import { initialCastlingRights } from '../engine/torus/castling'

const KEY_RE = /^[a-h][1-8]$/
const LAST_MOVE_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/
const RANK_RE = /^[1-8pnbrqkPNBRQK]+$/

export type GameSnapshot = {
  fen: string
  turnColor: Color
  lastMove: { orig: Key; dest: Key } | null
  castling: CastlingRights
}

export function defaultGameSnapshot(): GameSnapshot {
  return {
    fen: TORUS_INITIAL_FEN,
    turnColor: 'white',
    lastMove: null,
    castling: initialCastlingRights(),
  }
}

export function castlingToPathToken(r: CastlingRights): string {
  let s = ''
  if (r.white.K) s += 'K'
  if (r.white.Q) s += 'Q'
  if (r.black.K) s += 'k'
  if (r.black.Q) s += 'q'
  return s || '-'
}

export function castlingFromPathToken(t: string): CastlingRights | null {
  if (t === '-') {
    return {
      white: { K: false, Q: false },
      black: { K: false, Q: false },
    }
  }
  if (t.length > 4) return null
  const seen = new Set<string>()
  for (const c of t) {
    if (!'KQkq'.includes(c) || seen.has(c)) return null
    seen.add(c)
  }
  return {
    white: { K: seen.has('K'), Q: seen.has('Q') },
    black: { K: seen.has('k'), Q: seen.has('q') },
  }
}

function lastMoveFromSegment(seg: string): { orig: Key; dest: Key } | null {
  if (seg === '-') return null
  const m = seg.match(LAST_MOVE_RE)
  if (!m) return null
  const orig = m[1]! as Key
  const dest = m[2]! as Key
  if (!KEY_RE.test(orig) || !KEY_RE.test(dest)) return null
  return { orig, dest }
}

function lastMoveToSegment(lm: { orig: Key; dest: Key } | null): string {
  if (!lm) return '-'
  return `${lm.orig}${lm.dest}`
}

/** Pathname starting with /fen/... (no trailing slash). */
export function buildGamePathname(s: GameSnapshot): string {
  const ranks = s.fen.split('/')
  if (ranks.length !== 8) throw new Error('Invalid FEN rank count')
  for (const r of ranks) {
    if (!RANK_RE.test(r)) throw new Error('Invalid FEN rank segment')
  }
  const turn = s.turnColor === 'white' ? 'w' : 'b'
  const parts = [
    'fen',
    turn,
    castlingToPathToken(s.castling),
    lastMoveToSegment(s.lastMove),
    ...ranks,
  ]
  return `/${parts.join('/')}`
}

/** Parse /fen/... pathname; returns null if invalid. */
export function parseGamePathname(pathname: string): GameSnapshot | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 12 || parts[0] !== 'fen') return null
  const turnSeg = parts[1]
  if (turnSeg !== 'w' && turnSeg !== 'b') return null
  const castle = castlingFromPathToken(parts[2]!)
  if (!castle) return null
  let lastMove: { orig: Key; dest: Key } | null = null
  if (parts[3] !== '-') {
    const lm = lastMoveFromSegment(parts[3]!)
    if (!lm) return null
    lastMove = lm
  }

  const ranks = parts.slice(4, 12)
  if (ranks.length !== 8) return null
  for (const r of ranks) {
    if (!RANK_RE.test(r)) return null
  }
  const fen = ranks.join('/')
  read(fen)

  return {
    fen,
    turnColor: turnSeg === 'w' ? 'white' : 'black',
    lastMove,
    castling: castle,
  }
}

export const DEFAULT_GAME_PATHNAME = buildGamePathname(defaultGameSnapshot())
