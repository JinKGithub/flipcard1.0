const http = require('http')
const express = require('express')
const { WebSocketServer } = require('ws')
const { createRoomStore } = require('./room-store')

const PORT = Number(process.env.PORT || 80)
const WS_PATH = process.env.WS_PATH || '/ws'
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 10000)
const CLIENT_TIMEOUT_MS = Number(process.env.CLIENT_TIMEOUT_MS || 30000)

const app = express()
app.use(express.json({ limit: '1mb' }))

const roomStore = createRoomStore({
  clientTimeoutMs: CLIENT_TIMEOUT_MS
})

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'flip-battle-websocket',
    uptime: Math.round(process.uptime()),
    rooms: roomStore.getRoomCount(),
    clients: roomStore.getClientCount()
  })
})

app.get('/', (req, res) => {
  res.type('text/plain').send('Flip Battle WebSocket service is running.')
})

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: WS_PATH })

wss.on('connection', (socket, request) => {
  const client = roomStore.addClient(socket, request)
  log('client connected', client.socketId)

  socket.on('message', (rawMessage) => {
    let message = null

    try {
      message = JSON.parse(String(rawMessage || '{}'))
    } catch (error) {
      roomStore.sendError(client, 'INVALID_JSON', 'Invalid message format.')
      return
    }

    try {
      roomStore.handleMessage(client, message)
    } catch (error) {
      roomStore.sendError(
        client,
        error.code || 'SERVER_ERROR',
        error.message || 'Server error.',
        message.requestId
      )
    }
  })

  socket.on('close', () => {
    roomStore.removeClient(client.socketId)
    log('client closed', client.socketId)
  })

  socket.on('error', (error) => {
    log('socket error', client.socketId, error && error.message)
  })

  roomStore.send(client, {
    type: 'helloAck',
    payload: {
      socketId: client.socketId,
      heartbeatInterval: HEARTBEAT_INTERVAL_MS
    }
  })
})

setInterval(() => {
  roomStore.sweepInactiveClients()
}, HEARTBEAT_INTERVAL_MS)

server.listen(PORT, () => {
  log(`listening on ${PORT}${WS_PATH}`)
})

function log(...args) {
  if (process.env.QUIET_LOGS === '1') return
  console.log('[flip-battle-ws]', ...args)
}
