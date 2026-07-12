import { ENABLE_WS_DEBUG, WS_CONFIG } from '../utils/config.js'

export const SOCKET_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  OPEN: 'open',
  RECONNECTING: 'reconnecting',
  FALLBACK: 'fallback',
  CLOSED: 'closed'
}

class SocketManager {
  static instance = null

  static getInstance() {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager()
    }
    return SocketManager.instance
  }

  constructor() {
    if (SocketManager.instance) return SocketManager.instance

    this.socket = null
    this.status = SOCKET_STATUS.IDLE
    this.handlers = {}
    this.queue = []
    this.requestSeq = 0
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.lastPongAt = 0
    this.manualClose = false
    this.connectOptions = null
    this.connectPromise = null

    SocketManager.instance = this
  }

  connect(options = {}) {
    this.connectOptions = {
      ...WS_CONFIG,
      ...options
    }
    this.manualClose = false

    if (this.status === SOCKET_STATUS.OPEN && this.socket) {
      return Promise.resolve(this.socket)
    }

    if (
      this.connectPromise &&
      (this.status === SOCKET_STATUS.CONNECTING || this.status === SOCKET_STATUS.RECONNECTING)
    ) {
      return this.connectPromise
    }

    this.closeSocketOnly()
    this.status = this.reconnectAttempts > 0
      ? SOCKET_STATUS.RECONNECTING
      : SOCKET_STATUS.CONNECTING

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        this.connectPromise = null
        reject(new Error('WEBSOCKET_CONNECT_TIMEOUT'))
        this.handleSocketError(new Error('WEBSOCKET_CONNECT_TIMEOUT'))
      }, this.connectOptions.timeout || 10000)

      this.createSocketTask(this.connectOptions)
        .then((socketTask) => {
          if (settled) {
            this.safeCloseSocketTask(socketTask)
            return
          }

          if (!socketTask) {
            settled = true
            clearTimeout(timeout)
            this.status = SOCKET_STATUS.FALLBACK
            this.connectPromise = null
            reject(new Error('WEBSOCKET_UNAVAILABLE'))
            return
          }

          this.socket = socketTask
          this.bindSocketEvents(socketTask, {
            onOpen: () => {
              if (settled) return
              settled = true
              clearTimeout(timeout)
              this.connectPromise = null
              this.status = SOCKET_STATUS.OPEN
              this.reconnectAttempts = 0
              this.lastPongAt = Date.now()
              this.startHeartbeat()
              this.flushQueue()
              this.emit('open', {})
              resolve(socketTask)
            },
            onError: (error) => {
              if (settled) return
              settled = true
              clearTimeout(timeout)
              this.connectPromise = null
              this.handleSocketError(error)
              reject(error)
            },
            onMessage: (message) => this.handleSocketMessage(message),
            onClose: (event) => this.handleSocketClose(event)
          })
        })
        .catch((error) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          this.connectPromise = null
          this.handleSocketError(error)
          reject(error)
        })
    })

    return this.connectPromise
  }

  async createSocketTask(options = {}) {
    if (typeof wx === 'undefined') return null

    if (wx.cloud && wx.cloud.connectContainer) {
      try {
        const result = await wx.cloud.connectContainer({
          config: {
            env: options.env
          },
          service: options.service,
          path: options.path || '/ws',
          header: options.header || {},
          method: 'GET'
        })
        return result && result.socketTask ? result.socketTask : result
      } catch (error) {
        this.debug('connectContainer create failed', error)
      }
    }

    if (wx.connectSocket && options.url) {
      return wx.connectSocket({
        url: options.url,
        header: options.header || {}
      })
    }

    return null
  }

  bindSocketEvents(socketTask, listeners) {
    if (!socketTask) return

    if (socketTask.onOpen) socketTask.onOpen(listeners.onOpen)
    if (socketTask.onMessage) socketTask.onMessage(listeners.onMessage)
    if (socketTask.onClose) socketTask.onClose(listeners.onClose)
    if (socketTask.onError) socketTask.onError(listeners.onError)

    socketTask.onopen = listeners.onOpen
    socketTask.onmessage = listeners.onMessage
    socketTask.onclose = listeners.onClose
    socketTask.onerror = listeners.onError
  }

  disconnect() {
    this.manualClose = true
    this.status = SOCKET_STATUS.CLOSED
    this.clearReconnect()
    this.stopHeartbeat()
    this.closeSocketOnly()
    this.connectPromise = null
    this.queue = []
  }

  closeSocketOnly() {
    const socket = this.socket
    this.socket = null

    this.safeCloseSocketTask(socket)
  }

  safeCloseSocketTask(socket) {
    if (socket && socket.close) {
      try {
        socket.close({})
      } catch (error) {
        try {
          socket.close()
        } catch (innerError) {}
      }
    }
  }

  send(type, payload = {}, options = {}) {
    const message = {
      type,
      requestId: options.requestId || this.createRequestId(type),
      roomId: options.roomId || '',
      roomCode: options.roomCode || '',
      role: options.role || '',
      openid: options.openid || '',
      clientTime: Date.now(),
      payload
    }

    if (this.status !== SOCKET_STATUS.OPEN || !this.socket) {
      if (options.queue !== false) {
        this.queue.push(message)
        this.trimQueue()
      }
      return Promise.resolve({
        queued: true,
        requestId: message.requestId
      })
    }

    return this.sendRaw(message)
  }

  sendRaw(message) {
    const data = JSON.stringify(message)

    return new Promise((resolve, reject) => {
      try {
        this.socket.send({
          data,
          success: () => resolve({
            queued: false,
            requestId: message.requestId
          }),
          fail: reject
        })
      } catch (error) {
        try {
          this.socket.send(data)
          resolve({
            queued: false,
            requestId: message.requestId
          })
        } catch (innerError) {
          reject(innerError)
        }
      }
    })
  }

  on(type, handler) {
    if (!this.handlers[type]) {
      this.handlers[type] = []
    }

    this.handlers[type].push(handler)
    return () => this.off(type, handler)
  }

  off(type, handler) {
    if (!this.handlers[type]) return
    this.handlers[type] = this.handlers[type].filter((item) => item !== handler)
  }

  offAll() {
    this.handlers = {}
  }

  emit(type, payload) {
    const handlers = this.handlers[type] || []
    handlers.forEach((handler) => {
      try {
        handler(payload)
      } catch (error) {
        this.debug('handler error', type, error)
      }
    })
  }

  handleSocketMessage(event = {}) {
    const raw = typeof event.data === 'string'
      ? event.data
      : typeof event === 'string'
        ? event
        : ''

    if (!raw) return

    let message = null
    try {
      message = JSON.parse(raw)
    } catch (error) {
      this.debug('invalid ws json', raw)
      return
    }

    if (message.type === 'pong') {
      this.lastPongAt = Date.now()
    }

    this.emit(message.type, message)
    this.emit('*', message)
  }

  handleSocketError(error) {
    this.debug('socket error', error)
    this.emit('socketError', error)

    if (!this.manualClose) {
      this.scheduleReconnect()
    }
  }

  handleSocketClose(event) {
    this.stopHeartbeat()
    this.socket = null
    this.emit('close', event || {})

    if (this.manualClose) {
      this.status = SOCKET_STATUS.CLOSED
      return
    }

    this.scheduleReconnect()
  }

  scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer) return

    const maxAttempts = this.connectOptions && this.connectOptions.reconnectMaxAttempts
      ? this.connectOptions.reconnectMaxAttempts
      : WS_CONFIG.reconnectMaxAttempts

    if (this.reconnectAttempts >= maxAttempts) {
      this.status = SOCKET_STATUS.FALLBACK
      this.emit('fallback', {
        reason: 'RECONNECT_FAILED'
      })
      return
    }

    this.status = SOCKET_STATUS.RECONNECTING
    this.reconnectAttempts += 1
    const baseDelay = this.connectOptions && this.connectOptions.reconnectBaseDelay
      ? this.connectOptions.reconnectBaseDelay
      : WS_CONFIG.reconnectBaseDelay
    const delay = baseDelay * Math.pow(2, this.reconnectAttempts - 1)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect(this.connectOptions).catch(() => {})
    }, delay)
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  startHeartbeat() {
    this.stopHeartbeat()
    const interval = this.connectOptions && this.connectOptions.heartbeatInterval
      ? this.connectOptions.heartbeatInterval
      : WS_CONFIG.heartbeatInterval

    this.heartbeatTimer = setInterval(() => {
      if (this.status !== SOCKET_STATUS.OPEN) return

      this.send('ping', {
        time: Date.now()
      }, {
        queue: false
      }).catch((error) => this.handleSocketError(error))
    }, interval)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  flushQueue() {
    if (!this.queue.length) return

    const queue = this.queue.slice()
    this.queue = []
    queue.forEach((message) => {
      this.sendRaw(message).catch((error) => this.handleSocketError(error))
    })
  }

  trimQueue() {
    const maxQueue = 20
    if (this.queue.length > maxQueue) {
      this.queue = this.queue.slice(this.queue.length - maxQueue)
    }
  }

  createRequestId(type) {
    this.requestSeq += 1
    return `${type}_${Date.now()}_${this.requestSeq}`
  }

  isOpen() {
    return this.status === SOCKET_STATUS.OPEN && Boolean(this.socket)
  }

  async selfTest(options = {}) {
    await this.connect(options)

    return new Promise((resolve, reject) => {
      let offPong = null
      const timeout = setTimeout(() => {
        if (offPong) offPong()
        reject(new Error('WEBSOCKET_SELF_TEST_TIMEOUT'))
      }, options.timeout || WS_CONFIG.timeout)

      offPong = this.on('pong', (message) => {
        clearTimeout(timeout)
        offPong()
        resolve(message)
      })

      this.send('ping', {
        time: Date.now()
      }, {
        queue: false
      }).catch((error) => {
        clearTimeout(timeout)
        offPong()
        reject(error)
      })
    })
  }

  debug(...args) {
    if (!ENABLE_WS_DEBUG) return
    if (typeof console !== 'undefined' && console.log) {
      console.log('[SocketManager]', ...args)
    }
  }
}

export default SocketManager
