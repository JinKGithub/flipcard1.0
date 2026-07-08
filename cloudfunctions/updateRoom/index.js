const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const rooms = db.collection('rooms')
const TURN_DURATION_MS = 15 * 1000

const CARD_IMAGES = Array.from({ length: 18 }, (_, index) => {
  return `assets/images/cards/card-${index + 1}.png`
})

const DIFFICULTY = {
  EASY: { key: 'EASY', rows: 4, cols: 4, pairCount: 8 },
  MEDIUM: { key: 'MEDIUM', rows: 6, cols: 4, pairCount: 12 },
  HARD: { key: 'HARD', rows: 6, cols: 6, pairCount: 18 }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const roomId = event.roomId || ''
  const action = event.action || ''

  if (!roomId) return fail('INVALID_ROOM_ID', 'ROOM_ID_REQUIRED')

  const room = await getRoom(roomId)
  if (!room) return fail('ROOM_NOT_FOUND', 'ROOM_NOT_FOUND')

  const role = resolveRole(room, openid)
  if (!role) return fail('NOT_IN_ROOM', 'NOT_IN_ROOM')

  if (action === 'getRoom') return success(room)
  if (action === 'setReady') return setReady(room, role, Boolean(event.ready))
  if (action === 'setDifficulty') return setDifficulty(room, role, event.difficulty || 'EASY')
  if (action === 'startGame') return startGame(room)
  if (action === 'updateGameState') return updateGameState(room, role, event.patch || {})

  return fail('UNKNOWN_ACTION', 'UNKNOWN_ACTION')
}

async function getRoom(roomId) {
  try {
    const result = await rooms.doc(roomId).get()
    return result.data
  } catch (error) {
    return null
  }
}

function resolveRole(room, openid) {
  if (room.hostId === openid) return 'host'
  if (room.guestId === openid) return 'guest'
  return ''
}

async function setReady(room, role, ready) {
  if (room.status === 'playing' || room.status === 'ended') {
    return fail('ROOM_ALREADY_STARTED', 'ROOM_ALREADY_STARTED')
  }

  const players = normalizePlayers(room.players)
  players[role] = {
    ...players[role],
    ready
  }

  const hostReady = Boolean(players.host && players.host.ready)
  const guestReady = Boolean(players.guest && players.guest.openid && players.guest.ready)
  const nextStatus = hostReady && guestReady ? 'countdown' : 'waiting'
  const data = {
    players,
    status: nextStatus,
    updateTime: Date.now()
  }

  if (nextStatus === 'countdown') {
    data.countdownStartTime = Date.now()
  } else {
    data.countdownStartTime = 0
  }

  await rooms.doc(room._id).update({ data })
  return success(await getRoom(room._id))
}

async function setDifficulty(room, role, difficulty) {
  if (role !== 'host') return fail('ONLY_HOST', 'ONLY_HOST')
  if (room.status === 'playing' || room.status === 'ended' || room.status === 'countdown') {
    return fail('ROOM_ALREADY_STARTED', 'ROOM_ALREADY_STARTED')
  }

  await rooms.doc(room._id).update({
    data: {
      difficulty,
      updateTime: Date.now()
    }
  })
  return success(await getRoom(room._id))
}

async function startGame(room) {
  const players = normalizePlayers(room.players)
  const hostReady = Boolean(players.host && players.host.ready)
  const guestReady = Boolean(players.guest && players.guest.openid && players.guest.ready)
  const seed = room.seed || Date.now() + Math.floor(Math.random() * 100000)
  const cards = generateCards(room.difficulty || 'EASY', seed)

  if (!hostReady || !guestReady) {
    return fail('NOT_READY', 'NOT_READY')
  }

  if (room.status === 'playing') return success(room)
  if (room.status === 'ended') return fail('ROOM_ENDED', 'ROOM_ENDED')

  const now = Date.now()
  const gameState = {
    ...(room.gameState || {}),
    currentPlayer: (room.gameState && room.gameState.currentPlayer) || randomRole(),
    flippedCards: [],
    matchedCount: 0,
    timer: 15,
    startTime: now,
    turnStartTime: now,
    turnDeadline: now + TURN_DURATION_MS,
    serverTime: now,
    turnVersion: 1,
    flipCount: 0,
    scores: {
      host: 0,
      guest: 0
    }
  }

  await rooms.doc(room._id).update({
    data: {
      status: 'playing',
      seed,
      cards,
      gameState,
      updateTime: Date.now()
    }
  })

  return success(await getRoom(room._id))
}

async function updateGameState(room, role, patch) {
  if (room.status !== 'playing' && patch.status !== 'ended') {
    return fail('ROOM_NOT_PLAYING', 'ROOM_NOT_PLAYING')
  }

  const latestRoom = await getRoom(room._id)
  if (latestRoom) {
    room = latestRoom
  }

  if (room.status !== 'playing' && patch.status !== 'ended') {
    return fail('ROOM_NOT_PLAYING', 'ROOM_NOT_PLAYING')
  }

  const safePatch = sanitizeGamePatch(room, patch)
  if (safePatch.__stale) {
    return success(room)
  }

  if (!Object.keys(safePatch).length) {
    return fail('EMPTY_PATCH', 'EMPTY_PATCH')
  }

  await rooms.doc(room._id).update({
    data: {
      ...safePatch,
      updateTime: Date.now()
    }
  })

  return success(await getRoom(room._id))
}

function sanitizeGamePatch(room, patch = {}) {
  const data = {}
  const previousGameState = room.gameState || {}
  const incomingGameState = patch.gameState && typeof patch.gameState === 'object'
    ? patch.gameState
    : null
  const incomingTurnVersion = Number(incomingGameState && incomingGameState.turnVersion || 0)
  const previousTurnVersion = Number(previousGameState.turnVersion || 0)
  const incomingFlipCount = Number(incomingGameState && incomingGameState.flipCount || 0)
  const previousFlipCount = Number(previousGameState.flipCount || 0)
  const incomingMatchedCount = Number(incomingGameState && incomingGameState.matchedCount || 0)
  const previousMatchedCount = Number(previousGameState.matchedCount || 0)
  const resetsTurn = Boolean(incomingGameState && incomingGameState.resetTurnTimer)
  const staleGameState = Boolean(incomingGameState && !resetsTurn && (
    (incomingTurnVersion && previousTurnVersion && incomingTurnVersion < previousTurnVersion) ||
    (incomingTurnVersion === previousTurnVersion && incomingFlipCount < previousFlipCount) ||
    incomingMatchedCount < previousMatchedCount
  ))

  if (staleGameState) {
    data.__stale = true
    return data
  }

  if (patch.status) data.status = patch.status
  if (Array.isArray(patch.cards)) data.cards = patch.cards
  if (patch.players && typeof patch.players === 'object') {
    data.players = {
      host: patch.players.host || {},
      guest: patch.players.guest || {}
    }
  }
  if (incomingGameState) {
    const now = Date.now()
    const previous = previousGameState
    const next = {
      ...incomingGameState,
      turnStartTime: previous.turnStartTime || now,
      turnDeadline: previous.turnDeadline || now + TURN_DURATION_MS,
      serverTime: previous.serverTime || now,
      turnVersion: previous.turnVersion || 1
    }

    if (incomingGameState.resetTurnTimer) {
      next.turnStartTime = now
      next.turnDeadline = now + TURN_DURATION_MS
      next.serverTime = now
      next.turnVersion = (previous.turnVersion || 0) + 1
    }
    delete next.resetTurnTimer
    data.gameState = next
  }

  return data
}

function normalizePlayers(players = {}) {
  return {
    host: players.host || {},
    guest: players.guest || {}
  }
}

function randomRole() {
  return Math.random() > 0.5 ? 'host' : 'guest'
}

function generateCards(difficultyKey, seed) {
  const config = DIFFICULTY[String(difficultyKey || 'EASY').toUpperCase()] || DIFFICULTY.EASY
  const selectedImages = shuffle(CARD_IMAGES, seed).slice(0, config.pairCount)
  const cards = []

  selectedImages.forEach((imageUrl, index) => {
    const pairId = `pair_${index + 1}`
    cards.push({
      id: `card_${index + 1}_a`,
      pairId,
      imageUrl,
      state: 'hidden'
    })
    cards.push({
      id: `card_${index + 1}_b`,
      pairId,
      imageUrl,
      state: 'hidden'
    })
  })

  return shuffle(cards, seed).map((card, index) => ({
    ...card,
    position: {
      row: Math.floor(index / config.cols),
      col: index % config.cols
    }
  }))
}

function shuffle(items, seed) {
  const result = items.slice()
  const random = createSeededRandom(seed)

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    const temp = result[index]
    result[index] = result[randomIndex]
    result[randomIndex] = temp
  }

  return result
}

function createSeededRandom(seed) {
  let value = Number(seed) || 1

  return function random() {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

function success(room) {
  return {
    success: true,
    room
  }
}

function fail(code, message) {
  return {
    success: false,
    code,
    message
  }
}
