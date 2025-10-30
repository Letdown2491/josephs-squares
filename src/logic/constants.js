export const SIDE_ORDER = ['top', 'right', 'bottom', 'left']

export const MIN_SQUARES = 2
export const MAX_SQUARES = 6

export const SHAPE_TYPES = {
  SQUARE: 'square',
}

export const SHAPE_CONFIGS = {
  [SHAPE_TYPES.SQUARE]: {
    id: SHAPE_TYPES.SQUARE,
    displayName: 'Square',
    size: 200,
    anchorFactory: ({ x, y, size }) => {
      const half = size / 2
      return {
        top: { x: x + half, y },
        right: { x: x + size, y: y + half },
        bottom: { x: x + half, y: y + size },
        left: { x, y: y + half },
      }
    },
    outlineFactory: ({ size }) => ({ width: size, height: size, rotation: 0 }),
    sides: ['top', 'right', 'bottom', 'left'],
  },
}

export const DEFAULT_SHAPE_SEQUENCE = [SHAPE_TYPES.SQUARE]

const BASE_SHAPE = SHAPE_CONFIGS[SHAPE_TYPES.SQUARE]
export const SHAPE_SIZE = BASE_SHAPE.size
export const GAP = 480
export const MAX_COLUMNS = 3
export const MAX_ROWS = 2
export const BOARD_WIDTH = MAX_COLUMNS * SHAPE_SIZE + (MAX_COLUMNS + 1) * GAP
export const BOARD_HEIGHT = MAX_ROWS * SHAPE_SIZE + (MAX_ROWS + 1) * GAP

export const ROW_PRESETS = {
  2: [2],
  3: [2, 1],
  4: [2, 2],
  5: [3, 2],
  6: [3, 3],
}

export const GRID_TARGET_PIXEL_SIZE = 4
export const LINE_MARGIN_PX = 12
export const SQUARE_MARGIN_PX = 12
export const MIN_GRID_CELL_SIZE = 4

export const VALIDATION_SEGMENT_LENGTH = 6

