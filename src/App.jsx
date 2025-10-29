import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const SIDE_ORDER = ['top', 'right', 'bottom', 'left']
const SQUARE_SIZE = 120
const GAP = 150
const PADDING_X = 120
const PADDING_TOP = 100
const PADDING_BOTTOM = 100
const ROW_GAP = GAP
const MIN_SQUARES = 2
const MAX_SQUARES = 6
const INITIAL_STATUS = ''
const LAYOUTS = {
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
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
const GRID_CELL_SIZE = 8
const SQUARE_MARGIN = 16
const LINE_MARGIN = 16

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

function pointInsideSquare(point, square) {
  const epsilon = EPSILON * 10
  return (
    point.x > square.x + epsilon &&
    point.x < square.x + square.size - epsilon &&
    point.y > square.y + epsilon &&
    point.y < square.y + square.size - epsilon
  )
}

function segmentCrossesSquareInterior(p1, p2, square, allowedSquareIds) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y

  let t0 = 0
  let t1 = 1

  const edges = [
    [-dx, p1.x - square.x],
    [dx, square.x + square.size - p1.x],
    [-dy, p1.y - square.y],
    [dy, square.y + square.size - p1.y],
  ]

  for (const [p, q] of edges) {
    if (almostEqual(p, 0)) {
      if (q < 0) {
        return false
      }
      continue
    }

    const r = q / p

    if (p < 0) {
      if (r > t1) {
        return false
      }
      if (r > t0) {
        t0 = r
      }
    } else {
      if (r < t0) {
        return false
      }
      if (r < t1) {
        t1 = r
      }
    }
  }

  if (t0 > t1) {
    return false
  }

  const entryT = Math.max(t0, 0)
  const exitT = Math.min(t1, 1)

  if (exitT < 0 || entryT > 1) {
    return false
  }

  const midT = (entryT + exitT) / 2
  const midPoint = {
    x: p1.x + midT * dx,
    y: p1.y + midT * dy,
  }

  if (!pointInsideSquare(midPoint, square)) {
    return false
  }

  const interiorSpan = exitT - entryT
  if (allowedSquareIds.has(square.id) && interiorSpan <= 0.02) {
    return false
  }

  return true
}

function pathCrossesSquares(points, squares, fromSquareId, toSquareId) {
  const allowed = new Set()
  if (fromSquareId !== null && fromSquareId !== undefined) {
    allowed.add(fromSquareId)
  }
  if (toSquareId !== null && toSquareId !== undefined) {
    allowed.add(toSquareId)
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]
    const end = points[i + 1]

    for (const square of squares) {
      if (segmentCrossesSquareInterior(start, end, square, allowed)) {
        return true
      }
    }
  }

  return false
}

function pointInsideSquareWithMargin(point, square, margin) {
  return (
    point.x > square.x + margin &&
    point.x < square.x + square.size - margin &&
    point.y > square.y + margin &&
    point.y < square.y + square.size - margin
  )
}

function distancePointToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy

  if (almostEqual(lengthSquared, 0)) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }

  let t =
    ((point.x - a.x) * dx + (point.y - a.y) * dy) /
    lengthSquared

  t = Math.max(0, Math.min(1, t))

  const projection = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  }

  return Math.hypot(point.x - projection.x, point.y - projection.y)
}

function buildObstacleGrid(board, connections, cellSize = GRID_CELL_SIZE) {
  const cols = Math.max(1, Math.ceil(board.viewBox.width / cellSize))
  const rows = Math.max(1, Math.ceil(board.viewBox.height / cellSize))
  const grid = Array.from({ length: rows }, () => Array(cols).fill(false))
  const halfCell = cellSize / 2

  const segments = []
  connections.forEach((connection) => {
    const points =
      connection.points && connection.points.length >= 2
        ? connection.points
        : [connection.start, connection.end]

    for (let index = 0; index < points.length - 1; index += 1) {
      segments.push([points[index], points[index + 1]])
    }
  })

  for (let row = 0; row < rows; row += 1) {
    const cy = row * cellSize + halfCell

    for (let col = 0; col < cols; col += 1) {
      const cx = col * cellSize + halfCell
      const point = { x: cx, y: cy }

      if (
        board.squares.some((square) =>
          pointInsideSquareWithMargin(point, square, SQUARE_MARGIN),
        )
      ) {
        grid[row][col] = true
        continue
      }

      for (const [start, end] of segments) {
        if (distancePointToSegment(point, start, end) <= LINE_MARGIN) {
          grid[row][col] = true
          break
        }
      }
    }
  }

  return {
    grid,
    cols,
    rows,
    cellSize,
  }
}

function pointToCell(point, cellSize, cols, rows) {
  return {
    x: Math.min(cols - 1, Math.max(0, Math.floor(point.x / cellSize))),
    y: Math.min(rows - 1, Math.max(0, Math.floor(point.y / cellSize))),
  }
}

function canRouteBetweenSides(from, to, board, connections, obstacleField) {
  const field = obstacleField ?? buildObstacleGrid(board, connections)
  const { grid, cols, rows, cellSize } = field

  const startPoint = getMidpoint(board.squares, from.squareId, from.side)
  const endPoint = getMidpoint(board.squares, to.squareId, to.side)

  if (!startPoint || !endPoint) {
    return false
  }

  const startCell = pointToCell(startPoint, cellSize, cols, rows)
  const targetCell = pointToCell(endPoint, cellSize, cols, rows)

  const queue = [[startCell.x, startCell.y]]
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false))
  const parents = Array.from({ length: rows }, () => Array(cols).fill(null))
  visited[startCell.y][startCell.x] = true

  let head = 0

  while (head < queue.length) {
    const [cx, cy] = queue[head]
    head += 1

    if (cx === targetCell.x && cy === targetCell.y) {
      const pathCells = []
      let cursor = { x: cx, y: cy }

      while (cursor) {
        pathCells.push(cursor)
        cursor = parents[cursor.y][cursor.x]
      }

      pathCells.reverse()

      const pathPoints = [startPoint]
      for (let index = 1; index < pathCells.length - 1; index += 1) {
        const cell = pathCells[index]
        pathPoints.push({
          x: cell.x * cellSize + cellSize / 2,
          y: cell.y * cellSize + cellSize / 2,
        })
      }
      pathPoints.push(endPoint)

      if (
        !pathIntersectsExisting(pathPoints, connections) &&
        !pathCrossesSquares(pathPoints, board.squares, from.squareId, to.squareId)
      ) {
        return true
      }

      visited[cy][cx] = false
      continue
    }

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue
        }

        const nx = cx + dx
        const ny = cy + dy

        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
          continue
        }

        if (visited[ny][nx]) {
          continue
        }

        if (
          grid[ny][nx] &&
          !(nx === startCell.x && ny === startCell.y) &&
          !(nx === targetCell.x && ny === targetCell.y)
        ) {
          continue
        }

        visited[ny][nx] = true
        parents[ny][nx] = { x: cx, y: cy }
        queue.push([nx, ny])
      }
    }
  }

  if (hasVisibilityPath(from, to, board, connections)) {
    return true
  }

  return false
}

function hasVisibilityPath(from, to, board, connections) {
  const waypoints = buildVisibilityWaypoints(from, to, board)
  if (waypoints.length < 2) {
    return false
  }

  const adjacency = Array.from({ length: waypoints.length }, () => [])

  for (let i = 0; i < waypoints.length; i += 1) {
    for (let j = i + 1; j < waypoints.length; j += 1) {
      if (!segmentIsValid(waypoints[i], waypoints[j], board, connections)) {
        continue
      }

      adjacency[i].push(j)
      adjacency[j].push(i)
    }
  }

  const startIndex = 0
  const targetIndex = 1

  const queue = [startIndex]
  const visited = new Array(waypoints.length).fill(false)
  visited[startIndex] = true

  while (queue.length > 0) {
    const node = queue.shift()
    if (node === targetIndex) {
      return true
    }

    adjacency[node].forEach((neighbor) => {
      if (!visited[neighbor]) {
        visited[neighbor] = true
        queue.push(neighbor)
      }
    })
  }

  return false
}

function buildVisibilityWaypoints(from, to, board) {
  const waypoints = []
  const push = (point, squareId = null) => waypoints.push({ point, squareId })

  const startPoint = getMidpoint(board.squares, from.squareId, from.side)
  const endPoint = getMidpoint(board.squares, to.squareId, to.side)

  if (!startPoint || !endPoint) {
    return waypoints
  }

  push(startPoint, from.squareId)
  push(endPoint, to.squareId)

  const offset = SQUARE_MARGIN + LINE_MARGIN
  board.squares.forEach((square) => {
    const corners = [
      { x: square.x - offset, y: square.y - offset },
      { x: square.x + square.size + offset, y: square.y - offset },
      { x: square.x + square.size + offset, y: square.y + square.size + offset },
      { x: square.x - offset, y: square.y + square.size + offset },
    ]

    corners.forEach((corner) => {
      const clamped = {
        x: Math.min(Math.max(corner.x, 0), board.viewBox.width),
        y: Math.min(Math.max(corner.y, 0), board.viewBox.height),
      }
      push(clamped)
    })
  })

  const borderOffset = LINE_MARGIN * 2
  const borderPoints = [
    { x: borderOffset, y: borderOffset },
    { x: board.viewBox.width - borderOffset, y: borderOffset },
    { x: board.viewBox.width - borderOffset, y: board.viewBox.height - borderOffset },
    { x: borderOffset, y: board.viewBox.height - borderOffset },
  ]

  borderPoints.forEach((point) => push(point))

  return waypoints
}

function segmentIsValid(nodeA, nodeB, board, connections) {
  const points = [nodeA.point, nodeB.point]
  if (
    pathCrossesSquares(
      points,
      board.squares,
      nodeA.squareId ?? null,
      nodeB.squareId ?? null,
    )
  ) {
    return false
  }

  if (pathIntersectsExisting(points, connections)) {
    return false
  }

  return true
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

function hasAnyLegalMove(board, usedSides, connections, obstacleField) {
  const availableSides = listAvailableSides(board.squares, usedSides)
  const field = obstacleField ?? buildObstacleGrid(board, connections)

  for (let i = 0; i < availableSides.length; i += 1) {
    const from = availableSides[i]
    for (let j = i + 1; j < availableSides.length; j += 1) {
      const to = availableSides[j]

      if (from.squareId === to.squareId) {
        continue
      }

      if (
        canRouteBetweenSides(from, to, board, connections, field)
      ) {
        return true
      }
    }
  }

  return false
}

function App() {
  const [squareCount, setSquareCount] = useState(2)
  const [layout, setLayout] = useState(LAYOUTS.HORIZONTAL)
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return 'light'
    }
    try {
      const stored = window.localStorage.getItem('josephs-squares-theme')
      if (stored === 'light' || stored === 'dark') {
        return stored
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    } catch {
      return 'light'
    }
  })
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

  useEffect(() => {
    document.body.dataset.theme = theme
    try {
      window.localStorage.setItem('josephs-squares-theme', theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((previous) => (previous === 'light' ? 'dark' : 'light'))
  }

  const svgRef = useRef(null)

  const board = useMemo(
    () => createBoard(squareCount, layout),
    [squareCount, layout],
  )

  const obstacleField = useMemo(
    () => buildObstacleGrid(board, connections),
    [board, connections],
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

        if (
          canRouteBetweenSides(
            selectedSide,
            { squareId: square.id, side },
            board,
            connections,
            obstacleField,
          )
        ) {
          targets.add(key)
        }
      })
    })

    return targets
  }, [selectedSide, usedSides, board, connections, obstacleField])

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

    if (
      pathCrossesSquares(
        points,
        board.squares,
        selectedSide.squareId,
        targetSquareId,
      )
    ) {
      showMessage(MESSAGE_LEVELS.WARNING, 'Paths cannot pass through squares.')
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
    const updatedField = buildObstacleGrid(board, updatedConnections)
    const movesRemain = hasAnyLegalMove(
      board,
      updatedUsedSides,
      updatedConnections,
      updatedField,
    )

    if (!movesRemain && connections.length === 0) {
      setSelectedSide(null)
      setFreeformLine(null)
      showMessage(
        MESSAGE_LEVELS.WARNING,
        'Nice try, cheater. Try again!',
      )
      return false
    }

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

  const handleSidePointerDown = (squareId, side, event) => {
    if (gameOver) {
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
        <span
            className={badgeClass}
        >
          {gameOver
            ? `🏆 Player ${winner} wins!`
            : `Player ${currentPlayer} - ${statusMessage || 'pick a side'}`}
        </span>
          )
        })()}
      </div>

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
                      r={12}
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
