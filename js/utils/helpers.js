/**
 * Generate a six-digit numeric room code.
 * Avoids weak-looking numbers such as 000000, 111111, or 123456.
 */
export function generateRoomCode() {
  let code = ''
  do {
    code = String(Math.floor(100000 + Math.random() * 900000))
  } while (isWeakRoomCode(code))
  return code
}

/**
 * Check whether a room code is too simple for player-facing use.
 */
export function isWeakRoomCode(code) {
  const value = String(code || '')
  if (!/^\d{6}$/.test(value)) return true
  if (/^(\d)\1{5}$/.test(value)) return true
  if (value === '123456' || value === '654321') return true
  return false
}

/**
 * Fisher-Yates shuffle. Returns a new array and does not mutate the source.
 * A custom random function can be injected for deterministic tests.
 */
export function shuffle(array = [], random = Math.random) {
  const result = array.slice()
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

/**
 * Seeded pseudo-random generator for reproducible card layouts.
 */
export function createSeededRandom(seed = Date.now()) {
  let value = Number(seed) || Date.now()
  return function seededRandom() {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

/**
 * Deep clone plain JSON-compatible data.
 * Suitable for room/game snapshots stored in cloud database.
 */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

/**
 * Debounce a function until calls stop for the given delay.
 */
export function debounce(fn, delay = 300) {
  let timer = null
  return function debounced(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * Throttle a function so it runs at most once per interval.
 * The final call is preserved and executed after the interval.
 */
export function throttle(fn, interval = 300) {
  let lastTime = 0
  let timer = null
  let lastArgs = null
  let lastThis = null

  return function throttled(...args) {
    const now = Date.now()
    const remaining = interval - (now - lastTime)
    lastArgs = args
    lastThis = this

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      lastTime = now
      fn.apply(lastThis, lastArgs)
      lastArgs = null
      lastThis = null
      return
    }

    if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now()
        timer = null
        fn.apply(lastThis, lastArgs)
        lastArgs = null
        lastThis = null
      }, remaining)
    }
  }
}

/**
 * Convert seconds to mm:ss format.
 */
export function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * Alias for code that uses duration wording.
 */
export const formatDuration = formatTime

/**
 * Random integer in the inclusive [min, max] range.
 */
export function randomInt(min, max) {
  const low = Math.ceil(Math.min(min, max))
  const high = Math.floor(Math.max(min, max))
  return Math.floor(Math.random() * (high - low + 1)) + low
}

/**
 * Random float in the [min, max) range.
 */
export function randomFloat(min, max) {
  return Math.random() * (max - min) + min
}

/**
 * Pick one random item from an array.
 */
export function randomPick(array = []) {
  if (!array.length) return undefined
  return array[randomInt(0, array.length - 1)]
}

/**
 * Clamp a number into a fixed range.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

/**
 * Linear interpolation between two values.
 */
export function lerp(start, end, progress) {
  return start + (end - start) * progress
}

/**
 * Distance between two points.
 */
export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Distance between two point objects: { x, y }.
 */
export function distanceBetween(pointA, pointB) {
  return distance(pointA.x, pointA.y, pointB.x, pointB.y)
}

/**
 * Test whether a point is inside a rectangle.
 */
export function pointInRect(x, y, rect) {
  return x >= rect.x &&
    y >= rect.y &&
    x <= rect.x + rect.width &&
    y <= rect.y + rect.height
}

/**
 * No-operation function for optional callbacks.
 */
export function noop() {}

export default {
  generateRoomCode,
  isWeakRoomCode,
  shuffle,
  createSeededRandom,
  deepClone,
  debounce,
  throttle,
  formatTime,
  formatDuration,
  randomInt,
  randomFloat,
  randomPick,
  clamp,
  lerp,
  distance,
  distanceBetween,
  pointInRect,
  noop
}
