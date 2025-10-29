import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const SIDE_ORDER = ['top', 'right', 'bottom', 'left']
const MIN_SQUARES = 2
const MAX_SQUARES = 6
const SQUARE_SIZE = 200
const GAP = 480
const MAX_COLUMNS = 3
const MAX_ROWS = 2
const BOARD_WIDTH =
  MAX_COLUMNS * SQUARE_SIZE + (MAX_COLUMNS + 1) * GAP
const BOARD_HEIGHT =
  MAX_ROWS * SQUARE_SIZE + (MAX_ROWS + 1) * GAP
const INITIAL_STATUS = ''
const FREEFORM_MIN_SEGMENT = 4
const VALIDATION_SEGMENT_LENGTH = 6

const PLAYER_STYLES = {
  A: 'player-a',
  B: 'player-b',
}
const MESSAGE_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
}
const MESSAGE_TIMEOUT = 3000
const GRID_TARGET_PIXEL_SIZE = 4
const LINE_MARGIN_PX = 12
const SQUARE_MARGIN_PX = 12
const MIN_GRID_CELL_SIZE = 4

const ROW_PRESETS = {
  2: [2],
  3: [2, 1],
  4: [2, 2],
  5: [3, 2],
  6: [3, 3],
}

function deriveGridMetrics(unitsPerPixel) {
  const scale =
    Number.isFinite(unitsPerPixel) && unitsPerPixel > 0 ? unitsPerPixel : 1

  const cellSize = Math.max(
    MIN_GRID_CELL_SIZE,
    scale * GRID_TARGET_PIXEL_SIZE,
  )

  const squareMargin = scale * SQUARE_MARGIN_PX
  const lineMargin = scale * LINE_MARGIN_PX

  return {
    cellSize,
    squareMargin,
    lineMargin,
  }
}

const DEFAULT_GRID_METRICS = deriveGridMetrics(1)

function isDifferentSquare(sideA, sideB) {
  return sideA.squareId !== sideB.squareId
}

function multiSourcePathExists(board, availableSides, field) {
  const { grid, cols, rows, cellSize, lineMargin } = field
  const startCellOwners = new Map()
  const visited = Array.from({ length: rows }, () => new Uint16Array(cols))
  const queue = []

  for (let index = 0; index < availableSides.length; index += 1) {
    const side = availableSides[index]
    const midpoint = getAnchorPoint(
      board.squares,
      side.squareId,
      side.side,
      { lineMargin },
    )
    if (!midpoint) {
      continue
    }

    const cell = pointToCell(midpoint, cellSize, cols, rows)
    const key = cell.y * cols + cell.x
    const owners = startCellOwners.get(key)

    if (owners) {
      owners.push(index)
    } else {
      startCellOwners.set(key, [index])
    }

    const previous = visited[cell.y][cell.x]
    if (previous !== 0) {
      const otherIndex = previous - 1
      if (isDifferentSquare(side, availableSides[otherIndex])) {
        return true
      }
      continue
    }

    visited[cell.y][cell.x] = index + 1
    queue.push({ x: cell.x, y: cell.y, origin: index })
  }

  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]

  let head = 0
  while (head < queue.length) {
    const { x, y, origin } = queue[head]
    head += 1

    for (const [dx, dy] of directions) {
      const nx = x + dx
      const ny = y + dy

      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
        continue
      }

      const key = ny * cols + nx
      const isOriginCell = startCellOwners.has(key)

      if (grid[ny][nx] && !isOriginCell) {
        continue
      }

      if (dx !== 0 && dy !== 0) {
        const orthAKey = y * cols + nx
        const orthBKey = ny * cols + x
        const orthABlocked = grid[y][nx]
        const orthBBlocked = grid[ny][x]
        const orthAOrigin = startCellOwners.has(orthAKey)
        const orthBOrigin = startCellOwners.has(orthBKey)

        if ((orthABlocked && !orthAOrigin) || (orthBBlocked && !orthBOrigin)) {
          continue
        }
      }

      const previous = visited[ny][nx]
      if (previous === 0) {
        visited[ny][nx] = origin + 1
        queue.push({ x: nx, y: ny, origin })
        continue
      }

      if (previous === origin + 1) {
        continue
      }

      const otherIndex = previous - 1
      if (isDifferentSquare(availableSides[origin], availableSides[otherIndex])) {
        return true
      }
    }
  }

  return false
}

function buildRowBreakdown(squareCount) {
  if (ROW_PRESETS[squareCount]) {
    return ROW_PRESETS[squareCount]
  }

  const breakdown = []
  const maxPerRow = Math.min(MAX_COLUMNS, squareCount)
  let remaining = squareCount

  while (remaining > 0) {
    const slotsInRow = Math.min(maxPerRow, remaining)
    breakdown.push(slotsInRow)
    remaining -= slotsInRow
  }

  return breakdown
}

function createBoard(squareCount) {
  const rowBreakdown = buildRowBreakdown(squareCount)

  const rows = rowBreakdown.length || 1
  const boardWidth = BOARD_WIDTH
  const boardHeight = BOARD_HEIGHT
  const verticalSpacing =
    (boardHeight - rows * SQUARE_SIZE) / (rows + 1)

  const squares = []
  let idCounter = 0

  rowBreakdown.forEach((slotsInRow, rowIndex) => {
    const rowY =
      verticalSpacing * (rowIndex + 1) + rowIndex * SQUARE_SIZE
    const horizontalSpacing =
      (boardWidth - slotsInRow * SQUARE_SIZE) / (slotsInRow + 1)

    for (let colIndex = 0; colIndex < slotsInRow; colIndex += 1) {
      const x =
        horizontalSpacing * (colIndex + 1) +
        colIndex * SQUARE_SIZE
      const y = rowY
      const half = SQUARE_SIZE / 2

      squares.push({
        id: idCounter,
        x,
        y,
        size: SQUARE_SIZE,
        midpoints: {
          top: { x: x + half, y },
          right: { x: x + SQUARE_SIZE, y: y + half },
          bottom: { x: x + half, y: y + SQUARE_SIZE },
          left: { x, y: y + half },
        },
      })

      idCounter += 1
    }
  })

  return {
    squares,
    viewBox: {
      width: boardWidth,
      height: boardHeight,
      asString: `0 0 ${boardWidth} ${boardHeight}`,
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

function getMidpoint(squares, squareId, side, offset = 0) {
  const square = squares.find((item) => item.id === squareId)
  const base = square?.midpoints[side]

  if (!base || !square) {
    return null
  }

  if (offset <= 0) {
    return base
  }

  switch (side) {
    case 'top':
      return { x: base.x, y: base.y - offset }
    case 'right':
      return { x: base.x + offset, y: base.y }
    case 'bottom':
      return { x: base.x, y: base.y + offset }
    case 'left':
      return { x: base.x - offset, y: base.y }
    default:
      return base
  }
}

function getAnchorPoint(squares, squareId, side, metrics) {
  const offset = metrics?.lineMargin ?? 0
  return getMidpoint(squares, squareId, side, offset)
}

function buildLine(squares, from, to, metrics) {
  const start = getAnchorPoint(squares, from.squareId, from.side, metrics)
  const end = getAnchorPoint(squares, to.squareId, to.side, metrics)

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

function pathTouchesMidpoints(points, squares, startNode, endNode, metrics) {
  if (!points || points.length < 2) {
    return false
  }

  const activeMetrics = metrics ?? DEFAULT_GRID_METRICS
  const limit = activeMetrics.lineMargin
  const segments = pointsToSegments(points)

  const skipKeys = new Set()
  if (startNode) {
    skipKeys.add(`${startNode.squareId ?? ''}:${startNode.side ?? ''}`)
  }
  if (endNode) {
    skipKeys.add(`${endNode.squareId ?? ''}:${endNode.side ?? ''}`)
  }

  for (const square of squares) {
    for (const side of SIDE_ORDER) {
      const key = `${square.id}:${side}`
      if (skipKeys.has(key)) {
        continue
      }

      const midpoint = getMidpoint(squares, square.id, side, 0)
      if (!midpoint) {
        continue
      }

      for (const [start, end] of segments) {
        if (distancePointToSegment(midpoint, start, end) <= limit) {
          return true
        }
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

function buildObstacleGrid(board, connections, metrics) {
  const activeMetrics = metrics ?? DEFAULT_GRID_METRICS
  const { cellSize, squareMargin, lineMargin } = activeMetrics

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

  const midpointEntries = []
  board.squares.forEach((square) => {
    SIDE_ORDER.forEach((side) => {
      const midpoint = getMidpoint(board.squares, square.id, side, 0)
      if (midpoint) {
        midpointEntries.push({ squareId: square.id, side, point: midpoint })
      }
    })
  })

  for (let row = 0; row < rows; row += 1) {
    const cy = row * cellSize + halfCell

    for (let col = 0; col < cols; col += 1) {
      const cx = col * cellSize + halfCell
      const point = { x: cx, y: cy }

      if (
        board.squares.some((square) =>
          pointInsideSquareWithMargin(point, square, squareMargin),
        )
      ) {
        grid[row][col] = true
        continue
      }

      let blockedByMidpoint = false
      for (const midpoint of midpointEntries) {
        const distance = Math.hypot(point.x - midpoint.point.x, point.y - midpoint.point.y)
        if (distance <= lineMargin) {
          blockedByMidpoint = true
          break
        }
      }

      if (blockedByMidpoint) {
        grid[row][col] = true
        continue
      }

      for (const [start, end] of segments) {
        if (distancePointToSegment(point, start, end) <= lineMargin) {
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
    squareMargin,
    lineMargin,
  }
}

function pointToCell(point, cellSize, cols, rows) {
  return {
    x: Math.min(cols - 1, Math.max(0, Math.floor(point.x / cellSize))),
    y: Math.min(rows - 1, Math.max(0, Math.floor(point.y / cellSize))),
  }
}

function canRouteBetweenSides(from, to, board, connections, obstacleField, metrics) {
  const field = obstacleField ?? buildObstacleGrid(board, connections, metrics)
  const { grid, cols, rows, cellSize, lineMargin } = field

  const activeMetrics = metrics ?? { lineMargin }
  const startPoint = getAnchorPoint(board.squares, from.squareId, from.side, activeMetrics)
  const endPoint = getAnchorPoint(board.squares, to.squareId, to.side, activeMetrics)

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

      const validationPath = resampleSegments(pathPoints)

      if (
        !pathIntersectsExisting(validationPath, connections) &&
        !pathCrossesSquares(
          validationPath,
          board.squares,
          from.squareId,
          to.squareId,
        ) &&
        !pathTouchesMidpoints(
          validationPath,
          board.squares,
          from,
          to,
          activeMetrics,
        )
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

        if (dx !== 0 && dy !== 0) {
          const orthBlockedA =
            grid[cy][nx] && !(nx === startCell.x && cy === startCell.y) && !(nx === targetCell.x && cy === targetCell.y)
          const orthBlockedB =
            grid[ny][cx] && !(cx === startCell.x && ny === startCell.y) && !(cx === targetCell.x && ny === targetCell.y)

          if (orthBlockedA || orthBlockedB) {
            continue
          }
        }

        visited[ny][nx] = true
        parents[ny][nx] = { x: cx, y: cy }
        queue.push([nx, ny])
      }
    }
  }

  if (hasVisibilityPath(from, to, board, connections, metrics)) {
    return true
  }

  return false
}

function hasVisibilityPath(from, to, board, connections, metrics) {
  const waypoints = buildVisibilityWaypoints(from, to, board, metrics)
  if (waypoints.length < 2) {
    return false
  }

  const adjacency = Array.from({ length: waypoints.length }, () => [])

  for (let i = 0; i < waypoints.length; i += 1) {
    for (let j = i + 1; j < waypoints.length; j += 1) {
      if (
        !segmentIsValid(
          waypoints[i],
          waypoints[j],
          board,
          connections,
          metrics,
        )
      ) {
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

function buildVisibilityWaypoints(from, to, board, metrics) {
  const activeMetrics = metrics ?? DEFAULT_GRID_METRICS
  const offset = activeMetrics.squareMargin + activeMetrics.lineMargin
  const borderOffset = activeMetrics.lineMargin * 2

  const waypoints = []
  const push = (point, squareId = null) => waypoints.push({ point, squareId })

  const startPoint = getAnchorPoint(board.squares, from.squareId, from.side, activeMetrics)
  const endPoint = getAnchorPoint(board.squares, to.squareId, to.side, activeMetrics)

  if (!startPoint || !endPoint) {
    return waypoints
  }

  push(startPoint, from.squareId)
  push(endPoint, to.squareId)

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

  const borderPoints = [
    { x: borderOffset, y: borderOffset },
    { x: board.viewBox.width - borderOffset, y: borderOffset },
    { x: board.viewBox.width - borderOffset, y: board.viewBox.height - borderOffset },
    { x: borderOffset, y: board.viewBox.height - borderOffset },
  ]

  borderPoints.forEach((point) => push(point))

  return waypoints
}

function segmentIsValid(nodeA, nodeB, board, connections, metrics) {
  const points = resampleSegments([nodeA.point, nodeB.point])
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

  if (pathTouchesMidpoints(points, board.squares, nodeA, nodeB, metrics)) {
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

function resampleSegments(points, maxSegmentLength = VALIDATION_SEGMENT_LENGTH) {
  if (!points || points.length < 2) {
    return points
  }

  const resampled = [points[0]]

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const segmentLength = Math.hypot(dx, dy)

    if (segmentLength <= maxSegmentLength) {
      resampled.push(end)
      continue
    }

    const steps = Math.max(1, Math.ceil(segmentLength / maxSegmentLength))

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      resampled.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
      })
    }
  }

  return resampled
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

function hasAnyLegalMove(board, usedSides, connections, obstacleField, metrics) {
  const availableSides = listAvailableSides(board.squares, usedSides)
  if (availableSides.length < 2) {
    return false
  }

  const field = obstacleField ?? buildObstacleGrid(board, connections, metrics)

  if (multiSourcePathExists(board, availableSides, field)) {
    return true
  }

  for (let i = 0; i < availableSides.length; i += 1) {
    const from = availableSides[i]
    for (let j = i + 1; j < availableSides.length; j += 1) {
      const to = availableSides[j]

      if (!isDifferentSquare(from, to)) {
        continue
      }

      if (hasVisibilityPath(from, to, board, connections, metrics)) {
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
  const pendingCheckTimeoutRef = useRef()
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

  const obstacleField = useMemo(
    () => buildObstacleGrid(board, connections, gridMetrics),
    [board, connections, gridMetrics],
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
            gridMetrics,
          )
        ) {
          targets.add(key)
        }
      })
    })

    return targets
  }, [selectedSide, usedSides, board, connections, obstacleField, gridMetrics])

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

    if (pendingCheckTimeoutRef.current) {
      clearTimeout(pendingCheckTimeoutRef.current)
    }

    pendingCheckTimeoutRef.current = setTimeout(() => {
      try {
        const updatedField = buildObstacleGrid(
          board,
          updatedConnections,
          gridMetrics,
        )
        const movesRemain = hasAnyLegalMove(
          board,
          updatedUsedSides,
          updatedConnections,
          updatedField,
          gridMetrics,
        )

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
      } finally {
        setIsCheckingMoves(false)
        pendingCheckTimeoutRef.current = null
      }
    }, 0)

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
    if (pendingCheckTimeoutRef.current) {
      clearTimeout(pendingCheckTimeoutRef.current)
      pendingCheckTimeoutRef.current = null
    }
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
            <span
              className={badgeClass}
            >
              {gameOver
                ? `🏆 Player ${winner} wins!`
                : `Player ${currentPlayer} - ${statusMessage || 'pick a side'}`}
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
