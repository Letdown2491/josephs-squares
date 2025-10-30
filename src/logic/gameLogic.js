import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_SHAPE_SEQUENCE,
  GAP,
  GRID_TARGET_PIXEL_SIZE,
  LINE_MARGIN_PX,
  MAX_COLUMNS,
  MAX_ROWS,
  MIN_GRID_CELL_SIZE,
  ROW_PRESETS,
  SHAPE_CONFIGS,
  SHAPE_SIZE,
  SIDE_ORDER,
  SQUARE_MARGIN_PX,
} from './constants.js'

export const EPSILON = 1e-6

export function almostEqual(a, b) {
  return Math.abs(a - b) < EPSILON
}

export function samePoint(p1, p2) {
  return almostEqual(p1.x, p2.x) && almostEqual(p1.y, p2.y)
}

export function orientation(a, b, c) {
  const value =
    (b.y - a.y) * (c.x - b.x) -
    (b.x - a.x) * (c.y - b.y)

  if (almostEqual(value, 0)) {
    return 0
  }

  return value > 0 ? 1 : 2
}

export function onSegment(a, b, c) {
  return (
    Math.min(a.x, c.x) - EPSILON <= b.x &&
    b.x <= Math.max(a.x, c.x) + EPSILON &&
    Math.min(a.y, c.y) - EPSILON <= b.y &&
    b.y <= Math.max(a.y, c.y) + EPSILON
  )
}

export function segmentsIntersectStrict(a1, a2, b1, b2) {
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

export function deriveGridMetrics(unitsPerPixel) {
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

export const DEFAULT_GRID_METRICS = deriveGridMetrics(1)

export function isDifferentSquare(sideA, sideB) {
  return sideA.squareId !== sideB.squareId
}

export function buildRowBreakdown(squareCount) {
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

export function createBoard(squareCount) {
  const rowBreakdown = buildRowBreakdown(squareCount)

  const rows = rowBreakdown.length || 1
  const boardWidth = BOARD_WIDTH
  const boardHeight = BOARD_HEIGHT
  const verticalSpacing =
    (boardHeight - rows * SHAPE_SIZE) / (rows + 1)

  const squares = []
  let idCounter = 0

  rowBreakdown.forEach((slotsInRow, rowIndex) => {
    const rowY =
      verticalSpacing * (rowIndex + 1) + rowIndex * SHAPE_SIZE
    const horizontalSpacing =
      (boardWidth - slotsInRow * SHAPE_SIZE) / (slotsInRow + 1)

    for (let colIndex = 0; colIndex < slotsInRow; colIndex += 1) {
      const x =
        horizontalSpacing * (colIndex + 1) +
        colIndex * SHAPE_SIZE
      const y = rowY
      const shapeConfig = SHAPE_CONFIGS[DEFAULT_SHAPE_SEQUENCE[0]]

      squares.push({
        id: idCounter,
        x,
        y,
        size: SHAPE_SIZE,
        type: shapeConfig.id,
        midpoints: shapeConfig.anchorFactory({ x, y, size: SHAPE_SIZE }),
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

export function getMidpoint(shapes, shapeId, side, offset = 0) {
  const shape = shapes.find((item) => item.id === shapeId)
  const base = shape?.midpoints[side]

  if (!base || !shape) {
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

export function getAnchorPoint(shapes, shapeId, side, metrics) {
  const offset = metrics?.lineMargin ?? 0
  return getMidpoint(shapes, shapeId, side, offset)
}

export function buildLine(shapes, from, to, metrics) {
  const start = getAnchorPoint(shapes, from.squareId, from.side, metrics)
  const end = getAnchorPoint(shapes, to.squareId, to.side, metrics)

  if (!start || !end) {
    return null
  }

  return { start, end }
}

export function distanceBetweenPoints(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function pointsToSegments(points) {
  const segments = []
  if (!points || points.length < 2) {
    return segments
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push([points[index], points[index + 1]])
  }

  return segments
}

export function pathCrossesSquares(points, squares, fromSquareId, toSquareId) {
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

export function pathTouchesMidpoints(
  points,
  shapes,
  startNode,
  endNode,
  metrics,
) {
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

  for (const shape of shapes) {
    for (const side of SIDE_ORDER) {
      const key = `${shape.id}:${side}`
      if (skipKeys.has(key)) {
        continue
      }

      const midpoint = getMidpoint(shapes, shape.id, side, 0)
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

export function pointInsideSquare(point, square) {
  const epsilon = EPSILON * 10
  return (
    point.x > square.x + epsilon &&
    point.x < square.x + square.size - epsilon &&
    point.y > square.y + epsilon &&
    point.y < square.y + square.size - epsilon
  )
}

export function segmentCrossesSquareInterior(p1, p2, square, allowedSquareIds) {
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

export function pointInsideSquareWithMargin(point, square, margin) {
  return (
    point.x > square.x + margin &&
    point.x < square.x + square.size - margin &&
    point.y > square.y + margin &&
    point.y < square.y + square.size - margin
  )
}

export function distancePointToSegment(point, a, b) {
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

export function buildObstacleGrid(board, connections, metrics) {
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

export function pointToCell(point, cellSize, cols, rows) {
  return {
    x: Math.min(cols - 1, Math.max(0, Math.floor(point.x / cellSize))),
    y: Math.min(rows - 1, Math.max(0, Math.floor(point.y / cellSize))),
  }
}

export function multiSourcePathExists(board, availableSides, field) {
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

export function canRouteBetweenSides(from, to, board, connections, obstacleField, metrics) {
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

  if (hasVisibilityPath(from, to, board, connections, activeMetrics)) {
    return true
  }

  return false
}

export function hasVisibilityPath(from, to, board, connections, metrics) {
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

export function buildVisibilityWaypoints(from, to, board, metrics) {
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

export function segmentIsValid(nodeA, nodeB, board, connections, metrics) {
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

export function pointsToPathData(points) {
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

export function dedupePoints(points) {
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

export function resampleSegments(points, maxSegmentLength = 6) {
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

export function pathIntersectsExisting(candidatePoints, connections) {
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

export function extractConnectionPoints(connection) {
  if (connection.points && connection.points.length >= 2) {
    return connection.points
  }

  if (connection.start && connection.end) {
    return [connection.start, connection.end]
  }

  return []
}

export function listAvailableSides(shapes, usedSides) {
  const available = []

  shapes.forEach((shape) => {
    SHAPE_CONFIGS[DEFAULT_SHAPE_SEQUENCE[0]].sides.forEach((side) => {
      const key = `${shape.id}:${side}`
      if (!usedSides.has(key)) {
        available.push({
          squareId: shape.id,
          side,
        })
      }
    })
  })

  return available
}

export function hasAnyLegalMove(board, usedSides, connections, obstacleField, metrics) {
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

function normalizeUsedSides(input) {
  if (input instanceof Set) {
    return input
  }
  return new Set(input ?? [])
}

export function computeAvailableTargets(board, connections, usedSidesInput, selectedSide, metrics) {
  if (!selectedSide) {
    return []
  }

  const usedSides = normalizeUsedSides(usedSidesInput)
  const field = buildObstacleGrid(board, connections, metrics)
  const targets = []

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
          field,
          metrics,
        )
      ) {
        targets.push(key)
      }
    })
  })

  return targets
}

export function evaluateRemainingMoves(board, connections, usedSidesInput, metrics) {
  const usedSides = normalizeUsedSides(usedSidesInput)
  const field = buildObstacleGrid(board, connections, metrics)
  const movesRemain = hasAnyLegalMove(board, usedSides, connections, field, metrics)
  return { movesRemain }
}
