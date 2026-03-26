import { useEffect } from 'react'
import type { Api } from 'chessground/api'
import * as cgBoard from 'chessground/board'
import type { DragCurrent } from 'chessground/drag'
import type { State } from 'chessground/state'
import type { MouchEvent } from 'chessground/types'
import { eventPosition } from 'chessground/util'
import type { MutableRefObject } from 'react'
import { finishPieceDragWithDest, torusKeyAtClientPos } from './torusBoardPointerUtils'

/**
 * When dragging ends, Chessground may not resolve the drop square if the pointer left the
 * originating board. Intercept capture-phase pointer end and complete the move using torus-wide
 * hit testing.
 */
export function useCrossBoardPieceDrag(apisRef: MutableRefObject<(Api | null)[]>) {
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
  }, [apisRef])
}
