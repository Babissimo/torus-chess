import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'

type ChessgroundBoardProps = {
  config?: Config
}

export const ChessgroundBoard = ({ config }: ChessgroundBoardProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<Api | null>(null)

  useEffect(() => {
    const element = rootRef.current
    if (!element) return

    element.innerHTML = ''
    apiRef.current = Chessground(element, config)

    return () => {
      apiRef.current?.destroy()
      apiRef.current = null
    }
  }, [config])

  return <div ref={rootRef} className="cg-wrap torus-chessground-board" />
}
