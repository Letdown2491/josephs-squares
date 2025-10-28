import { useMemo, useState } from 'react'
import './App.css'

const SIDE_ORDER = ['top', 'right', 'bottom', 'left']
const SQUARE_SIZE = 140
const GAP = 120
const PADDING = 80
const INITIAL_STATUS = 'Player A: select a side to start.'
const LAYOUTS = {
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
}

const PLAYER_STYLES = {
  A: 'player-a',
  B: 'player-b',
}

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
    const totalHeight = rows * SQUARE_SIZE + (rows - 1) * GAP

    const squares = []
    let idCounter = 0

    rowBreakdown.forEach((slotsInRow, rowIndex) => {
      const rowWidth = slotsInRow * SQUARE_SIZE + (slotsInRow - 1) * GAP
      const startX = PADDING + (totalWidth - rowWidth) / 2
      const y = PADDING + rowIndex * (SQUARE_SIZE + GAP)

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

    const viewBoxWidth = totalWidth + PADDING * 2
    const viewBoxHeight = totalHeight + PADDING * 2

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
  const viewBoxWidth = totalWidth + PADDING * 2
  const viewBoxHeight = SQUARE_SIZE + PADDING * 2

  const squares = Array.from({ length: squareCount }).map((_, index) => {
    const x = PADDING + index * (SQUARE_SIZE + GAP)
    const y = PADDING
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

function lineIntersectsExisting(candidate, connections) {
  return connections.some((connection) =>
    segmentsIntersectStrict(
      candidate.start,
      candidate.end,
      connection.start,
      connection.end,
    ),
  )
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

function hasAnyLegalMove(squares, usedSides, connections) {
  const availableSides = listAvailableSides(squares, usedSides)

  for (let i = 0; i < availableSides.length; i += 1) {
    const from = availableSides[i]
    for (let j = i + 1; j < availableSides.length; j += 1) {
      const to = availableSides[j]

      if (from.squareId === to.squareId) {
        continue
      }

      const candidate = buildLine(squares, from, to)
      if (!candidate) {
        continue
      }

      if (!lineIntersectsExisting(candidate, connections)) {
        return true
      }
    }
  }

  return false
}

function App() {
  const [squareCount, setSquareCount] = useState(2)
  const [layout, setLayout] = useState(LAYOUTS.HORIZONTAL)
  const [currentPlayer, setCurrentPlayer] = useState('A')
  const [selectedSide, setSelectedSide] = useState(null)
  const [connections, setConnections] = useState([])
  const [usedSides, setUsedSides] = useState(() => new Set())
  const [statusMessage, setStatusMessage] = useState(INITIAL_STATUS)
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState(null)

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

        const candidate = buildLine(
          board.squares,
          selectedSide,
          { squareId: square.id, side },
        )

        if (candidate && !lineIntersectsExisting(candidate, connections)) {
          targets.add(key)
        }
      })
    })

    return targets
  }, [selectedSide, usedSides, connections, board])

  const resetGame = ({ newCount, customStatus } = {}) => {
    setConnections([])
    setUsedSides(new Set())
    setSelectedSide(null)
    setCurrentPlayer('A')
    setGameOver(false)
    setWinner(null)
    if (customStatus) {
      setStatusMessage(customStatus)
      return
    }

    if (typeof newCount === 'number') {
      setStatusMessage(`Board reset with ${newCount} squares. ${INITIAL_STATUS}`)
      return
    }

    setStatusMessage(INITIAL_STATUS)
  }

  const handleSquareCountChange = (event) => {
    const value = Number(event.target.value)
    setSquareCount(value)
    resetGame({ newCount: value })
  }

  const handleReset = () => {
    resetGame()
  }

  const handleLayoutChange = (nextLayout) => {
    if (layout === nextLayout) {
      return
    }

    setLayout(nextLayout)
    const layoutLabel =
      nextLayout === LAYOUTS.HORIZONTAL
        ? 'horizontal row'
        : 'vertical grid'
    resetGame({
      customStatus: `Layout set to ${layoutLabel}. ${INITIAL_STATUS}`,
    })
  }

  const handleSideClick = (squareId, side) => {
    if (gameOver) {
      return
    }

    const sideKey = `${squareId}:${side}`

    if (usedSides.has(sideKey)) {
      setStatusMessage('That side is already connected. Choose another.')
      return
    }

    if (
      selectedSide &&
      selectedSide.squareId === squareId &&
      selectedSide.side === side
    ) {
      setSelectedSide(null)
      setStatusMessage(`Selection cleared. Player ${currentPlayer}, pick a side.`)
      return
    }

    if (!selectedSide) {
      setSelectedSide({ squareId, side })
      setStatusMessage(`Player ${currentPlayer}, choose a side on another square.`)
      return
    }

    if (selectedSide.squareId === squareId) {
      setStatusMessage('Connect sides from different squares.')
      return
    }

    const candidate = buildLine(
      board.squares,
      selectedSide,
      { squareId, side },
    )

    if (!candidate) {
      setStatusMessage('Could not draw that line. Try another side.')
      return
    }

    if (lineIntersectsExisting(candidate, connections)) {
      setStatusMessage('Lines cannot cross. Pick a different side.')
      return
    }

    const connection = {
      from: selectedSide,
      to: { squareId, side },
      start: candidate.start,
      end: candidate.end,
      player: currentPlayer,
    }

    const updatedConnections = [...connections, connection]
    const updatedUsedSides = new Set(usedSides)
    updatedUsedSides.add(`${selectedSide.squareId}:${selectedSide.side}`)
    updatedUsedSides.add(sideKey)

    const nextPlayer = currentPlayer === 'A' ? 'B' : 'A'
    const movesRemain = hasAnyLegalMove(
      board.squares,
      updatedUsedSides,
      updatedConnections,
    )

    setConnections(updatedConnections)
    setUsedSides(updatedUsedSides)
    setSelectedSide(null)

    if (!movesRemain) {
      setGameOver(true)
      setWinner(currentPlayer)
      setStatusMessage(
        `Player ${currentPlayer} wins! Player ${nextPlayer} has no legal moves left.`,
      )
      return
    }

    setCurrentPlayer(nextPlayer)
    setStatusMessage(`Player ${nextPlayer}: select a side to continue.`)
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Joseph&apos;s Squares</h1>
        <p className="app__tagline">
          Connect the sides without crossing lines. Last player with a move wins.
        </p>
      </header>

      <section className="controls">
        <div className="controls__range">
          <label htmlFor="square-count" className="controls__label">
            Squares
          </label>
          <input
            id="square-count"
            type="range"
            min="2"
            max="6"
            value={squareCount}
            onChange={handleSquareCountChange}
            className="controls__slider"
          />
          <span className="controls__value">{squareCount}</span>
        </div>

        <div className="controls__layout">
          <span className="controls__layout-label">Layout</span>
          <div className="controls__toggle-group">
            <button
              type="button"
              className={`controls__toggle${
                layout === LAYOUTS.HORIZONTAL ? ' controls__toggle--active' : ''
              }`}
              onClick={() => handleLayoutChange(LAYOUTS.HORIZONTAL)}
              aria-pressed={layout === LAYOUTS.HORIZONTAL}
            >
              Horizontal
            </button>
            <button
              type="button"
              className={`controls__toggle${
                layout === LAYOUTS.VERTICAL ? ' controls__toggle--active' : ''
              }`}
              onClick={() => handleLayoutChange(LAYOUTS.VERTICAL)}
              aria-pressed={layout === LAYOUTS.VERTICAL}
            >
              Vertical
            </button>
          </div>
        </div>

        <button onClick={handleReset} className="controls__button">
          Restart game
        </button>
      </section>

      <section className="status">
        <span
          className={`status__player ${PLAYER_STYLES[currentPlayer]}`}
        >
          {gameOver ? `Winner: Player ${winner}` : `Player ${currentPlayer}`}
        </span>
        <span className="status__message">{statusMessage}</span>
      </section>

      <div className="board">
        <svg
          viewBox={board.viewBox.asString}
          width={board.viewBox.width}
          height={board.viewBox.height}
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
                      onClick={() => handleSideClick(square.id, side)}
                    />
                  </g>
                )
              })}
            </g>
          ))}

          {connections.map((connection, index) => (
            <line
              key={`${connection.from.squareId}-${connection.from.side}-${index}`}
              x1={connection.start.x}
              y1={connection.start.y}
              x2={connection.end.x}
              y2={connection.end.y}
              className={`board__connection ${PLAYER_STYLES[connection.player]}`}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

export default App
