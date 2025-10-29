import { useMemo, useRef, useState } from 'react'
import './App.css'

const SIDE_ORDER = ['top', 'right', 'bottom', 'left']
const SQUARE_SIZE = 180
const GAP = 120
const PADDING_X = 120
const PADDING_TOP = 60
const PADDING_BOTTOM = 60
const ROW_GAP = 60
const MIN_SQUARES = 2
const MAX_SQUARES = 6
const INITIAL_STATUS = ''
const LAYOUTS = {
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
}
const MODES = {
  EASY: 'easy',
  FREEFORM: 'freeform',
}
const FREEFORM_MIN_SEGMENT = 6

const PLAYER_STYLES = {
  A: 'player-a',
  B: 'player-b',
}
const MESSAGE_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
}
const MESSAGE_TIMEOUT = 3000

function createBoard(squareCount, layout) {
  if (layout === LAYOUTS.VERTICAL) {
    const rowBreakdown = []
    const maxPerRow = squareCount === 4 ? 2 : Math.min(3, squareCount)
    let remaining = squareCount

    while (remaining > 0) {
      const slotsInRow = Math.min(maxPerRow, remaining)
      rowBreakdown.push(slotsInRow)
      remaining -= slotsInRow
    }

    const columns = rowBreakdown.length ? Math.max(...rowBreakdown) : 0
    const rows = rowBreakdown.length || 1
    const totalWidth = columns * SQUARE_SIZE + (columns - 1) * GAP
    const totalHeight =
      rows * SQUARE_SIZE + (rows - 1) * ROW_GAP

    const squares = []
    let idCounter = 0

    rowBreakdown.forEach((slotsInRow, rowIndex) => {
      const rowWidth = slotsInRow * SQUARE_SIZE + (slotsInRow - 1) * GAP
      const startX = PADDING_X + (totalWidth - rowWidth) / 2
      const y = PADDING_TOP + rowIndex * (SQUARE_SIZE + ROW_GAP)

      for (let colIndex = 0; colIndex < slotsInRow; colIndex += 1) {
        const x = startX + colIndex * (SQUARE_SIZE + GAP)
        const size = SQUARE_SIZE
        const half = size / 2

        squares.push({
          id: idCounter,
          x,
          y,
          size,
          midpoints: {
            top: { x: x + half, y },
            right: { x: x + size, y: y + half },
            bottom: { x: x + half, y: y + size },
            left: { x, y: y + half },
          },
        })

        idCounter += 1
      }
    })

    const viewBoxWidth = totalWidth + PADDING_X * 2
    const viewBoxHeight = totalHeight + PADDING_TOP + PADDING_BOTTOM

    return {
      squares,
      viewBox: {
        width: viewBoxWidth,
        height: viewBoxHeight,
        asString: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
      },
    }
  }

  const totalWidth = squareCount * SQUARE_SIZE + (squareCount - 1) * GAP
  const viewBoxWidth = totalWidth + PADDING_X * 2
  const viewBoxHeight = SQUARE_SIZE + PADDING_TOP + PADDING_BOTTOM

  const squares = Array.from({ length: squareCount }).map((_, index) => {
    const x = PADDING_X + index * (SQUARE_SIZE + GAP)
    const y = PADDING_TOP
    const size = SQUARE_SIZE
    const half = size / 2

    return {
      id: index,
      x,
      y,
      size,
      midpoints: {
        top: { x: x + half, y },
        right: { x: x + size, y: y + half },
        bottom: { x: x + half, y: y + size },
        left: { x, y: y + half },
      },
    }
  })

  return {
    squares,
    viewBox: {
      width: viewBoxWidth,
      height: viewBoxHeight,
      asString: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
    },
  }
}

const EPSILON = 1e-6

function almostEqual(a, b) {
  return Math.abs(a - b) < EPSILON
}

function samePoint(p1, p2) {
  return almostEqual(p1.x, p2.x) && almostEqual(p1.y, p2.y)
}

function orientation(a, b, c) {
  const value =
    (b.y - a.y) * (c.x - b.x) -
    (b.x - a.x) * (c.y - b.y)

  if (almostEqual(value, 0)) {
    return 0
  }

  return value > 0 ? 1 : 2
}

function onSegment(a, b, c) {
  return (
    Math.min(a.x, c.x) - EPSILON <= b.x &&
    b.x <= Math.max(a.x, c.x) + EPSILON &&
    Math.min(a.y, c.y) - EPSILON <= b.y &&
    b.y <= Math.max(a.y, c.y) + EPSILON
  )
}

function segmentsIntersectStrict(a1, a2, b1, b2) {
  if (
    samePoint(a1, b1) ||
    samePoint(a1, b2) ||
    samePoint(a2, b1) ||
    samePoint(a2, b2)
  ) {
    return false
  }

  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (o1 !== o2 && o3 !== o4) {
    return true
  }

  if (o1 === 0 && onSegment(a1, b1, a2)) {
    return true
  }
  if (o2 === 0 && onSegment(a1, b2, a2)) {
    return true
  }
  if (o3 === 0 && onSegment(b1, a1, b2)) {
    return true
  }
  if (o4 === 0 && onSegment(b1, a2, b2)) {
    return true
  }

  return false
}

function getMidpoint(squares, squareId, side) {
  const square = squares.find((item) => item.id === squareId)
  return square?.midpoints[side] ?? null
}

function buildLine(squares, from, to) {
  const start = getMidpoint(squares, from.squareId, from.side)
  const end = getMidpoint(squares, to.squareId, to.side)

  if (!start || !end) {
    return null
  }

  return { start, end }
}

function distanceBetweenPoints(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function pointsToSegments(points) {
  const segments = []
  if (!points || points.length < 2) {
    return segments
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push([points[index], points[index + 1]])
  }

  return segments
}

function extractConnectionPoints(connection) {
  if (connection.points && connection.points.length >= 2) {
    return connection.points
  }

  if (connection.start && connection.end) {
    return [connection.start, connection.end]
  }

  return []
}

function pathIntersectsExisting(candidatePoints, connections) {
  const candidateSegments = pointsToSegments(candidatePoints)

  if (candidateSegments.length === 0) {
    return false
  }

  return connections.some((connection) => {
    const connectionSegments = pointsToSegments(
      extractConnectionPoints(connection),
    )

    return connectionSegments.some(([existingStart, existingEnd]) =>
      candidateSegments.some(([candidateStart, candidateEnd]) =>
        segmentsIntersectStrict(
          candidateStart,
          candidateEnd,
          existingStart,
          existingEnd,
        ),
      ),
    )
  })
}

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

function pointsToPathData(points) {
  if (!points || points.length < 2) {
    return ''
  }

  const [first, ...rest] = points
  const commands = [`M ${first.x} ${first.y}`]

  rest.forEach((point) => {
    commands.push(`L ${point.x} ${point.y}`)
  })

  return commands.join(' ')
}

function dedupePoints(points) {
  if (!points || points.length === 0) {
    return []
  }

  const deduped = [points[0]]

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index]
    const last = deduped[deduped.length - 1]

    if (!samePoint(current, last)) {
      deduped.push(current)
    }
  }

  return deduped
}

function listAvailableSides(squares, usedSides) {
  const available = []

  squares.forEach((square) => {
    SIDE_ORDER.forEach((side) => {
      const key = `${square.id}:${side}`
      if (!usedSides.has(key)) {
        available.push({
          squareId: square.id,
          side,
        })
      }
    })
  })

  return available
}

function hasAnyLegalMove(squares, usedSides, connections, mode) {
  const availableSides = listAvailableSides(squares, usedSides)

  for (let i = 0; i < availableSides.length; i += 1) {
    const from = availableSides[i]
    for (let j = i + 1; j < availableSides.length; j += 1) {
      const to = availableSides[j]

      if (from.squareId === to.squareId) {
        continue
      }

      if (mode === MODES.FREEFORM) {
        return true
      }

      const candidate = buildLine(squares, from, to)
      if (!candidate) {
        continue
      }

      const candidatePoints = [candidate.start, candidate.end]

      if (!pathIntersectsExisting(candidatePoints, connections)) {
        return true
      }
    }
  }

  return false
}

function App() {
  const [squareCount, setSquareCount] = useState(2)
  const [layout, setLayout] = useState(LAYOUTS.HORIZONTAL)
  const [mode, setMode] = useState(MODES.FREEFORM)
  const [currentPlayer, setCurrentPlayer] = useState('A')
  const [selectedSide, setSelectedSide] = useState(null)
  const [connections, setConnections] = useState([])
  const [usedSides, setUsedSides] = useState(() => new Set())
  const [statusMessage, setStatusMessage] = useState(INITIAL_STATUS)
  const [messageLevel, setMessageLevel] = useState(MESSAGE_LEVELS.INFO)
  const messageTimeoutRef = useRef()
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [freeformLine, setFreeformLine] = useState(null)

  const svgRef = useRef(null)

  const board = useMemo(
    () => createBoard(squareCount, layout),
    [squareCount, layout],
  )

  const availableTargets = useMemo(() => {
    if (!selectedSide) {
      return new Set()
    }

    const targets = new Set()

    board.squares.forEach((square) => {
      if (square.id === selectedSide.squareId) {
        return
      }

      SIDE_ORDER.forEach((side) => {
        const key = `${square.id}:${side}`
        if (usedSides.has(key)) {
          return
        }

        if (mode === MODES.FREEFORM) {
          targets.add(key)
          return
        }

        const candidate = buildLine(
          board.squares,
          selectedSide,
          { squareId: square.id, side },
        )

        if (!candidate) {
          return
        }

        const candidatePoints = [candidate.start, candidate.end]

        if (!pathIntersectsExisting(candidatePoints, connections)) {
          targets.add(key)
        }
      })
    })

    return targets
  }, [selectedSide, usedSides, connections, board, mode])

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

    const startPoint = getMidpoint(
      board.squares,
      selectedSide.squareId,
      selectedSide.side,
    )
    const targetPoint = getMidpoint(board.squares, targetSquareId, targetSide)

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

    if (pathSelfIntersects(points)) {
      showMessage(MESSAGE_LEVELS.WARNING, "Paths can't cross themselves.")
      return false
    }

    if (pathIntersectsExisting(points, connections)) {
      showMessage(MESSAGE_LEVELS.WARNING, "Paths can't cross existing lines.")
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
    const movesRemain = hasAnyLegalMove(
      board.squares,
      updatedUsedSides,
      updatedConnections,
      mode,
    )

    setConnections(updatedConnections)
    setUsedSides(updatedUsedSides)
    setSelectedSide(null)
    setFreeformLine(null)

    if (!movesRemain) {
      setGameOver(true)
      setWinner(currentPlayer)
      showMessage(MESSAGE_LEVELS.INFO, '')
      return true
    }

    setCurrentPlayer(nextPlayer)
    showMessage(MESSAGE_LEVELS.INFO, '')
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

  const handleLayoutChange = (nextLayout) => {
    if (layout === nextLayout) {
      return
    }

  setLayout(nextLayout)
  const layoutMessage = gameOver ? INITIAL_STATUS : ''
  resetGame(layoutMessage)
}

const handleModeChange = (nextMode) => {
  if (mode === nextMode) {
    return
  }

  setMode(nextMode)
  const modeMessage = gameOver ? INITIAL_STATUS : ''
  resetGame(modeMessage)
}

  const handleSideClick = (squareId, side) => {
    if (mode !== MODES.EASY || gameOver) {
      return
    }

    const sideKey = `${squareId}:${side}`

    if (usedSides.has(sideKey)) {
      showMessage(MESSAGE_LEVELS.WARNING, "That side's taken.")
      return
    }

    if (
      selectedSide &&
      selectedSide.squareId === squareId &&
      selectedSide.side === side
    ) {
      setSelectedSide(null)
      showMessage(MESSAGE_LEVELS.INFO, '')
      return
    }

    if (!selectedSide) {
      setSelectedSide({ squareId, side })
      showMessage(MESSAGE_LEVELS.INFO, '')
      return
    }

    finalizeConnection(squareId, side)
  }

  const handleSidePointerDown = (squareId, side, event) => {
    if (mode !== MODES.FREEFORM || gameOver) {
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

    const startPoint = getMidpoint(board.squares, squareId, side)

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
    if (mode !== MODES.FREEFORM || !isDrawing) {
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
    if (mode !== MODES.FREEFORM || !isDrawing) {
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

    const targetPoint = getMidpoint(board.squares, squareId, side)

    const pathPointsBase = drawing.current
      ? [...drawing.points, drawing.current]
      : drawing.points

    const sanitizedPoints = pathPointsBase.slice()

    if (
      sanitizedPoints.length === 0 ||
      !samePoint(sanitizedPoints[sanitizedPoints.length - 1], targetPoint)
    ) {
      sanitizedPoints.push(targetPoint)
    } else {
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
        <h1>Joseph&apos;s Squares</h1>
        <p className="app__tagline">
          Connect the sides without crossing lines. Last player with a move wins.
        </p>
      </header>

      <section className="status-bar">
        <div className="status-bar__info">
          <span className={`status-bar__badge ${PLAYER_STYLES[currentPlayer]}`}>
            {gameOver
              ? `Winner: Player ${winner}`
              : `Player ${currentPlayer} - pick a side`}
          </span>
        </div>
        <button
          onClick={handleReset}
          className="status-bar__action"
        >
          Start new game
        </button>
      </section>

      <section className="toolbar">
        <div className="toolbar__group toolbar__group--squares">
          <span className="toolbar__label">Squares</span>
          <div className="toolbar__stepper">
            <button
              type="button"
              className="toolbar__stepper-button"
              onClick={() => handleSquareStep(-1)}
              disabled={squareCount <= MIN_SQUARES}
              aria-label="Decrease squares"
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
              aria-label="Number of squares"
            />
            <button
              type="button"
              className="toolbar__stepper-button"
              onClick={() => handleSquareStep(1)}
              disabled={squareCount >= MAX_SQUARES}
              aria-label="Increase squares"
            >
              +
            </button>
          </div>
        </div>

        <div className="toolbar__group">
          <span className="toolbar__label">Layout</span>
          <div className="toolbar__toggle">
            <button
              type="button"
              className={`toolbar__toggle-button${
                layout === LAYOUTS.HORIZONTAL ? ' toolbar__toggle-button--active' : ''
              }`}
              onClick={() => handleLayoutChange(LAYOUTS.HORIZONTAL)}
              aria-pressed={layout === LAYOUTS.HORIZONTAL}
            >
              Horizontal
            </button>
            <button
              type="button"
              className={`toolbar__toggle-button${
                layout === LAYOUTS.VERTICAL ? ' toolbar__toggle-button--active' : ''
              }`}
              onClick={() => handleLayoutChange(LAYOUTS.VERTICAL)}
              aria-pressed={layout === LAYOUTS.VERTICAL}
            >
              Vertical
            </button>
          </div>
        </div>

        <div className="toolbar__group">
          <span className="toolbar__label">Mode</span>
          <div className="toolbar__toggle">
            <button
              type="button"
              className={`toolbar__toggle-button${
                mode === MODES.FREEFORM ? ' toolbar__toggle-button--active' : ''
              }`}
              onClick={() => handleModeChange(MODES.FREEFORM)}
              aria-pressed={mode === MODES.FREEFORM}
            >
              Freeform
            </button>
            <button
              type="button"
              className={`toolbar__toggle-button${
                mode === MODES.EASY ? ' toolbar__toggle-button--active' : ''
              }`}
              onClick={() => handleModeChange(MODES.EASY)}
              aria-pressed={mode === MODES.EASY}
            >
              Easy
            </button>
          </div>
        </div>

      </section>

      <div className="board">
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
                      r={12}
                      className={circleClassNames}
                      data-square-id={square.id}
                      data-side={side}
                      onClick={
                        mode === MODES.EASY
                          ? () => handleSideClick(square.id, side)
                          : undefined
                      }
                      onPointerDown={
                        mode === MODES.FREEFORM
                          ? (event) => handleSidePointerDown(square.id, side, event)
                          : undefined
                      }
                    />
                  </g>
                )
              })}
            </g>
          ))}

          {mode === MODES.FREEFORM && freeformLine
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

      {statusMessage ? (
        <div className={`notice notice--${messageLevel}`} role="status">
          <span
            aria-hidden="true"
            className={`notice__icon notice__icon--${messageLevel}`}
          />
          <span className="notice__text">{statusMessage}</span>
        </div>
      ) : null}

      <details className="rules">
        <summary>Game Rules</summary>
        <ul>
          <li>Connect sides without crossing lines. Last move wins.</li>
          <li>Connect unused sides on different squares without crossing lines.</li>
          <li>Each side can be used once. When you have no legal moves, you lose.</li>
          <li>Freeform mode lets you draw the connection path; Easy mode draws the straight line for you.</li>
        </ul>
      </details>
    </div>
  )
}

export default App
