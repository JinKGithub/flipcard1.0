import CloudDB from '../utils/CloudDB.js'

class NetworkManager {
  static instance = null

  static getInstance() {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager()
    }
    return NetworkManager.instance
  }

  constructor() {
    if (NetworkManager.instance) return NetworkManager.instance

    this.cloudDB = CloudDB.getInstance()
    this.roomId = ''
    this.watcher = null
    this.onRoomChange = null
    this.onError = null
    this.pendingPatch = null
    this.uploadTimer = null
    this.uploadQueue = Promise.resolve()
    this.uploadThrottleMs = 160
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.pollTimer = null
    this.manualStop = false
    this.lastMessageAt = 0
    this.connected = false

    NetworkManager.instance = this
  }

  watchRoom(roomId, onRoomChange, onError = null) {
    this.stopWatch()
    this.roomId = roomId || ''
    this.onRoomChange = onRoomChange
    this.onError = onError
    this.manualStop = false

    if (!this.roomId) return null

    this.watcher = this.cloudDB.watchRoom(this.roomId, (room) => {
      this.connected = true
      this.lastMessageAt = Date.now()
      this.stopPolling()
      if (this.onRoomChange) this.onRoomChange(room)
    }, (error) => {
      this.connected = false
      if (this.onError) this.onError(error)
      this.startPolling()
      this.scheduleReconnect()
    })
    this.connected = Boolean(this.watcher)
    this.startHeartbeat()
    if (!this.watcher) this.startPolling()
    return this.watcher
  }

  stopWatch() {
    this.manualStop = true
    const watcher = this.watcher
    if (watcher && typeof watcher.close === 'function') {
      setTimeout(() => {
        try {
          watcher.close()
        } catch (error) {}
      }, 200)
    }

    this.watcher = null
    this.connected = false
    this.stopHeartbeat()
    this.stopPolling()
    this.clearReconnect()
  }

  uploadGameState(roomId, patch, options = {}) {
    if (!roomId || !patch) return Promise.resolve(null)

    this.roomId = roomId

    if (options.immediate) {
      return this.enqueuePatch(roomId, patch)
    }

    this.pendingPatch = this.mergePatch(this.pendingPatch || {}, patch)

    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer)
    }

    return new Promise((resolve) => {
      this.uploadTimer = setTimeout(async () => {
        const pendingPatch = this.pendingPatch
        this.pendingPatch = null
        const result = await this.enqueuePatch(this.roomId, pendingPatch)
        resolve(result)
      }, this.uploadThrottleMs)
    })
  }

  enqueuePatch(roomId, patch) {
    if (!roomId || !patch) return Promise.resolve(null)

    const task = this.uploadQueue
      .catch(() => null)
      .then(() => this.sendPatch(roomId, patch))

    this.uploadQueue = task.catch(() => null)
    return task
  }

  async sendPatch(roomId, patch) {
    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer)
      this.uploadTimer = null
    }

    const result = await this.cloudDB.callFunction('updateRoom', {
      roomId,
      action: 'updateGameState',
      patch
    })
    const payload = result && result.result ? result.result : result

    if (!payload || !payload.success) {
      throw new Error(payload && payload.message ? payload.message : 'GAME_SYNC_FAILED')
    }

    return payload.room
  }

  mergePatch(base, patch) {
    return {
      ...base,
      ...patch,
      players: patch.players || base.players,
      gameState: {
        ...(base.gameState || {}),
        ...(patch.gameState || {})
      },
      cards: patch.cards || base.cards
    }
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.lastMessageAt = Date.now()

    this.heartbeatTimer = setInterval(() => {
      if (!this.roomId) return

      if (!this.connected) {
        this.startPolling()
        this.scheduleReconnect()
      }
    }, 5000)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  scheduleReconnect() {
    if (this.manualStop || this.reconnectTimer || !this.roomId || !this.onRoomChange) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.manualStop) return
      this.watchRoom(this.roomId, this.onRoomChange, this.onError)
    }, 1200)
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  startPolling() {
    if (this.pollTimer) return
    this.stopPolling()
    if (!this.roomId || !this.onRoomChange) return

    this.pollTimer = setInterval(async () => {
      if (this.manualStop || !this.roomId || !this.onRoomChange) return

      try {
        const room = await this.fetchLatestRoom()
        if (room && this.onRoomChange) {
          this.lastMessageAt = Date.now()
          this.onRoomChange(room)
        }
      } catch (error) {}
    }, 5000)
  }

  async fetchLatestRoom() {
    try {
      const room = await this.cloudDB.get('rooms', this.roomId)
      if (room) return room
    } catch (error) {}

    try {
      const result = await this.cloudDB.callFunction('updateRoom', {
        roomId: this.roomId,
        action: 'getRoom'
      })
      const payload = result && result.result ? result.result : result
      return payload && payload.success ? payload.room : null
    } catch (error) {}

    return null
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  isClosedWatchError(error) {
    const message = error && (error.message || error.errMsg || String(error))
    return typeof message === 'string' && message.indexOf('CLOSED') !== -1
  }
}

export default NetworkManager
