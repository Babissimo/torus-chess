import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import * as cgBoard from 'chessground/board'
import type { DragCurrent } from 'chessground/drag'
import { read } from 'chessground/fen'
import type { State } from 'chessground/state'
import type { Color, Key, MouchEvent, Role } from 'chessground/types'
import { eventPosition, opposite, setVisible } from 'chessground/util'
import {
  canonicalKeyAt,
  coordsFromBoardIndex,
  mod,
  visualKeyForCanonicalOnBoard,
  visualProjectionsForCanonical,
} from '../engine/viewMapping'
import { deriveFenForBoard } from '../engine/canonicalMove'
import {
  applyTorusMove,
  inCheck,
  isPawnPromotionSquare,
  legalDestsFromFen,
  tryApplyLegalMove,
} from '../engine/torus'
import { saveLocalGame, type GameMode, type PersistedLocalGameV2 } from '../state/localGamePersist'
import type { CastlingRights } from '../engine/torus/castlingTypes'
import type { GameSnapshot } from '../state/gameUrl'

const HIGHLIGHT_CLASS = 'torus-selected'

/** Matches `--tiles-per-side` on `.board-viewport` (cells per grid axis). */
const TILES_PER_SIDE = 32

/**
 * 4×4 slots of 8×8 cells; each slot maps to logical torus board 0..3 (repeating 2×2 pattern).
 */
const TORUS_SLOT_BOARD_INDEX = [
  0, 1, 0, 1, 2, 3, 2, 3, 0, 1, 0, 1, 2, 3, 2, 3,
] as const

/** Pixels before we treat pointer movement as pan (not a click). */
const PAN_THRESHOLD_PX = 4

/** Pointer speed (px/ms) must exceed this to start coasting after release. */
const PAN_MOMENTUM_MIN_SPEED_PX_PER_MS = 0.032
/** Coasting ends when speed drops below this (px/ms). */
const PAN_MOMENTUM_STOP_THRESHOLD_PX_PER_MS = 0.01
/** Exponential damping rate for coasting velocity (per second); higher = quicker stop. */
const PAN_MOMENTUM_FRICTION_K = 5.5

type CgKeyed = HTMLElement & { cgKey?: Key }

type PanDragState = {
  pointerId: number
  startX: number
  startY: number
  panAtStart: { x: number; y: number }
  moved: boolean
  prevClientX: number
  prevClientY: number
  prevTime: number
  velocityX: number
  velocityY: number
}

function modCentered(n: number, m: number): number {
  const r = mod(n, m)
  return r >= m / 2 ? r - m : r
}

/** Layout size (subpixel) so one 8-cell wrap matches the painted CSS grid period. */
function gridLayoutWidthPx(grid: HTMLElement): number {
  const br = grid.getBoundingClientRect().width
  return br > 0 ? br : grid.clientWidth
}

function gridLayoutHeightPx(grid: HTMLElement): number {
  const br = grid.getBoundingClientRect().height
  return br > 0 ? br : grid.clientHeight
}

function getCgKeyFromTarget(target: EventTarget | null): Key | null {
  let el = target as HTMLElement | null
  while (el) {
    const k = (el as CgKeyed).cgKey
    if (k !== undefined) return k
    el = el.parentElement
  }
  return null
}

/**
 * Chessground sets `pointer-events: none` on most `square` and `piece` nodes, so hits go to
 * `cg-board` (no `cgKey`). Use `getKeyAtDomPos` for those cases.
 */
function resolveKeyFromPointer(
  e: ReactPointerEvent<HTMLDivElement>,
  apisRef: MutableRefObject<(Api | null)[]>,
): Key | null {
  const fromDom = getCgKeyFromTarget(e.target)
  if (fromDom) return fromDom

  const wrap = (e.target as HTMLElement | null)?.closest?.('.torus-cell')
  if (!wrap) return null
  const idx = Number.parseInt(wrap.getAttribute('data-slot-index') ?? '', 10)
  if (Number.isNaN(idx) || idx < 0 || idx >= TORUS_SLOT_BOARD_INDEX.length) return null
  const api = apisRef.current[idx]
  if (!api) return null
  return api.getKeyAtDomPos([e.clientX, e.clientY]) ?? null
}

/** Chessground memoizes `getBoundingClientRect()`; must clear after CSS pan moves the boards. */
function invalidateAllBoardBounds(apisRef: MutableRefObject<(Api | null)[]>) {
  for (const api of apisRef.current) {
    api?.state.dom.bounds.clear()
  }
}

/** Square under the pointer on any torus mini-board (Chessground only maps within its own bounds). */
function torusKeyAtClientPos(apis: (Api | null)[], pos: [number, number]): Key | undefined {
  for (const api of apis) {
    const k = api?.getKeyAtDomPos(pos)
    if (k) return k
  }
  return undefined
}

/**
 * Finish a piece drag like chessground/drag `end`, but with a destination from torus-wide hit testing.
 * Used when the pointer is outside the originating board’s bounds so stock `getKeyAtDomPos` misses.
 */
function finishPieceDragWithDest(s: State, e: MouseEvent | TouchEvent, cur: DragCurrent, dest: Key) {
  cgBoard.unsetPremove(s)
  cgBoard.unsetPredrop(s)
  if (dest && cur.started && cur.orig !== dest && !cur.newPiece) {
    s.stats.ctrlKey = e instanceof MouseEvent ? e.ctrlKey : false
    if (cgBoard.userMove(s, cur.orig, dest)) s.stats.dragged = true
  }
  if ((cur.orig === cur.previouslySelected || cur.keyHasChanged) && (cur.orig === dest || !dest)) {
    cgBoard.unselect(s)
  } else if (!s.selectable.enabled) {
    cgBoard.unselect(s)
  }
  const ghost = s.dom.elements.ghost
  if (ghost) setVisible(ghost, false)
  s.draggable.current = undefined
  s.dom.redraw()
}

function customSquaresForBoard(
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

type TorusBoardCellProps = {
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

const TorusBoardCell = ({
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
    const api = Chessground(el, {
      fen: deriveFenForBoard(canonicalFen),
      orientation: 'white',
      autoCastle: false,
      /* Coordinates reserve asymmetric strips (e.g. 12px ranks, 16px files) and break square
         cells — viewport math then shows ~8 files × 10 ranks. */
      coordinates: false,
      turnColor,
      check: sideInCheck,
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
        custom: new Map(),
      },
      /* Canonical orig→dest is shared across all mini-boards, so the slide always follows
         square labels on *this* 8×8, not the path the eye followed across the torus grid. */
      animation: { enabled: false },
    })
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

    const fen = deriveFenForBoard(canonicalFen)
    const lastMove =
      lastCanonicalMove &&
      ([
        visualKeyForCanonicalOnBoard(lastCanonicalMove.orig),
        visualKeyForCanonicalOnBoard(lastCanonicalMove.dest),
      ] as [Key, Key])

    api.set({
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
    })
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
  ])

  return (
    <div
      ref={rootRef}
      className="torus-cell cg-wrap"
      data-slot-index={slotIndex}
    />
  )
}

const PROMO_ROLES: Role[] = ['knight', 'bishop', 'rook', 'queen']

function pickRandomLegalMove(
  fen: string,
  turnColor: Color,
  castling: CastlingRights,
): { orig: Key; dest: Key; promoteTo: Role } | null {
  const pieces = read(fen)
  const dests = legalDestsFromFen(fen, turnColor, castling)
  const moves: { orig: Key; dest: Key; promoteTo: Role }[] = []
  for (const [orig, ds] of dests) {
    for (const dest of ds) {
      if (isPawnPromotionSquare(pieces, orig, dest, turnColor)) {
        for (const pr of PROMO_ROLES) {
          const after = applyTorusMove(pieces, orig, dest, pr)
          if (!inCheck(after, turnColor)) moves.push({ orig, dest, promoteTo: pr })
        }
      } else {
        moves.push({ orig, dest, promoteTo: 'queen' })
      }
    }
  }
  if (moves.length === 0) return null
  return moves[Math.floor(Math.random() * moves.length)]!
}

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
  const gridRef = useRef<HTMLDivElement | null>(null)
  const panPxRef = useRef({ x: 0, y: 0 })
  const panDragRef = useRef<PanDragState | null>(null)
  const momentumRafRef = useRef<number | null>(null)
  const momentumVelRef = useRef({ vx: 0, vy: 0 })

  const selectedRef = useRef<Key | null>(null)
  const legalDestsRef = useRef(legalDests)
  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    promotionPickRef.current = promotionPick
    selectedRef.current = effectiveSelection
    legalDestsRef.current = legalDests
  })

  const applyPanToDom = useCallback(() => {
    const el = gridRef.current
    if (!el) return
    const { x, y } = panPxRef.current
    el.style.setProperty('--pan-x', `${x}px`)
    el.style.setProperty('--pan-y', `${y}px`)
    invalidateAllBoardBounds(apisRef)
  }, [])

  useLayoutEffect(() => {
    applyPanToDom()
  }, [applyPanToDom])

  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current != null) {
      cancelAnimationFrame(momentumRafRef.current)
      momentumRafRef.current = null
    }
    momentumVelRef.current = { vx: 0, vy: 0 }
  }, [])

  const startMomentum = useCallback(
    (vx: number, vy: number) => {
      stopMomentum()
      const speed = Math.hypot(vx, vy)
      if (speed < PAN_MOMENTUM_MIN_SPEED_PX_PER_MS) return
      momentumVelRef.current = { vx, vy }
      let lastT = performance.now()
      const step = (now: number) => {
        const dt = Math.min(48, Math.max(0, now - lastT))
        lastT = now

        const grid = gridRef.current
        if (!grid) {
          momentumRafRef.current = null
          return
        }
        const w = gridLayoutWidthPx(grid)
        const h = gridLayoutHeightPx(grid)
        const wrapX = 8 * (w / TILES_PER_SIDE)
        const wrapY = 8 * (h / TILES_PER_SIDE)

        const v = momentumVelRef.current
        panPxRef.current = {
          x: modCentered(panPxRef.current.x + v.vx * dt, wrapX),
          y: modCentered(panPxRef.current.y + v.vy * dt, wrapY),
        }

        const decay = Math.exp(-PAN_MOMENTUM_FRICTION_K * (dt / 1000))
        v.vx *= decay
        v.vy *= decay

        applyPanToDom()

        if (Math.hypot(v.vx, v.vy) < PAN_MOMENTUM_STOP_THRESHOLD_PX_PER_MS) {
          v.vx = 0
          v.vy = 0
          momentumRafRef.current = null
          return
        }
        momentumRafRef.current = requestAnimationFrame(step)
      }
      momentumRafRef.current = requestAnimationFrame(step)
    },
    [applyPanToDom, stopMomentum],
  )

  useEffect(() => () => stopMomentum(), [stopMomentum])

  useEffect(() => {
    const onPointerEnd = (e: MouseEvent | TouchEvent) => {
      if (e instanceof MouseEvent && e.button !== 0) return

      const apis = apisRef.current
      let dragState: State | null = null
      let cur: DragCurrent | undefined
      for (const api of apis) {
        const c = api?.state.draggable.current
        if (c?.started && !c.newPiece) {
          dragState = api!.state
          cur = c
          break
        }
      }
      if (!dragState || !cur) return

      const eventPos = eventPosition(e as MouchEvent) ?? cur.pos
      const destTorus = torusKeyAtClientPos(apis, eventPos)
      if (!destTorus || destTorus === cur.orig) return
      if (!cgBoard.canMove(dragState, cur.orig, destTorus)) return

      const destCg = cgBoard.getKeyAtDomPos(
        eventPos,
        cgBoard.whitePov(dragState),
        dragState.dom.bounds(),
      )
      const cgWouldAbortTouch =
        e.type === 'touchend' && cur.originTarget !== e.target && !cur.newPiece

      if (!cgWouldAbortTouch && destCg) return

      e.stopImmediatePropagation()
      finishPieceDragWithDest(dragState, e, cur, destTorus)
    }

    document.addEventListener('mouseup', onPointerEnd, { capture: true })
    document.addEventListener('touchend', onPointerEnd, { capture: true })
    return () => {
      document.removeEventListener('mouseup', onPointerEnd, { capture: true })
      document.removeEventListener('touchend', onPointerEnd, { capture: true })
    }
  }, [])

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

  const onPointerDownCapture = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.shiftKey) return

    invalidateAllBoardBounds(apisRef)

    const key = resolveKeyFromPointer(e, apisRef)
    if (!key) return

    const pieces = read(snapshotRef.current.fen)
    if (pieces.get(key)) return

    const sel = selectedRef.current
    if (sel) {
      const dests = legalDestsRef.current.get(sel)
      if (dests?.includes(key)) return
    }

    const grid = gridRef.current
    if (!grid) return
    const w = gridLayoutWidthPx(grid)
    const cellPx = w / TILES_PER_SIDE
    if (cellPx <= 0) return

    e.preventDefault()
    e.stopPropagation()

    stopMomentum()

    const t0 = performance.now()
    panDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panAtStart: { ...panPxRef.current },
      moved: false,
      prevClientX: e.clientX,
      prevClientY: e.clientY,
      prevTime: t0,
      velocityX: 0,
      velocityY: 0,
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.classList.add('torus-pan-dragging')
  }, [stopMomentum])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = panDragRef.current
      if (!s || s.pointerId !== e.pointerId) return

      const grid = gridRef.current
      if (!grid) return
      const w = gridLayoutWidthPx(grid)
      const h = gridLayoutHeightPx(grid)
      const wrapX = 8 * (w / TILES_PER_SIDE)
      const wrapY = 8 * (h / TILES_PER_SIDE)

      const totalDx = e.clientX - s.startX
      const totalDy = e.clientY - s.startY
      const distSq = totalDx * totalDx + totalDy * totalDy
      if (distSq >= PAN_THRESHOLD_PX * PAN_THRESHOLD_PX) s.moved = true

      const t = performance.now()
      const dt = t - s.prevTime
      if (dt > 5 && dt < 90) {
        const ix = (e.clientX - s.prevClientX) / dt
        const iy = (e.clientY - s.prevClientY) / dt
        const blend = 0.5
        s.velocityX = blend * s.velocityX + (1 - blend) * ix
        s.velocityY = blend * s.velocityY + (1 - blend) * iy
      }
      s.prevClientX = e.clientX
      s.prevClientY = e.clientY
      s.prevTime = t

      const rawX = s.panAtStart.x + totalDx
      const rawY = s.panAtStart.y + totalDy
      const nextX = modCentered(rawX, wrapX)
      const nextY = modCentered(rawY, wrapY)

      panPxRef.current = {
        x: nextX,
        y: nextY,
      }
      applyPanToDom()
    },
    [applyPanToDom],
  )

  const endPanDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = panDragRef.current
      if (!s || s.pointerId !== e.pointerId) return

      const { moved, velocityX, velocityY } = s

      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      e.currentTarget.classList.remove('torus-pan-dragging')
      panDragRef.current = null

      if (!moved) {
        for (const api of apisRef.current) {
          api?.selectSquare(null)
        }
        setSelectedCanonical(null)
        return
      }

      startMomentum(velocityX, velocityY)
    },
    [setSelectedCanonical, startMomentum],
  )

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      endPanDrag(e)
    },
    [endPanDrag],
  )

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      endPanDrag(e)
    },
    [endPanDrag],
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
      {promotionActive ? (
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
        </div>
      ) : null}
    </div>
  )
}
