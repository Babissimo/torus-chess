import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
  const to = useMemo(() => {
    const saved = loadLocalGame('human')
    return saved ? buildGamePathname(persistedToSnapshot(saved)) : DEFAULT_GAME_PATHNAME
  }, [])
  return <Navigate to={to} replace />
}

const SIDEBAR_LAYOUT_MQ = '(min-aspect-ratio: 4/3)'

function useSidebarBoardLayout() {
  const [sidebar, setSidebar] = useState(false)
  useLayoutEffect(() => {
    const mq = window.matchMedia(SIDEBAR_LAYOUT_MQ)
    const sync = () => setSidebar(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return sidebar
}

function GameShell() {
  const [gameMode, setGameMode] = useState<GameMode>('human')
  const [boardKey, setBoardKey] = useState(0)
  const [newGameMenuOpen, setNewGameMenuOpen] = useState(false)
  const newGameWrapRef = useRef<HTMLDivElement>(null)
  const newGameTriggerRef = useRef<HTMLButtonElement>(null)
  const sidebarBoardLayout = useSidebarBoardLayout()
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

  useEffect(() => {
    if (!newGameMenuOpen) return
    const wrap = newGameWrapRef.current
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNewGameMenuOpen(false)
        newGameTriggerRef.current?.focus()
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (wrap && !wrap.contains(e.target as Node)) setNewGameMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [newGameMenuOpen])

  if (!parsed) {
    return <Navigate to={DEFAULT_GAME_PATHNAME} replace />
  }

  const torusAboutText =
    'Chess on a doughnut: the board wraps on all sides, so a rook can fall off one edge and reappear on the other. This variant uses a custom opening setup—two armies face each other on the torus with familiar pieces and rules adapted to the wrap.'

  const gameActions = (
    <div className="app-actions">
      <div className="app-header-actions-row">
        <div
          className="app-new-game-wrap"
          ref={newGameWrapRef}
          onMouseEnter={() => setNewGameMenuOpen(true)}
          onMouseLeave={() => setNewGameMenuOpen(false)}
        >
          <button
            type="button"
            ref={newGameTriggerRef}
            className="app-button"
            aria-expanded={newGameMenuOpen}
            aria-haspopup="true"
            aria-controls="new-game-options"
            onClick={() => setNewGameMenuOpen((o) => !o)}
          >
            New game
          </button>
          {newGameMenuOpen ? (
            <div
              id="new-game-options"
              className="app-new-game-panel"
              role="group"
              aria-label="New game options"
            >
              <button
                type="button"
                className="app-button app-new-game-option"
                aria-label="Vs human"
                onClick={() => {
                  setNewGameMenuOpen(false)
                  startNewGame('human')
                }}
              >
                👤⚔️👤
              </button>
              <button
                type="button"
                className="app-button app-new-game-option"
                aria-label="Vs bot"
                onClick={() => {
                  setNewGameMenuOpen(false)
                  startNewGame('bot')
                }}
              >
                👤⚔️🤖
              </button>
            </div>
          ) : null}
        </div>
        <div className="app-about-wrap">
          <button
            type="button"
            className="app-button"
            aria-label="What is torus chess?"
            aria-describedby="torus-about-text"
          >
            ?
          </button>
          <div id="torus-about-text" className="app-about-panel" role="tooltip">
            {torusAboutText}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Torus Chess: ♟️ on a 🍩</h1>
        {sidebarBoardLayout ? gameActions : null}
      </header>
      <div className="board-chrome-wrap">
        {!sidebarBoardLayout ? gameActions : null}
        <section className="board-frame">
          <div className="board-slot">
            <div className="board-viewport">
              <TorusFourBoards
                key={boardKey}
                mode={gameMode}
                snapshot={parsed}
                onSnapshotChange={syncUrl}
              />
            </div>
          </div>
        </section>
      </div>
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
