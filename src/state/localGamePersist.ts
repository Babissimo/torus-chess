/**
 * Local game snapshot: FEN (pieces), turn, last move, castling rights (Stage 2+).
 * Each {@link GameMode} uses its own storage key so in-progress games do not overwrite each other.
 */
import { read } from 'chessground/fen'
import type { Color, Key } from 'chessground/types'
import { deriveCastlingFromBoard } from '../engine/torus'
import type { CastlingRights } from '../engine/torus'

/** Pre–multi-mode single key; still read once for correspondence migration. */
export const LOCAL_GAME_STORAGE_KEY = 'torus-chess:v1-game'

export type GameMode = 'otb' | 'correspondence' | 'bot'

export function storageKeyForMode(mode: GameMode): string {
  return `${LOCAL_GAME_STORAGE_KEY}:${mode}`
}

export type PersistedLocalGameV2 = {
  v: 2
  fen: string
  turnColor: Color
  lastMove: { orig: Key; dest: Key } | null
  castling: CastlingRights
}

const KEY_RE = /^[a-h][1-8]$/

function isValidKey(k: unknown): k is Key {
  return typeof k === 'string' && KEY_RE.test(k)
}

function isCastlingRights(c: unknown): c is CastlingRights {
  if (!c || typeof c !== 'object') return false
  const o = c as Record<string, unknown>
  const w = o.white
  const b = o.black
  if (!w || !b || typeof w !== 'object' || typeof b !== 'object') return false
  const ww = w as Record<string, unknown>
  const bb = b as Record<string, unknown>
  return (
    typeof ww.K === 'boolean' &&
    typeof ww.Q === 'boolean' &&
    typeof bb.K === 'boolean' &&
    typeof bb.Q === 'boolean'
  )
}

function parsePersistedLocalGame(raw: string): PersistedLocalGameV2 | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const p = parsed as Record<string, unknown>
    if (typeof p.fen !== 'string') return null
    read(p.fen)
    const tc = p.turnColor
    if (tc !== 'white' && tc !== 'black') return null
    let lastMove: { orig: Key; dest: Key } | null = null
    if (p.lastMove != null && typeof p.lastMove === 'object') {
      const lm = p.lastMove as Record<string, unknown>
      if (isValidKey(lm.orig) && isValidKey(lm.dest)) {
        lastMove = { orig: lm.orig, dest: lm.dest }
      }
    }

    if (p.v === 2 && isCastlingRights(p.castling)) {
      return {
        v: 2,
        fen: p.fen,
        turnColor: tc,
        lastMove,
        castling: p.castling,
      }
    }

    if (p.v === 1) {
      const pieces = read(p.fen)
      return {
        v: 2,
        fen: p.fen,
        turnColor: tc,
        lastMove,
        castling: deriveCastlingFromBoard(pieces),
      }
    }

    return null
  } catch {
    return null
  }
}

export function loadLocalGame(mode: GameMode): PersistedLocalGameV2 | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const key = storageKeyForMode(mode)
    let raw = localStorage.getItem(key)
    if (!raw && mode === 'correspondence') {
      raw = localStorage.getItem(LOCAL_GAME_STORAGE_KEY)
      if (raw) {
        const migrated = parsePersistedLocalGame(raw)
        if (migrated) {
          try {
            localStorage.setItem(key, JSON.stringify(migrated))
            localStorage.removeItem(LOCAL_GAME_STORAGE_KEY)
          } catch {
            /* quota / private mode */
          }
          return migrated
        }
      }
    }
    if (!raw) return null
    return parsePersistedLocalGame(raw)
  } catch {
    return null
  }
}

export function saveLocalGame(mode: GameMode, state: PersistedLocalGameV2): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(storageKeyForMode(mode), JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

/** Clears saved position for one mode (used when starting a new game of that type). */
export function clearLocalGameForMode(mode: GameMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(storageKeyForMode(mode))
    if (mode === 'correspondence') {
      localStorage.removeItem(LOCAL_GAME_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}
