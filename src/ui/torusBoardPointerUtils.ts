import type { Api } from 'chessground/api'
import * as cgBoard from 'chessground/board'
import type { DragCurrent } from 'chessground/drag'
import type { State } from 'chessground/state'
import type { Key } from 'chessground/types'
import { setVisible } from 'chessground/util'
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react'
import { TORUS_SLOT_BOARD_INDEX } from './torusGridConstants'

type CgKeyed = HTMLElement & { cgKey?: Key }

export function getCgKeyFromTarget(target: EventTarget | null): Key | null {
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
export function resolveKeyFromPointer(
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
export function invalidateAllBoardBounds(apisRef: MutableRefObject<(Api | null)[]>) {
  for (const api of apisRef.current) {
    api?.state.dom.bounds.clear()
  }
}

/** Square under the pointer on any torus mini-board (Chessground only maps within its own bounds). */
export function torusKeyAtClientPos(apis: (Api | null)[], pos: [number, number]): Key | undefined {
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
export function finishPieceDragWithDest(
  s: State,
  e: MouseEvent | TouchEvent,
  cur: DragCurrent,
  dest: Key,
) {
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
