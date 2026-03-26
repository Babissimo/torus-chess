import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { Color, Key } from 'chessground/types'
import { canonicalKeyAt, coordsFromBoardIndex } from '../engine/viewMapping'
import {
  buildTorusChessgroundLayer,
  type TorusChessgroundHandlerRefs,
} from './torusChessgroundLayer'

export type TorusBoardCellProps = {
  slotIndex: number
  boardIndex: number
  canonicalFen: string
  turnColor: Color
  /** When true, piece moves are disabled (e.g. promotion picker open). */
  interactionLocked: boolean
  /** Canonical legal moves for the side to play (torus + check filter). */
  legalDests: Map<Key, Key[]>
  /** Side to move is in check (Chessground check highlight). */
  sideInCheck: boolean
  selectedCanonical: Key | null
  lastCanonicalMove: { orig: Key; dest: Key } | null
  onSelectCanonical: (key: Key | null) => void
  /** Canonical origin and destination (after mapping from this board’s visual keys). */
  onCanonicalMove: (origCanon: Key, destCanon: Key) => void
  onApiReady?: (api: Api | null) => void
}

function mountChessgroundInCell(
  el: HTMLDivElement,
  boardIndex: number,
  canonicalFen: string,
  turnColor: Color,
  interactionLocked: boolean,
  legalDests: Map<Key, Key[]>,
  sideInCheck: boolean,
  handlerRefs: TorusChessgroundHandlerRefs,
): Api {
  const { dx, dy } = coordsFromBoardIndex(boardIndex)
  return Chessground(el, {
    orientation: 'white',
    ...buildTorusChessgroundLayer(canonicalFen, {
      turnColor,
      interactionLocked,
      legalDests,
      sideInCheck,
      selectedCanonical: null,
      lastCanonicalMove: null,
      dx,
      dy,
      handlerRefs,
    }),
  })
}

export const TorusBoardCell = ({
  slotIndex,
  boardIndex,
  canonicalFen,
  turnColor,
  interactionLocked,
  legalDests,
  sideInCheck,
  selectedCanonical,
  lastCanonicalMove,
  onSelectCanonical,
  onCanonicalMove,
  onApiReady,
}: TorusBoardCellProps) => {
  const { dx, dy } = coordsFromBoardIndex(boardIndex)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<Api | null>(null)

  const fenRef = useRef(canonicalFen)
  const turnColorRef = useRef(turnColor)
  const onSelectCanonicalRef = useRef(onSelectCanonical)
  const onCanonicalMoveRef = useRef(onCanonicalMove)
  const onApiReadyRef = useRef(onApiReady)
  onApiReadyRef.current = onApiReady

  const afterMove = useCallback((orig: Key, dest: Key) => {
    const oC = canonicalKeyAt(orig)
    const dC = canonicalKeyAt(dest)
    onCanonicalMoveRef.current(oC, dC)
  }, [])

  const afterMoveRef = useRef(afterMove)

  const handlerRefs = useMemo<TorusChessgroundHandlerRefs>(
    () => ({
      fenRef,
      turnColorRef,
      onSelectCanonicalRef,
      afterMoveRef,
    }),
    [],
  )

  useLayoutEffect(() => {
    fenRef.current = canonicalFen
    turnColorRef.current = turnColor
    onSelectCanonicalRef.current = onSelectCanonical
    onCanonicalMoveRef.current = onCanonicalMove
    afterMoveRef.current = afterMove
  })

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    el.innerHTML = ''
    const api = mountChessgroundInCell(
      el,
      boardIndex,
      canonicalFen,
      turnColor,
      interactionLocked,
      legalDests,
      sideInCheck,
      handlerRefs,
    )
    apiRef.current = api
    onApiReadyRef.current?.(api)

    return () => {
      api.destroy()
      apiRef.current = null
      onApiReadyRef.current?.(null)
    }
    // Only dx/dy identify the cell; position/rules sync in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [dx, dy])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return

    api.set(
      buildTorusChessgroundLayer(canonicalFen, {
        turnColor,
        interactionLocked,
        legalDests,
        sideInCheck,
        selectedCanonical,
        lastCanonicalMove,
        dx,
        dy,
        handlerRefs,
      }),
    )
  }, [
    canonicalFen,
    turnColor,
    interactionLocked,
    legalDests,
    sideInCheck,
    selectedCanonical,
    lastCanonicalMove,
    dx,
    dy,
    handlerRefs,
  ])

  return (
    <div
      ref={rootRef}
      className="torus-cell cg-wrap torus-chessground-board"
      data-slot-index={slotIndex}
    />
  )
}
