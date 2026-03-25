import { useCallback, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { TorusFourBoards } from './ui/TorusFourBoards'
import {
  clearLocalGameForMode,
  loadLocalGame,
  type GameMode,
} from './state/localGamePersist'
import {
  buildGamePathname,
  DEFAULT_GAME_PATHNAME,
  parseGamePathname,
  type GameSnapshot,
} from './state/gameUrl'

function persistedToSnapshot(p: {
  fen: string
  turnColor: GameSnapshot['turnColor']
  lastMove: GameSnapshot['lastMove']
  castling: GameSnapshot['castling']
}): GameSnapshot {
  return {
    fen: p.fen,
    turnColor: p.turnColor,
    lastMove: p.lastMove,
    castling: p.castling,
  }
}

function HomeRedirect() {
  const saved = loadLocalGame('human')
  const to = saved ? buildGamePathname(persistedToSnapshot(saved)) : DEFAULT_GAME_PATHNAME
  return <Navigate to={to} replace />
}

function GameShell() {
  const [gameMode, setGameMode] = useState<GameMode>('human')
  const [boardKey, setBoardKey] = useState(0)
  const loc = useLocation()
  const navigate = useNavigate()

  const parsed = useMemo(() => parseGamePathname(loc.pathname), [loc.pathname])

  const syncUrl = useCallback(
    (s: GameSnapshot) => {
      const next = buildGamePathname(s)
      if (next !== loc.pathname) navigate(next, { replace: true })
    },
    [loc.pathname, navigate],
  )

  const startNewGame = (mode: GameMode) => {
    clearLocalGameForMode(mode)
    setGameMode(mode)
    setBoardKey((k) => k + 1)
    navigate(DEFAULT_GAME_PATHNAME, { replace: true })
  }

  if (!parsed) {
    return <Navigate to={DEFAULT_GAME_PATHNAME} replace />
  }

  const modeDescription =
    gameMode === 'human'
      ? 'Vs human: two players; the URL and local storage keep the position in this browser (share the link to resume elsewhere).'
      : 'Vs bot: you play White; a simple random-move bot plays Black.'

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Torus Chess</h1>
        <p>
          Chess on a doughnut: the board wraps on all sides, so a rook can fall off one edge and
          reappear on the other. This variant uses a custom opening setup—two armies face each other
          on the torus with familiar pieces and rules adapted to the wrap.
        </p>
        <p className="app-mode-line">{modeDescription}</p>
        <div className="app-actions" role="group" aria-label="Start a new game">
          <span className="app-actions-label">New game</span>
          <div className="app-actions-row">
            <button type="button" className="app-button" onClick={() => startNewGame('human')}>
              Vs human
            </button>
            <button type="button" className="app-button" onClick={() => startNewGame('bot')}>
              Vs bot
            </button>
          </div>
        </div>
      </header>
      <section className="board-frame">
        <div className="board-viewport">
          <div className="board-layer">
            <TorusFourBoards
              key={boardKey}
              mode={gameMode}
              snapshot={parsed}
              onSnapshotChange={syncUrl}
            />
          </div>
        </div>
      </section>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/fen/*" element={<GameShell />} />
      <Route path="*" element={<Navigate to={DEFAULT_GAME_PATHNAME} replace />} />
    </Routes>
  )
}

export default App
