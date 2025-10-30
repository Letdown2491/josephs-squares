import {
  computeAvailableTargets,
  evaluateRemainingMoves,
} from '../logic/gameLogic.js'

self.onmessage = ({ data }) => {
  const { id, type, payload } = data

  const respond = (result, error) => {
    self.postMessage({ id, result, error })
  }

  try {
    switch (type) {
      case 'computeAvailableTargets': {
        const { board, connections, usedSides, selectedSide, metrics } = payload
        const targets = computeAvailableTargets(
          board,
          connections,
          usedSides,
          selectedSide,
          metrics,
        )
        respond({ targets })
        break
      }
      case 'evaluateRemainingMoves': {
        const { board, connections, usedSides, metrics } = payload
        const outcome = evaluateRemainingMoves(
          board,
          connections,
          usedSides,
          metrics,
        )
        respond(outcome)
        break
      }
      default:
        throw new Error(`Unknown worker task: ${type}`)
    }
  } catch (error) {
    respond(
      null,
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) },
    )
  }
}

