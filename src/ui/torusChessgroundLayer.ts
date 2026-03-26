import type { Config } from 'chessground/config'
import { read } from 'chessground/fen'
import type { Color, Key } from 'chessground/types'
import type { MutableRefObject } from 'react'
import { deriveFenForBoard } from '../engine/canonicalMove'
import {
  canonicalKeyAt,
  visualKeyForCanonicalOnBoard,
  visualProjectionsForCanonical,
} from '../engine/viewMapping'

const HIGHLIGHT_CLASS = 'torus-selected'

export function customSquaresForBoard(
  dx: number,
  dy: number,
  selectedCanonical: Key | null,
): Map<Key, string> {
  const m = new Map<Key, string>()
  if (!selectedCanonical) return m
  for (const p of visualProjectionsForCanonical(selectedCanonical)) {
    if (p.dx === dx && p.dy === dy) {
      m.set(p.key, HIGHLIGHT_CLASS)
    }
  }
  return m
}

export type TorusChessgroundHandlerRefs = {
  fenRef: MutableRefObject<string>
  turnColorRef: MutableRefObject<Color>
  onSelectCanonicalRef: MutableRefObject<(key: Key | null) => void>
  afterMoveRef: MutableRefObject<(orig: Key, dest: Key) => void>
}

/**
 * Shared Chessground config for torus mini-boards: used on create and on every `api.set` so
 * movable / selectable / highlight behavior stays in sync.
 */
export function buildTorusChessgroundLayer(
  canonicalFen: string,
  input: {
    turnColor: Color
    interactionLocked: boolean
    legalDests: Map<Key, Key[]>
    sideInCheck: boolean
    selectedCanonical: Key | null
    lastCanonicalMove: { orig: Key; dest: Key } | null
    dx: number
    dy: number
    handlerRefs: TorusChessgroundHandlerRefs
  },
): Config {
  const {
    turnColor,
    interactionLocked,
    legalDests,
    sideInCheck,
    selectedCanonical,
    lastCanonicalMove,
    dx,
    dy,
    handlerRefs,
  } = input
  const { fenRef, turnColorRef, onSelectCanonicalRef, afterMoveRef } = handlerRefs

  const fen = deriveFenForBoard(canonicalFen)
  const lastMove =
    lastCanonicalMove &&
    ([
      visualKeyForCanonicalOnBoard(lastCanonicalMove.orig),
      visualKeyForCanonicalOnBoard(lastCanonicalMove.dest),
    ] as [Key, Key])

  return {
    fen,
    turnColor,
    selected: selectedCanonical ?? undefined,
    autoCastle: false,
    check: sideInCheck,
    coordinates: false,
    movable: {
      free: false,
      color: interactionLocked ? undefined : turnColor,
      dests: legalDests,
      showDests: !interactionLocked,
      events: {
        after: (orig, dest) => {
          afterMoveRef.current(orig, dest)
        },
      },
    },
    selectable: { enabled: !interactionLocked },
    events: {
      select: (key) => {
        const canon = canonicalKeyAt(key)
        const piece = read(fenRef.current).get(canon)
        if (!piece || piece.color !== turnColorRef.current) {
          onSelectCanonicalRef.current(null)
          return
        }
        onSelectCanonicalRef.current(canon)
      },
    },
    highlight: {
      lastMove: true,
      check: true,
      custom: customSquaresForBoard(dx, dy, selectedCanonical),
    },
    lastMove: lastMove ?? undefined,
    animation: { enabled: false },
  }
}
