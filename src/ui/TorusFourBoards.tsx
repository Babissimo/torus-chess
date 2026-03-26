import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Api } from 'chessground/api'
import { read } from 'chessground/fen'
import type { Key, Role } from 'chessground/types'
import { opposite } from 'chessground/util'
import { pickRandomLegalMove } from '../engine/torusRandomBot'
import {
  inCheck,
  isPawnPromotionSquare,
  legalDestsFromFen,
  tryApplyLegalMove,
} from '../engine/torus'
import { saveLocalGame, type GameMode, type PersistedLocalGameV2 } from '../state/localGamePersist'
import type { GameSnapshot } from '../state/gameUrl'
import { TORUS_SLOT_BOARD_INDEX } from './torusGridConstants'
import { TorusBoardCell } from './TorusBoardCell'
import { useCrossBoardPieceDrag } from './useCrossBoardPieceDrag'
import { useTorusGridPan } from './useTorusGridPan'

export type TorusFourBoardsProps = {
  mode: GameMode
  /** Position from URL (controlled); updates when the path or browser history changes. */
  snapshot: GameSnapshot
  onSnapshotChange?: (s: GameSnapshot) => void
}

export const TorusFourBoards = ({
  mode,
  snapshot,
  onSnapshotChange,
}: TorusFourBoardsProps) => {
  const [promotionPick, setPromotionPick] = useState<{ orig: Key; dest: Key } | null>(null)
  /** FEN when the promotion picker opened; if URL changes first, picker hides without a ref read in render. */
  const [promotionBaseFen, setPromotionBaseFen] = useState<string | null>(null)
  const [selectedCanonical, setSelectedCanonical] = useState<Key | null>(null)

  const snapshotRef = useRef(snapshot)
  const promotionPickRef = useRef<{ orig: Key; dest: Key } | null>(null)

  const promotionActive =
    promotionPick !== null && promotionBaseFen !== null && promotionBaseFen === snapshot.fen

  const effectiveSelection = useMemo(() => {
    if (!selectedCanonical) return null
    const p = read(snapshot.fen).get(selectedCanonical)
    if (!p || p.color !== snapshot.turnColor) return null
    return selectedCanonical
  }, [selectedCanonical, snapshot.fen, snapshot.turnColor])

  const legalDests = useMemo(
    () => legalDestsFromFen(snapshot.fen, snapshot.turnColor, snapshot.castling),
    [snapshot.fen, snapshot.turnColor, snapshot.castling],
  )

  const sideInCheck = useMemo(
    () => inCheck(read(snapshot.fen), snapshot.turnColor),
    [snapshot.fen, snapshot.turnColor],
  )

  const apisRef = useRef<(Api | null)[]>(
    Array.from({ length: TORUS_SLOT_BOARD_INDEX.length }, () => null),
  )

  const snapshotFenRef = useRef(snapshot.fen)
  const selectedRef = useRef<Key | null>(null)
  const legalDestsRef = useRef(legalDests)
  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    snapshotFenRef.current = snapshot.fen
    promotionPickRef.current = promotionPick
    selectedRef.current = effectiveSelection
    legalDestsRef.current = legalDests
  })

  useCrossBoardPieceDrag(apisRef)

  const {
    gridRef,
    onPointerDownCapture,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = useTorusGridPan({
    apisRef,
    snapshotFenRef,
    legalDestsRef,
    selectedRef,
    setSelectedCanonical,
  })

  useEffect(() => {
    if (mode !== 'human') return
    const payload: PersistedLocalGameV2 = {
      v: 2,
      fen: snapshot.fen,
      turnColor: snapshot.turnColor,
      lastMove: snapshot.lastMove,
      castling: snapshot.castling,
    }
    saveLocalGame(mode, payload)
  }, [mode, snapshot])

  useEffect(() => {
    if (mode !== 'bot') return
    if (snapshot.turnColor !== 'black') return

    let cancelled = false
    const id = window.setTimeout(() => {
      if (cancelled) return
      const g = snapshotRef.current
      if (g.turnColor !== 'black') return
      const move = pickRandomLegalMove(g.fen, g.turnColor, g.castling)
      if (!move) return
      const result = tryApplyLegalMove(
        g.fen,
        g.turnColor,
        move.orig,
        move.dest,
        g.castling,
        move.promoteTo,
      )
      if (!result) return
      const next: GameSnapshot = {
        fen: result.fen,
        turnColor: opposite(g.turnColor),
        lastMove: { orig: move.orig, dest: move.dest },
        castling: result.rights,
      }
      onSnapshotChange?.(next)
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [mode, snapshot.fen, snapshot.turnColor, snapshot.castling, onSnapshotChange])

  const commitSnapshot = useCallback(
    (next: GameSnapshot) => {
      onSnapshotChange?.(next)
    },
    [onSnapshotChange],
  )

  const finishPromotion = useCallback(
    (role: Role) => {
      const pick = promotionPickRef.current
      setPromotionPick(null)
      setPromotionBaseFen(null)
      promotionPickRef.current = null
      if (!pick) return
      const g = snapshotRef.current
      const result = tryApplyLegalMove(
        g.fen,
        g.turnColor,
        pick.orig,
        pick.dest,
        g.castling,
        role,
      )
      if (result) {
        commitSnapshot({
          fen: result.fen,
          turnColor: opposite(g.turnColor),
          lastMove: { orig: pick.orig, dest: pick.dest },
          castling: result.rights,
        })
      }
      setSelectedCanonical(null)
    },
    [commitSnapshot],
  )

  const onCanonicalMove = useCallback(
    (orig: Key, dest: Key) => {
      const g = snapshotRef.current
      const pieces = read(g.fen)
      if (isPawnPromotionSquare(pieces, orig, dest, g.turnColor)) {
        setPromotionBaseFen(g.fen)
        setPromotionPick({ orig, dest })
        setSelectedCanonical(null)
        return
      }
      const result = tryApplyLegalMove(g.fen, g.turnColor, orig, dest, g.castling)
      if (!result) return
      commitSnapshot({
        fen: result.fen,
        turnColor: opposite(g.turnColor),
        lastMove: { orig, dest },
        castling: result.rights,
      })
      setSelectedCanonical(null)
    },
    [commitSnapshot],
  )

  const promotionSymbols =
    snapshot.turnColor === 'white'
      ? (['♕', '♖', '♗', '♘'] as const)
      : (['♛', '♜', '♝', '♞'] as const)
  const promotionLabels: { role: Role; label: string }[] = [
    { role: 'queen', label: promotionSymbols[0] },
    { role: 'rook', label: promotionSymbols[1] },
    { role: 'bishop', label: promotionSymbols[2] },
    { role: 'knight', label: promotionSymbols[3] },
  ]

  return (
    <div
      ref={gridRef}
      className="torus-four-grid"
      role="group"
      aria-label="Torus board, repeating 2 by 2 pattern"
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {TORUS_SLOT_BOARD_INDEX.map((boardIndex, slotIndex) => (
        <TorusBoardCell
          key={slotIndex}
          slotIndex={slotIndex}
          boardIndex={boardIndex}
          canonicalFen={snapshot.fen}
          turnColor={snapshot.turnColor}
          interactionLocked={promotionActive}
          legalDests={legalDests}
          sideInCheck={sideInCheck}
          selectedCanonical={effectiveSelection}
          lastCanonicalMove={snapshot.lastMove}
          onSelectCanonical={setSelectedCanonical}
          onCanonicalMove={onCanonicalMove}
          onApiReady={(api) => {
            apisRef.current[slotIndex] = api
          }}
        />
      ))}
      {promotionActive
        ? createPortal(
            <div
              className="torus-promotion-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Choose promotion piece"
            >
              <div className="torus-promotion-panel">
                {promotionLabels.map(({ role, label }) => (
                  <button
                    key={role}
                    type="button"
                    className="torus-promotion-btn"
                    aria-label={`Promote to ${role}`}
                    onClick={() => finishPromotion(role)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
