const crypto = require('crypto')

const OPEN = 1
const PLAYER_ROLES = ['host', 'guest']
const DIFFICULTY_CONFIG = {
  EASY: { key: 'EASY', rows: 4, cols: 4, pairCount: 8 },
  MEDIUM: { key: 'MEDIUM', rows: 6, cols: 4, pairCount: 12 },
  HARD: { key: 'HARD', rows: 6, cols: 6, pairCount: 18 }
}
const DIFFICULTIES = Object.keys(DIFFICULTY_CONFIG)
const TURN_DURATION_MS = 15 * 1000
const CARD_IMAGES = Array.from({ length: 18 }, (_, index) => {
  return `assets/images/cards/card-${index + 1}.png`
})

function createRoomStore(options = {}) {
  const clientTimeoutMs = Number(options.clientTimeoutMs || 30000)
  const rooms = new Map()
  const clients = new Map()

  function addClient(socket, request) {
    const socketId = createId('sock')
    const client = {
      socketId,
      socket,
      request,
      roomId: '',
      role: '',
      openid: '',
      joinedAt: Date.now(),
      lastActiveAt: Date.now()
    }

    clients.set(socketId, client)
    return client
  }

  function removeClient(socketId) {
    const client = clients.get(socketId)
    if (!client) return

    clients.delete(socketId)

    if (!client.roomId) return
    const room = rooms.get(client.roomId)
    if (!room) return

    room.clients.delete(socketId)
    markPlayerOnline(room, client.role, false, '')
    if (room.status === 'playing') {
      markForfeit(room, client.role)
    }
    room.updatedAt = Date.now()

    broadcast(room, {
      type: 'playerOffline',
      roomId: room.roomId,
      from: getSender(client),
      actionSeq: bumpActionSeq(room),
      payload: {
        role: client.role,
        players: room.players,
        status: room.status,
        room: toClientRoom(room)
      }
    })

    if (room.clients.size === 0 && room.status !== 'playing') {
      rooms.delete(room.roomId)
    }
  }

  function handleMessage(client, message = {}) {
    client.lastActiveAt = Date.now()

    switch (message.type) {
      case 'hello':
        send(client, {
          type: 'helloAck',
          requestId: message.requestId,
          payload: {
            socketId: client.socketId
          }
        })
        return
      case 'ping':
        send(client, {
          type: 'pong',
          requestId: message.requestId,
          payload: {
            clientTime: message.payload && message.payload.time,
            serverTime: Date.now()
          }
        })
        return
      case 'joinRoom':
        joinRoom(client, message)
        return
      case 'leaveRoom':
        leaveRoom(client, message)
        return
      case 'playerReady':
        playerReady(client, message)
        return
      case 'difficultyChange':
        difficultyChange(client, message)
        return
      case 'gameStart':
        gameStart(client, message)
        return
      case 'flipCard':
        flipCard(client, message)
        return
      case 'turnResult':
        turnResult(client, message)
        return
      case 'gameStateUpdate':
        gameStateUpdate(client, message)
        return
      case 'requestSnapshot':
        sendSnapshot(client, message.requestId)
        return
      case 'broadcast':
        relayBroadcast(client, message)
        return
      default:
        sendError(client, 'UNKNOWN_MESSAGE', 'Unknown message type.', message.requestId)
    }
  }

  function joinRoom(client, message) {
    const payload = message.payload || {}
    const roomData = payload.room || {}
    const player = payload.player || {}
    const roomId = message.roomId || roomData._id || roomData.roomId || ''
    const roomCode = message.roomCode || roomData.roomCode || ''
    const role = normalizeRole(message.role || payload.role)

    if (!roomId && !roomCode) {
      sendError(client, 'ROOM_REQUIRED', 'roomId or roomCode is required.', message.requestId)
      return
    }

    if (!role) {
      sendError(client, 'ROLE_REQUIRED', 'Valid player role is required.', message.requestId)
      return
    }

    const key = roomId || `code:${roomCode}`
    let room = rooms.get(key)

    if (!room) {
      room = createRoomSession({
        ...roomData,
        roomId: key,
        _id: roomId || key,
        roomCode
      })
      rooms.set(room.roomId, room)
    } else if (roomData && Object.keys(roomData).length) {
      mergeRoom(room, roomData)
    }

    client.roomId = room.roomId
    client.role = role
    client.openid = message.openid || player.openid || getPlayer(room, role).openid || ''
    room.clients.set(client.socketId, client)
    room.updatedAt = Date.now()

    const previous = getPlayer(room, role)
    room.players[role] = {
      ...previous,
      ...player,
      openid: client.openid || player.openid || previous.openid || '',
      online: true,
      socketId: client.socketId
    }

    sendSnapshot(client, message.requestId)
    broadcast(room, {
      type: 'playerJoined',
      roomId: room.roomId,
      from: getSender(client),
      payload: {
        role,
        players: room.players,
        status: room.status
      }
    }, { except: client.socketId })
  }

  function leaveRoom(client, message) {
    const room = getClientRoom(client)
    if (!room) return

    markPlayerOnline(room, client.role, false, '')
    room.clients.delete(client.socketId)
    if (room.status === 'playing') {
      markForfeit(room, client.role)
    }
    room.updatedAt = Date.now()

    broadcast(room, {
      type: 'playerLeave',
      requestId: message.requestId,
      roomId: room.roomId,
      from: getSender(client),
      actionSeq: bumpActionSeq(room),
      payload: {
        role: client.role,
        players: room.players,
        status: room.status,
        room: toClientRoom(room)
      }
    })

    client.roomId = ''
    client.role = ''
  }

  function playerReady(client, message) {
    const room = requireRoom(client, message.requestId)
    if (!room) return

    const ready = Boolean(message.payload && message.payload.ready)
    room.players[client.role] = {
      ...getPlayer(room, client.role),
      ready
    }

    const hostReady = Boolean(room.players.host && room.players.host.ready)
    const guestReady = Boolean(room.players.guest && room.players.guest.openid && room.players.guest.ready)
    room.status = hostReady && guestReady ? 'countdown' : 'waiting'
    room.countdownStartTime = room.status === 'countdown' ? Date.now() : 0
    room.updatedAt = Date.now()

    broadcastRoomState(room, client, message.requestId)

    if (room.status === 'countdown') {
      broadcast(room, {
        type: 'countdownStart',
        roomId: room.roomId,
        from: getSender(client),
        payload: {
          countdownStartTime: room.countdownStartTime,
          status: room.status
        }
      })
    }
  }

  function difficultyChange(client, message) {
    const room = requireRoom(client, message.requestId)
    if (!room) return

    if (client.role !== 'host') {
      sendError(client, 'ONLY_HOST', 'Only host can change difficulty.', message.requestId)
      return
    }

    if (['countdown', 'playing', 'ended'].includes(room.status)) {
      sendError(client, 'ROOM_ALREADY_STARTED', 'Room has already started.', message.requestId)
      return
    }

    const difficulty = String(message.payload && message.payload.difficulty || '').toUpperCase()
    if (!DIFFICULTIES.includes(difficulty)) {
      sendError(client, 'INVALID_DIFFICULTY', 'Invalid difficulty.', message.requestId)
      return
    }

    room.difficulty = difficulty
    room.updatedAt = Date.now()
    broadcastRoomState(room, client, message.requestId)
  }

  function gameStart(client, message) {
    const room = requireRoom(client, message.requestId)
    if (!room) return

    if (room.status === 'ended') {
      sendError(client, 'ROOM_ENDED', 'Room has ended.', message.requestId)
      return
    }

    const players = normalizePlayers(room.players)
    const hostReady = Boolean(players.host && players.host.ready)
    const guestReady = Boolean(players.guest && players.guest.openid && players.guest.ready)

    if (!hostReady || !guestReady) {
      sendError(client, 'NOT_READY', 'Both players must be ready.', message.requestId)
      return
    }

    if (room.status !== 'playing' || !room.cards.length) {
      const now = Date.now()
      const seed = room.seed || now + Math.floor(Math.random() * 100000)

      room.seed = seed
      room.cards = generateCards(room.difficulty || 'EASY', seed)
      room.status = 'playing'
      room.countdownStartTime = 0
      room.gameState = {
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
        },
        actionSeq: Number(room.gameState && room.gameState.actionSeq || 0)
      }
    }

    room.status = 'playing'
    room.updatedAt = Date.now()
    room.gameState.actionSeq = Number(room.gameState.actionSeq || 0)

    broadcast(room, {
      type: 'gameStart',
      requestId: message.requestId,
      roomId: room.roomId,
      from: getSender(client),
      actionSeq: bumpActionSeq(room),
      payload: {
        room: toClientRoom(room)
      }
    })
  }

  function flipCard(client, message) {
    const room = requireRoom(client, message.requestId)
    if (!room) return

    if (room.status !== 'playing') {
      sendError(client, 'ROOM_NOT_PLAYING', 'Room is not playing.', message.requestId)
      return
    }

    const cardId = message.payload && message.payload.cardId
    if (!cardId) {
      sendError(client, 'CARD_REQUIRED', 'cardId is required.', message.requestId)
      return
    }

    const state = message.payload.state || 'revealed'
    const card = room.cards.find((item) => item.id === cardId)
    if (card) card.state = state

    room.gameState.flippedCards = Array.isArray(message.payload.flippedCards)
      ? message.payload.flippedCards
      : unique([...(room.gameState.flippedCards || []), cardId])
    room.gameState.flipCount = Number(message.payload.flipCount || room.gameState.flipCount || 0)
    room.updatedAt = Date.now()

    broadcast(room, {
      type: 'flipCard',
      requestId: message.requestId,
      roomId: room.roomId,
      from: getSender(client),
      actionSeq: bumpActionSeq(room),
      payload: {
        cardId,
        state,
        flippedCards: room.gameState.flippedCards,
        flipCount: room.gameState.flipCount
      }
    })
  }

  function turnResult(client, message) {
    const room = requireRoom(client, message.requestId)
    if (!room) return

    const payload = message.payload || {}
    if (payload.room) {
      mergeRoom(room, payload.room)
    } else {
      if (Array.isArray(payload.cards)) {
        payload.cards.forEach((cardId) => {
          const card = room.cards.find((item) => item.id === cardId)
          if (card) card.state = payload.matched ? 'matched' : 'hidden'
        })
      }
      room.gameState = {
        ...room.gameState,
        ...(payload.gameState || {}),
        scores: payload.scores || room.gameState.scores,
        currentPlayer: payload.currentPlayer || room.gameState.currentPlayer,
        matchedCount: Number(payload.matchedCount || room.gameState.matchedCount || 0),
        flippedCards: []
      }
    }

    room.updatedAt = Date.now()
    broadcast(room, {
      type: 'turnResult',
      requestId: message.requestId,
      roomId: room.roomId,
      from: getSender(client),
      actionSeq: bumpActionSeq(room),
      payload: {
        ...payload,
        room: toClientRoom(room)
      }
    })
  }

  function gameStateUpdate(client, message) {
    const room = requireRoom(client, message.requestId)
    if (!room) return

    const payload = message.payload || {}
    const roomPatch = payload.room || payload.patch || {}
    mergeRoom(room, roomPatch)
    room.updatedAt = Date.now()

    broadcast(room, {
      type: 'gameStateUpdate',
      requestId: message.requestId,
      roomId: room.roomId,
      from: getSender(client),
      actionSeq: bumpActionSeq(room),
      payload: {
        room: toClientRoom(room)
      }
    })
  }

  function relayBroadcast(client, message) {
    const room = requireRoom(client, message.requestId)
    if (!room) return

    const payload = message.payload || {}
    if (payload.room) {
      mergeRoom(room, payload.room)
      payload.room = toClientRoom(room)
    }

    broadcast(room, {
      type: payload.type ? payload.type : 'broadcast',
      requestId: message.requestId,
      roomId: room.roomId,
      from: getSender(client),
      actionSeq: bumpActionSeq(room),
      payload
    })
  }

  function broadcastRoomState(room, client, requestId) {
    broadcast(room, {
      type: 'roomState',
      requestId,
      roomId: room.roomId,
      from: getSender(client),
      payload: {
        room: toClientRoom(room),
        players: room.players,
        status: room.status,
        difficulty: room.difficulty,
        countdownStartTime: room.countdownStartTime || 0
      }
    })
  }

  function sendSnapshot(client, requestId = '') {
    const room = getClientRoom(client)
    if (!room) {
      sendError(client, 'ROOM_NOT_JOINED', 'Client has not joined a room.', requestId)
      return
    }

    send(client, {
      type: 'roomSnapshot',
      requestId,
      roomId: room.roomId,
      actionSeq: Number(room.gameState.actionSeq || 0),
      payload: {
        room: toClientRoom(room)
      }
    })
  }

  function sweepInactiveClients() {
    const now = Date.now()
    Array.from(clients.values()).forEach((client) => {
      if (now - client.lastActiveAt <= clientTimeoutMs) return

      try {
        client.socket.close()
      } catch (error) {}
      removeClient(client.socketId)
    })
  }

  function send(client, message) {
    if (!client || !client.socket || client.socket.readyState !== OPEN) return false
    client.socket.send(JSON.stringify({
      serverTime: Date.now(),
      ...message
    }))
    return true
  }

  function broadcast(room, message, options = {}) {
    if (!room) return

    room.clients.forEach((client, socketId) => {
      if (options.except && socketId === options.except) return
      send(client, message)
    })
  }

  function sendError(client, code, message, requestId = '') {
    send(client, {
      type: 'error',
      requestId,
      payload: {
        code,
        message
      }
    })
  }

  function requireRoom(client, requestId = '') {
    const room = getClientRoom(client)
    if (!room) {
      sendError(client, 'ROOM_NOT_JOINED', 'Client has not joined a room.', requestId)
    }
    return room
  }

  function getClientRoom(client) {
    if (!client || !client.roomId) return null
    return rooms.get(client.roomId) || null
  }

  function createRoomSession(data = {}) {
    const roomId = data._id || data.roomId || createId('room')
    const gameState = {
      currentPlayer: '',
      flippedCards: [],
      matchedCount: 0,
      timer: 15,
      scores: { host: 0, guest: 0 },
      ...(data.gameState || {})
    }

    return {
      roomId,
      _id: data._id || roomId,
      roomCode: data.roomCode || '',
      hostId: data.hostId || '',
      guestId: data.guestId || '',
      status: data.status || 'waiting',
      difficulty: data.difficulty || 'EASY',
      seed: data.seed || Date.now(),
      countdownStartTime: data.countdownStartTime || 0,
      players: normalizePlayers(data.players),
      cards: Array.isArray(data.cards) ? data.cards.slice() : [],
      sourceUpdateTime: Number(data.updateTime || 0),
      gameState,
      clients: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  }

  function mergeRoom(room, patch = {}) {
    if (!room || !patch || typeof patch !== 'object') return room

    if (patch._id) room._id = patch._id
    if (patch.roomCode) room.roomCode = patch.roomCode
    if (patch.hostId) room.hostId = patch.hostId
    if (typeof patch.guestId === 'string') room.guestId = patch.guestId
    if (patch.status) room.status = patch.status
    if (patch.difficulty) room.difficulty = patch.difficulty
    if (patch.seed) room.seed = patch.seed
    if (typeof patch.updateTime === 'number') {
      room.sourceUpdateTime = Math.max(Number(room.sourceUpdateTime || 0), patch.updateTime)
    }
    if (typeof patch.countdownStartTime === 'number') room.countdownStartTime = patch.countdownStartTime
    const staleGameState = patch.gameState && isStaleGameState(room.gameState, patch.gameState)
    if (!staleGameState && Array.isArray(patch.cards) && (patch.cards.length > 0 || !room.cards.length)) {
      room.cards = patch.cards.slice()
    }
    if (patch.players) {
      room.players = {
        host: {
          ...room.players.host,
          ...(patch.players.host || {})
        },
        guest: {
          ...room.players.guest,
          ...(patch.players.guest || {})
        }
      }
    }
    if (patch.gameState && !staleGameState) {
      const previousActionSeq = Number(room.gameState && room.gameState.actionSeq || 0)
      const incomingActionSeq = Number(patch.gameState.actionSeq || 0)
      room.gameState = {
        ...room.gameState,
        ...patch.gameState
      }
      room.gameState.actionSeq = Math.max(previousActionSeq, incomingActionSeq)
    }

    room.updatedAt = Date.now()
    return room
  }

  function isStaleGameState(current = {}, incoming = {}) {
    const currentTurnVersion = Number(current.turnVersion || 0)
    const incomingHasTurnVersion = Object.prototype.hasOwnProperty.call(incoming, 'turnVersion')
    const incomingTurnVersion = Number(incoming.turnVersion || 0)
    const currentMatchedCount = Number(current.matchedCount || 0)
    const incomingHasMatchedCount = Object.prototype.hasOwnProperty.call(incoming, 'matchedCount')
    const incomingMatchedCount = Number(incoming.matchedCount || 0)
    const currentFlipCount = Number(current.flipCount || 0)
    const incomingHasFlipCount = Object.prototype.hasOwnProperty.call(incoming, 'flipCount')
    const incomingFlipCount = Number(incoming.flipCount || 0)

    if (incomingHasTurnVersion && currentTurnVersion && incomingTurnVersion < currentTurnVersion) {
      return true
    }
    if (incomingHasMatchedCount && incomingMatchedCount < currentMatchedCount) {
      return true
    }
    if (
      incomingHasFlipCount &&
      incomingFlipCount < currentFlipCount &&
      (!incomingHasTurnVersion || incomingTurnVersion <= currentTurnVersion)
    ) {
      return true
    }

    return false
  }

  function toClientRoom(room) {
    return {
      _id: room._id || room.roomId,
      roomId: room.roomId,
      roomCode: room.roomCode,
      hostId: room.hostId,
      guestId: room.guestId,
      status: room.status,
      difficulty: room.difficulty,
      seed: room.seed,
      countdownStartTime: room.countdownStartTime || 0,
      players: room.players,
      cards: room.cards,
      gameState: room.gameState,
      updateTime: room.sourceUpdateTime || room.updatedAt
    }
  }

  function normalizePlayers(players = {}) {
    return {
      host: {
        ...(players.host || {}),
        online: Boolean(players.host && players.host.online)
      },
      guest: {
        ...(players.guest || {}),
        online: Boolean(players.guest && players.guest.online)
      }
    }
  }

  function getPlayer(room, role) {
    return (room.players && room.players[role]) || {}
  }

  function markPlayerOnline(room, role, online, socketId) {
    if (!role || !room.players[role]) return
    room.players[role] = {
      ...room.players[role],
      online,
      socketId
    }
  }

  function markForfeit(room, leaveRole) {
    const winner = leaveRole === 'host' ? 'guest' : 'host'
    room.status = 'ended'
    room.gameState = {
      ...(room.gameState || {}),
      winner,
      endReason: leaveRole === 'host' ? 'host_leave' : 'guest_leave',
      flippedCards: []
    }
    room.cards = (room.cards || []).map((card) => {
      if (card.state === 'revealed') {
        return {
          ...card,
          state: 'hidden'
        }
      }
      return card
    })
  }

  function randomRole() {
    return Math.random() > 0.5 ? 'host' : 'guest'
  }

  function generateCards(difficultyKey, seed) {
    const config = DIFFICULTY_CONFIG[String(difficultyKey || 'EASY').toUpperCase()] || DIFFICULTY_CONFIG.EASY
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

  function normalizeRole(role) {
    const value = String(role || '').toLowerCase()
    return PLAYER_ROLES.includes(value) ? value : ''
  }

  function getSender(client) {
    return {
      socketId: client.socketId,
      role: client.role,
      openid: client.openid
    }
  }

  function bumpActionSeq(room) {
    const nextSeq = Number(room.gameState.actionSeq || 0) + 1
    room.gameState.actionSeq = nextSeq
    return nextSeq
  }

  function getRoomCount() {
    return rooms.size
  }

  function getClientCount() {
    return clients.size
  }

  return {
    addClient,
    removeClient,
    handleMessage,
    send,
    sendError,
    sweepInactiveClients,
    getRoomCount,
    getClientCount
  }
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)))
}

module.exports = {
  createRoomStore
}
