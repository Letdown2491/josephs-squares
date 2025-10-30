import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { MAX_SQUARES, MIN_SQUARES, SIDE_ORDER } from './logic/constants.js'
import {
  buildLine,
  createBoard,
  computeAvailableTargets,
  dedupePoints,
  deriveGridMetrics,
  distanceBetweenPoints,
  extractConnectionPoints,
  getAnchorPoint,
  evaluateRemainingMoves,
  pathCrossesSquares,
  pathIntersectsExisting,
  pathTouchesMidpoints,
  samePoint,
  pointsToPathData,
  pointsToSegments,
  resampleSegments,
  segmentsIntersectStrict,
} from './logic/gameLogic.js'

const INITIAL_STATUS = ''
const FREEFORM_MIN_SEGMENT = 4

const PLAYER_STYLES = {
  A: 'player-a',
  B: 'player-b',
}
const MESSAGE_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
}
const MESSAGE_TIMEOUT = 3000





function pathSelfIntersects(points) {
  const segments = pointsToSegments(points)

  for (let i = 0; i < segments.length; i += 1) {
    const [startA, endA] = segments[i]

    for (let j = i + 1; j < segments.length; j += 1) {
      if (Math.abs(i - j) <= 1) {
        continue
      }

      const [startB, endB] = segments[j]

      if (segmentsIntersectStrict(startA, endA, startB, endB)) {
        return true
      }
    }
  }

  return false
}


function App() {
  const [squareCount, setSquareCount] = useState(2)
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return 'dark'
    }
    try {
      const stored = window.localStorage.getItem('josephs-squares-theme')
      if (stored === 'light' || stored === 'dark') {
        return stored
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'dark'
    } catch {
      return 'dark'
    }
  })
  const [currentPlayer, setCurrentPlayer] = useState('A')
  const [selectedSide, setSelectedSide] = useState(null)
  const [connections, setConnections] = useState([])
  const [usedSides, setUsedSides] = useState(() => new Set())
  const [statusMessage, setStatusMessage] = useState(INITIAL_STATUS)
  const [messageLevel, setMessageLevel] = useState(MESSAGE_LEVELS.INFO)
  const messageTimeoutRef = useRef()
  const evaluationRequestIdRef = useRef(0)
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [freeformLine, setFreeformLine] = useState(null)
  const [isCheckingMoves, setIsCheckingMoves] = useState(false)
  const [unitsPerPixel, setUnitsPerPixel] = useState(1)

  useEffect(() => {
    document.body.dataset.theme = theme
    try {
      window.localStorage.setItem('josephs-squares-theme', theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const svgRef = useRef(null)

  const board = useMemo(
    () => createBoard(squareCount),
    [squareCount],
  )

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const updateScale = () => {
      const rect = svg.getBoundingClientRect()
      if (rect.height > 0) {
        const next = board.viewBox.height / rect.height
        setUnitsPerPixel((previous) =>
          Math.abs(previous - next) > 0.01 ? next : previous,
        )
      }
    }

    updateScale()
    window.addEventListener('resize', updateScale)

    return () => {
      window.removeEventListener('resize', updateScale)
    }
  }, [board])

  const toggleTheme = () => {
    setTheme((previous) => (previous === 'light' ? 'dark' : 'light'))
  }

  const gridMetrics = useMemo(
    () => deriveGridMetrics(unitsPerPixel),
    [unitsPerPixel],
  )

  const pathWorkerRef = useRef(null)
  const workerRequestIdRef = useRef(0)
  const pendingWorkerRequestsRef = useRef(new Map())
  const [workerReady, setWorkerReady] = useState(false)
  const [availableTargets, setAvailableTargets] = useState(new Set())

  useEffect(() => {
    let worker
    const pendingRequests = pendingWorkerRequestsRef.current

    try {
      worker = new Worker(
        new URL('./workers/pathWorker.js', import.meta.url),
        { type: 'module' },
      )
    } catch (error) {
      console.error('Failed to initialise path worker', error)
      setWorkerReady(false)
      return undefined
    }

    pathWorkerRef.current = worker
    worker.onmessage = ({ data }) => {
      const { id, result, error } = data
      const pending = pendingWorkerRequestsRef.current.get(id)
      if (!pending) {
        return
      }
      pendingWorkerRequestsRef.current.delete(id)
      if (error) {
        pending.reject(new Error(error.message ?? String(error)))
      } else {
        pending.resolve(result)
      }
    }
    worker.onerror = (event) => {
      console.error('pathWorker error', event)
    }
    setWorkerReady(true)

    return () => {
      worker.terminate()
      pathWorkerRef.current = null
      setWorkerReady(false)
      pendingRequests.forEach(({ reject }) =>
        reject(new Error('Worker terminated')),
      )
      pendingRequests.clear()
    }
  }, [])

  const postWorkerTask = useCallback(
    (type, payload) => {
      const worker = pathWorkerRef.current
      if (!worker) {
        return Promise.reject(new Error('Worker not ready'))
      }

      const id = workerRequestIdRef.current += 1
      return new Promise((resolve, reject) => {
        pendingWorkerRequestsRef.current.set(id, { resolve, reject })
        worker.postMessage({ id, type, payload })
      })
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    if (!selectedSide) {
      setAvailableTargets(new Set())
      return undefined
    }

    const payload = {
      board,
      connections,
      usedSides: Array.from(usedSides),
      selectedSide,
      metrics: gridMetrics,
    }

    const task = workerReady
      ? postWorkerTask('computeAvailableTargets', payload).then((result) => {
          const list = Array.isArray(result?.targets)
            ? result.targets
            : Array.isArray(result)
              ? result
              : []
          return new Set(list)
        })
      : Promise.resolve(
          new Set(
            computeAvailableTargets(
              board,
              connections,
              usedSides,
              selectedSide,
              gridMetrics,
            ),
          ),
        )

    task
      .then((targets) => {
        if (!cancelled) {
          setAvailableTargets(targets)
        }
      })
      .catch((error) => {
        console.error('Failed to compute available targets', error)
        if (!cancelled) {
          setAvailableTargets(new Set())
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedSide, usedSides, board, connections, gridMetrics, workerReady, postWorkerTask])

  const convertClientToBoardCoords = (clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) {
      return null
    }

    const rect = svg.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0) {
      return null
    }

    const x = ((clientX - rect.left) / rect.width) * board.viewBox.width
    const y = ((clientY - rect.top) / rect.height) * board.viewBox.height

    return { x, y }
  }

  const finalizeConnection = (targetSquareId, targetSide, overridePoints) => {
    if (isCheckingMoves) {
      return false
    }

    if (!selectedSide) {
      return false
    }

    if (selectedSide.squareId === targetSquareId) {
      showMessage(MESSAGE_LEVELS.WARNING, 'Pick a side on another square.')
      return false
    }

    const targetKey = `${targetSquareId}:${targetSide}`

    if (usedSides.has(targetKey)) {
      showMessage(MESSAGE_LEVELS.WARNING, "That side's taken.")
      return false
    }

    const startPoint = getAnchorPoint(
      board.squares,
      selectedSide.squareId,
      selectedSide.side,
      gridMetrics,
    )
    const targetPoint = getAnchorPoint(
      board.squares,
      targetSquareId,
      targetSide,
      gridMetrics,
    )

    if (!startPoint || !targetPoint) {
      showMessage(MESSAGE_LEVELS.INFO, '')
      return false
    }

    let points

    if (overridePoints && overridePoints.length >= 2) {
      const normalized = [...overridePoints]
      normalized[0] = startPoint
      normalized[normalized.length - 1] = targetPoint
      points = normalized
    } else {
      const candidate = buildLine(
        board.squares,
        selectedSide,
        { squareId: targetSquareId, side: targetSide },
        gridMetrics,
      )

      if (!candidate) {
        showMessage(MESSAGE_LEVELS.INFO, '')
        return false
      }

      points = [candidate.start, candidate.end]
    }

    points = dedupePoints(points)

    if (points.length < 2) {
      showMessage(MESSAGE_LEVELS.WARNING, 'Draw a longer path to connect.')
      return false
    }

    const validationPoints = resampleSegments(points)

    if (pathSelfIntersects(validationPoints)) {
      showMessage(MESSAGE_LEVELS.WARNING, "Paths can't cross themselves.")
      return false
    }

    if (pathIntersectsExisting(validationPoints, connections)) {
      showMessage(MESSAGE_LEVELS.WARNING, "Paths can't cross existing lines.")
      return false
    }

    if (
      pathCrossesSquares(
        validationPoints,
        board.squares,
        selectedSide.squareId,
        targetSquareId,
      )
    ) {
      showMessage(MESSAGE_LEVELS.WARNING, 'Paths cannot pass through squares.')
      return false
    }

    if (
      pathTouchesMidpoints(
        validationPoints,
        board.squares,
        selectedSide,
        { squareId: targetSquareId, side: targetSide },
        gridMetrics,
      )
    ) {
      showMessage(MESSAGE_LEVELS.WARNING, 'Paths cannot pass through unused nodes.')
      return false
    }

    const connection = {
      from: selectedSide,
      to: { squareId: targetSquareId, side: targetSide },
      start: points[0],
      end: points[points.length - 1],
      points,
      player: currentPlayer,
    }

    const updatedConnections = [...connections, connection]
    const updatedUsedSides = new Set(usedSides)
    updatedUsedSides.add(`${selectedSide.squareId}:${selectedSide.side}`)
    updatedUsedSides.add(targetKey)

    const nextPlayer = currentPlayer === 'A' ? 'B' : 'A'

    setSelectedSide(null)
    setFreeformLine(null)
    setIsCheckingMoves(true)

    const evaluationRequestId = evaluationRequestIdRef.current + 1
    evaluationRequestIdRef.current = evaluationRequestId

    const evaluationPayload = {
      board,
      connections: updatedConnections,
      usedSides: Array.from(updatedUsedSides),
      metrics: gridMetrics,
    }

    const evaluationTask = workerReady
      ? postWorkerTask('evaluateRemainingMoves', evaluationPayload)
      : Promise.resolve(
          evaluateRemainingMoves(
            board,
            updatedConnections,
            updatedUsedSides,
            gridMetrics,
          ),
        )

    evaluationTask
      .then(({ movesRemain }) => {
        if (evaluationRequestIdRef.current !== evaluationRequestId) {
          return
        }

        if (!movesRemain && connections.length === 0) {
          showMessage(
            MESSAGE_LEVELS.WARNING,
            'Nice try, cheater. Try again!',
          )
          return
        }

        setConnections(updatedConnections)
        setUsedSides(updatedUsedSides)

        if (!movesRemain) {
          setGameOver(true)
          setWinner(currentPlayer)
          showMessage(MESSAGE_LEVELS.INFO, '')
        } else {
          setCurrentPlayer(nextPlayer)
          showMessage(MESSAGE_LEVELS.INFO, '')
        }
      })
      .catch((error) => {
        console.error('Failed to evaluate remaining moves', error)
        if (evaluationRequestIdRef.current === evaluationRequestId) {
          showMessage(
            MESSAGE_LEVELS.WARNING,
            'Unable to evaluate moves. Try again.',
          )
        }
      })
      .finally(() => {
        if (evaluationRequestIdRef.current === evaluationRequestId) {
          setIsCheckingMoves(false)
        }
      })

    return true
  }

  const showMessage = (level, text) => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current)
      messageTimeoutRef.current = undefined
    }

    setMessageLevel(level)
    setStatusMessage(text)

    if (text) {
      messageTimeoutRef.current = setTimeout(() => {
        setStatusMessage('')
        messageTimeoutRef.current = undefined
      }, MESSAGE_TIMEOUT)
    }
  }

  const resetGame = (message = INITIAL_STATUS) => {
    setConnections([])
    setUsedSides(new Set())
    setSelectedSide(null)
    setIsDrawing(false)
    setFreeformLine(null)
    setCurrentPlayer('A')
    setGameOver(false)
    setWinner(null)
    evaluationRequestIdRef.current += 1
    setIsCheckingMoves(false)
    showMessage(MESSAGE_LEVELS.INFO, message)
  }

  const handleSquareStep = (delta) => {
    const next = Math.min(
      MAX_SQUARES,
      Math.max(MIN_SQUARES, squareCount + delta),
    )
    if (next === squareCount) {
      return
    }
    setSquareCount(next)
    resetGame('')
  }

  const handleSquareInput = (event) => {
    const parsed = Number(event.target.value)
    if (Number.isNaN(parsed)) {
      return
    }
    const bounded = Math.min(MAX_SQUARES, Math.max(MIN_SQUARES, parsed))
    if (bounded === squareCount) {
      return
    }
    setSquareCount(bounded)
    resetGame('')
  }

  const handleReset = () => {
    resetGame()
  }

  const handleSidePointerDown = (squareId, side, event) => {
    if (gameOver) {
      return
    }

    if (isCheckingMoves) {
      return
    }

    if (event.button && event.button !== 0) {
      return
    }

    event.preventDefault()

    const sideKey = `${squareId}:${side}`

    if (usedSides.has(sideKey)) {
      showMessage(MESSAGE_LEVELS.WARNING, "That side's taken.")
      return
    }

    const sameAsSelected =
      selectedSide &&
      selectedSide.squareId === squareId &&
      selectedSide.side === side

    if (!sameAsSelected) {
      setSelectedSide({ squareId, side })
    }

    showMessage(MESSAGE_LEVELS.INFO, '')

    const startPoint = getAnchorPoint(board.squares, squareId, side, gridMetrics)

    if (!startPoint) {
      return
    }

    setIsDrawing(true)
    setFreeformLine({
      start: startPoint,
      points: [startPoint],
      current: startPoint,
    })
    const handlePointerRelease = (nativeEvent) => {
      handlePointerUp(nativeEvent)
      window.removeEventListener('pointerup', handlePointerRelease)
      window.removeEventListener('pointercancel', handlePointerRelease)
    }

    window.addEventListener('pointerup', handlePointerRelease)
    window.addEventListener('pointercancel', handlePointerRelease)
  }

  const handlePointerMove = (event) => {
    if (!isDrawing) {
      return
    }

    const point = convertClientToBoardCoords(event.clientX, event.clientY)
    if (!point) {
      return
    }

    event.preventDefault()
    setFreeformLine((previous) =>
      previous
        ? {
            ...previous,
            current: point,
            points:
              distanceBetweenPoints(
                previous.points[previous.points.length - 1],
                point,
              ) >= FREEFORM_MIN_SEGMENT
                ? [...previous.points, point]
                : previous.points,
          }
        : previous,
    )
  }

  const handlePointerUp = (event) => {
    if (!isDrawing) {
      return
    }

    setIsDrawing(false)

    const drawing = freeformLine

    if (!drawing) {
      setFreeformLine(null)
      return
    }

    const eventTarget = event.target instanceof Element ? event.target : null
    const circleTarget = eventTarget?.closest('[data-square-id]')

    if (!circleTarget) {
      setFreeformLine(null)
      showMessage(MESSAGE_LEVELS.INFO, '')
      return
    }

    const squareId = Number(circleTarget.getAttribute('data-square-id'))
    const side = circleTarget.getAttribute('data-side')

    if (!Number.isInteger(squareId) || !side) {
      setFreeformLine(null)
      return
    }

    if (!selectedSide) {
      setFreeformLine(null)
      return
    }

    if (
      selectedSide.squareId === squareId &&
      selectedSide.side === side
    ) {
      setFreeformLine(null)
      setSelectedSide(null)
      showMessage(MESSAGE_LEVELS.INFO, '')
      return
    }

    const sideKey = `${squareId}:${side}`
    if (usedSides.has(sideKey)) {
      setFreeformLine(null)
      showMessage(MESSAGE_LEVELS.WARNING, "That side's taken.")
      return
    }

    const targetPoint = getAnchorPoint(board.squares, squareId, side, gridMetrics)

    const startPoint = drawing.start
      ? drawing.start
      : getAnchorPoint(
          board.squares,
          selectedSide.squareId,
          selectedSide.side,
          gridMetrics,
        )

    const pathPointsBase = drawing.current
      ? [...drawing.points, drawing.current]
      : drawing.points

    const sanitizedPoints = pathPointsBase.slice()

    if (sanitizedPoints.length === 0) {
      sanitizedPoints.push(startPoint, targetPoint)
    } else {
      sanitizedPoints[0] = startPoint
      sanitizedPoints[sanitizedPoints.length - 1] = targetPoint
    }

    const success = finalizeConnection(squareId, side, sanitizedPoints)

    if (!success) {
      setFreeformLine(null)
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title-row">
          <h1>Joseph&apos;s Squares</h1>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
        <p className="app__tagline">
          Connect the sides without crossing lines. Last player with a move wins.
        </p>
      </header>

      <div className={`status-pill status-pill--${gameOver ? 'winner' : messageLevel}`}>
        {(() => {
          const modifier = gameOver
            ? 'status-pill__badge--winner'
            : messageLevel === MESSAGE_LEVELS.WARNING
              ? 'status-pill__badge--warning'
              : ''
          const badgeClass = ['status-pill__badge', PLAYER_STYLES[currentPlayer], modifier]
            .filter(Boolean)
            .join(' ')
          return (
            <span className={badgeClass}>
              {gameOver ? (
                <>
                  <TrophyIcon
                    className={`status-pill__icon status-pill__icon--${currentPlayer.toLowerCase()}`}
                    aria-hidden="true"
                  />
                  <span>Player {winner} wins. Congratulations!</span>
                </>
              ) : (
                <span>
                  Player {currentPlayer} - {statusMessage || 'pick a side'}
                </span>
              )}
              {isCheckingMoves ? (
                <>
                  <span className="status-pill__spinner" aria-hidden="true" />
                  <span className="sr-only">Checking available moves…</span>
                </>
              ) : null}
            </span>
          )
        })()}
      </div>

      <section className="toolbar">
        <div className="toolbar__group toolbar__group--squares">
          <span className="toolbar__label">Shapes</span>
          <div className="toolbar__stepper">
            <button
              type="button"
              className="toolbar__stepper-button"
              onClick={() => handleSquareStep(-1)}
              disabled={squareCount <= MIN_SQUARES}
              aria-label="Decrease shapes"
            >
              –
            </button>
            <input
              id="square-count"
              type="number"
              min={MIN_SQUARES}
              max={MAX_SQUARES}
              value={squareCount}
              onChange={handleSquareInput}
              className="toolbar__stepper-value"
              aria-label="Number of shapes"
            />
            <button
              type="button"
              className="toolbar__stepper-button"
              onClick={() => handleSquareStep(1)}
              disabled={squareCount >= MAX_SQUARES}
              aria-label="Increase shapes"
            >
              +
            </button>
          </div>
        </div>

        <div className="toolbar__spacer" />

        <button
          type="button"
          className="toolbar__action"
          onClick={handleReset}
        >
          {gameOver ? 'Play again' : 'Start new game'}
        </button>

      </section>

      <div className={`board${gameOver ? ' board--over' : ''}`}>
        <svg
          ref={svgRef}
          viewBox={board.viewBox.asString}
          width={board.viewBox.width}
          height={board.viewBox.height}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {board.squares.map((square) => (
            <g key={square.id}>
              <rect
                x={square.x}
                y={square.y}
                width={square.size}
                height={square.size}
                className="board__square"
                rx="8"
                ry="8"
              />

              {SIDE_ORDER.map((side) => {
                const point = square.midpoints[side]
                const key = `${square.id}:${side}`
                const used = usedSides.has(key)
                const selected =
                  selectedSide &&
                  selectedSide.squareId === square.id &&
                  selectedSide.side === side
                const targetable = availableTargets.has(key)

                const circleClassNames = [
                  'board__side',
                  used ? 'board__side--used' : 'board__side--available',
                  selected ? 'board__side--selected' : '',
                  targetable ? 'board__side--targetable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <g key={key}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={24}
                      className={circleClassNames}
                      data-square-id={square.id}
                      data-side={side}
                      onPointerDown={(event) => handleSidePointerDown(square.id, side, event)}
                    />
                  </g>
                )
              })}
            </g>
          ))}

          {freeformLine
          ? (() => {
              const basePoints = freeformLine.points || []
              const includeCurrent =
                freeformLine.current &&
                (!basePoints.length ||
                  (!samePoint(
                    basePoints[basePoints.length - 1],
                    freeformLine.current,
                  ) &&
                    distanceBetweenPoints(
                      basePoints[basePoints.length - 1],
                      freeformLine.current,
                    ) >= FREEFORM_MIN_SEGMENT))
              const previewPoints = includeCurrent
                ? [...basePoints, freeformLine.current]
                : basePoints
              const pathData = pointsToPathData(previewPoints)

                return pathData ? (
                  <path
                    d={pathData}
                    className={`board__connection board__connection--preview ${PLAYER_STYLES[currentPlayer]}`}
                  />
                ) : null
              })()
            : null}

          {connections.map((connection, index) => {
            const pathData = pointsToPathData(extractConnectionPoints(connection))

            if (!pathData) {
              return null
            }

            return (
              <path
                key={`${connection.from.squareId}-${connection.from.side}-${index}`}
                d={pathData}
                className={`board__connection ${PLAYER_STYLES[connection.player]}`}
              />
            )
          })}
        </svg>
      </div>

      <details className="rules">
        <summary>Game Rules</summary>
        <ul>
          <li>Connect sides without crossing lines. Last move wins.</li>
          <li>Draw between unused sides on different squares; every line must stay outside the squares.</li>
          <li>Each side can be used once. When you have no legal moves, you lose.</li>
        </ul>
      </details>
    </div>
  )
}

export default App

function SunIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}

function MoonIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}

function TrophyIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z" />
      <path d="M5 4h2v3a5 5 0 0 1-2-3Z" />
      <path d="M19 4h-2v3a5 5 0 0 0 2-3Z" />
    </svg>
  )
}
