/**
 * Local game snapshot: FEN (pieces), turn, last move, castling rights (Stage 2+).
 * {@link GameMode} `human` and `bot` use separate keys so the two modes do not overwrite each other.
 */
import { read } from 'chessground/fen'
import type { Color, Key } from 'chessground/types'
import { deriveCastlingFromBoard } from '../engine/torus'
import type { CastlingRights } from '../engine/torus'

/** Storage prefix; suffix is mode (`human`, `bot`) or legacy keys below. */
export const LOCAL_GAME_STORAGE_KEY = 'torus-chess:v1-game'

const LEGACY_SINGLE_KEY = LOCAL_GAME_STORAGE_KEY
const LEGACY_CORRESPONDENCE_KEY = `${LOCAL_GAME_STORAGE_KEY}:correspondence`
const LEGACY_OTB_KEY = `${LOCAL_GAME_STORAGE_KEY}:otb`

export type GameMode = 'human' | 'bot'

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

function removeLegacyHumanKeys(): void {
  try {
    localStorage.removeItem(LEGACY_CORRESPONDENCE_KEY)
    localStorage.removeItem(LEGACY_OTB_KEY)
    localStorage.removeItem(LEGACY_SINGLE_KEY)
  } catch {
    /* ignore */
  }
}

export function loadLocalGame(mode: GameMode): PersistedLocalGameV2 | null {
  if (typeof localStorage === 'undefined') return null
  try {
    if (mode === 'bot') {
      const raw = localStorage.getItem(storageKeyForMode('bot'))
      if (!raw) return null
      return parsePersistedLocalGame(raw)
    }

    const humanKey = storageKeyForMode('human')
    let raw = localStorage.getItem(humanKey)
    let migratedFromLegacy = false
    if (!raw) {
      for (const oldKey of [LEGACY_CORRESPONDENCE_KEY, LEGACY_OTB_KEY, LEGACY_SINGLE_KEY]) {
        raw = localStorage.getItem(oldKey)
        if (raw) {
          migratedFromLegacy = true
          break
        }
      }
    }
    if (!raw) return null
    const game = parsePersistedLocalGame(raw)
    if (!game) return null
    if (migratedFromLegacy) {
      try {
        localStorage.setItem(humanKey, JSON.stringify(game))
        removeLegacyHumanKeys()
      } catch {
        /* quota / private mode */
      }
    }
    return game
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
    if (mode === 'human') {
      removeLegacyHumanKeys()
    }
  } catch {
    /* ignore */
  }
}
