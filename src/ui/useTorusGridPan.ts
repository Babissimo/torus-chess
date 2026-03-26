import type { Api } from 'chessground/api'
import { read } from 'chessground/fen'
import type { Key } from 'chessground/types'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  PAN_MOMENTUM_FRICTION_K,
  PAN_MOMENTUM_MIN_SPEED_PX_PER_MS,
  PAN_MOMENTUM_STOP_THRESHOLD_PX_PER_MS,
  PAN_THRESHOLD_PX,
  TILES_PER_SIDE,
} from './torusGridConstants'
import { invalidateAllBoardBounds, resolveKeyFromPointer } from './torusBoardPointerUtils'
import {
  gridLayoutHeightPx,
  gridLayoutWidthPx,
  modCentered,
  modPanXForTorus,
} from './torusPanGeometry'

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

type UseTorusGridPanArgs = {
  apisRef: MutableRefObject<(Api | null)[]>
  snapshotFenRef: RefObject<string>
  legalDestsRef: RefObject<Map<Key, Key[]>>
  selectedRef: RefObject<Key | null>
  setSelectedCanonical: (key: Key | null) => void
}

export function useTorusGridPan({
  apisRef,
  snapshotFenRef,
  legalDestsRef,
  selectedRef,
  setSelectedCanonical,
}: UseTorusGridPanArgs) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const panPxRef = useRef({ x: 0, y: 0 })
  const panDragRef = useRef<PanDragState | null>(null)
  const momentumRafRef = useRef<number | null>(null)
  const momentumVelRef = useRef({ vx: 0, vy: 0 })

  const applyPanToDom = useCallback(() => {
    const el = gridRef.current
    if (!el) return
    const { x, y } = panPxRef.current
    el.style.setProperty('--pan-x', `${x}px`)
    el.style.setProperty('--pan-y', `${y}px`)
    invalidateAllBoardBounds(apisRef)
  }, [apisRef])

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
          x: modPanXForTorus(panPxRef.current.x + v.vx * dt, wrapX),
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

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.shiftKey) return

      invalidateAllBoardBounds(apisRef)

      const key = resolveKeyFromPointer(e, apisRef)
      if (!key) return

      const fen = snapshotFenRef.current
      if (!fen) return
      const pieces = read(fen)
      if (pieces.get(key)) return

      const sel = selectedRef.current
      if (sel) {
        const dests = legalDestsRef.current?.get(sel)
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
    },
    [apisRef, snapshotFenRef, legalDestsRef, selectedRef, stopMomentum],
  )

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
      const nextX = modPanXForTorus(rawX, wrapX)
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
    [apisRef, setSelectedCanonical, startMomentum],
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

  return {
    gridRef,
    onPointerDownCapture,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
