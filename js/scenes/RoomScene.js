import InputManager from '../managers/InputManager.js'
import UserManager from '../managers/UserManager.js'
import ShareManager from '../managers/ShareManager.js'
import SocketManager from '../managers/SocketManager.js'
import CloudDB from '../utils/CloudDB.js'
import ResourceLoader from '../utils/ResourceLoader.js'
import Button from '../ui/Button.js'
import { generateRoomCode } from '../utils/helpers.js'
import {
  COLORS,
  DIFFICULTY,
  FONTS,
  LAYOUT,
  PLAYER_ROLE,
  ROOM_STATUS,
  SCENE_KEYS,
  SYNC_MODE,
  UI_IMAGES
} from '../utils/config.js'

class RoomScene {
  constructor(options = {}) {
    this.gameManager = options.gameManager || null
    this.sceneManager = options.sceneManager || null
    this.inputManager = options.inputManager || InputManager.getInstance()
    this.userManager = options.userManager || UserManager.getInstance()
    this.socketManager = options.socketManager || SocketManager.getInstance()
    this.cloudDB = options.cloudDB || CloudDB.getInstance()
    this.shareManager = options.shareManager || ShareManager.getInstance()
    this.loader = options.loader || new ResourceLoader()

    this.room = null
    this.myRole = PLAYER_ROLE.HOST
    this.buttons = []
    this.difficultyButtons = []
    this.countdown = 0
    this.countdownActive = false
    this.countdownElapsed = 0
    this.watchHandle = null
    this.socketOffs = []
    this.usingSocketSync = false
    this.pollTimer = null
    this.mode = 'create'
    this.loading = false
    this.statusText = ''
    this.disposed = false
    this.startRequested = false
    this.lastRoomSignature = ''
    this.difficultyChanging = false
    this.pendingDifficulty = ''
  }

  async enter(params = {}) {
    this.mode = params.mode || 'create'
    this.disposed = false
    this.loading = true
    this.statusText = this.mode === 'join' ? '请输入房间号' : '正在创建房间...'
    this.countdown = 0
    this.countdownActive = false
    this.countdownElapsed = 0
    this.startRequested = false
    this.lastRoomSignature = ''
    this.difficultyChanging = false
    this.pendingDifficulty = ''

    this.unregisterInputs()
    this.stopWatch()
    this.stopPolling()

    try {
      if (params.room) {
        this.setRoom(params.room)
      } else if (this.mode === 'join') {
        const roomCode = String(params.roomCode || await this.promptRoomCode()).trim()
        if (!roomCode) {
          this.gotoMenu()
          return
        }
        if (!/^\d{6}$/.test(roomCode)) {
          this.loading = false
          this.statusText = '请输入6位数字房间号'
          this.showToast(this.statusText)
          this.gotoMenu(800)
          return
        }
        this.statusText = '正在进入房间...'
        await this.joinCloudRoom(roomCode)
      } else {
        await this.createCloudRoom(params.difficulty || 'EASY')
      }

      if (this.disposed) return
      this.loading = false
      this.statusText = ''
      this.lastRoomSignature = this.getRoomSignature(this.room)
      this.createLayout()
      this.registerInputs()
      this.startWatch()
      if (!this.shouldUseSocketSync()) this.startPolling()
      this.checkReadyCountdown()
    } catch (error) {
      this.loading = false
      this.statusText = this.getErrorMessage(error)
      this.showToast(this.statusText)
      this.gotoMenu(800)
    }
  }

  exit() {
    this.disposed = true
    this.unregisterInputs()
    this.buttons = []
    this.difficultyButtons = []
    this.stopWatch()
    this.stopPolling()
  }

  update(deltaTime) {
    this.buttons.forEach((button) => button.update(deltaTime))
    this.difficultyButtons.forEach((button) => button.update(deltaTime))

    if (!this.countdownActive) return

    this.countdownElapsed += deltaTime
    this.countdown = Math.max(1, 3 - Math.floor(this.countdownElapsed / 1000))

    if (this.countdownElapsed >= 3000 && !this.startRequested) {
      this.startRequested = true
      this.countdownActive = false
      this.startGame()
    }
  }

  render(ctx) {
    const screen = this.getScreen()
    this.drawBackground(ctx, screen)

    if (this.loading || !this.room) {
      this.drawLoading(ctx, screen)
      return
    }

    this.drawHeader(ctx, screen)
    this.drawRoomCode(ctx, screen)
    this.drawPlayers(ctx, screen)
    this.drawDifficulty(ctx, screen)
    this.buttons.forEach((button) => button.render(ctx))
    this.difficultyButtons.forEach((button) => button.render(ctx))
    this.drawStatusHint(ctx, screen)
    this.drawCountdown(ctx, screen)
  }

  async createCloudRoom(difficulty = 'EASY') {
    const user = await this.ensureUser()
    const result = await this.cloudDB.callFunction('createRoom', {
      difficulty,
      userInfo: this.buildUserInfo(user)
    })
    const payload = result && result.result ? result.result : result

    if (!payload || !payload.success || !payload.room) {
      throw new Error(payload && payload.message ? payload.message : '创建房间失败')
    }

    this.setRoom(payload.room)
  }

  async joinCloudRoom(roomCode) {
    const normalizedCode = String(roomCode || '').trim()
    if (!/^\d{6}$/.test(normalizedCode)) {
      const error = new Error('请输入6位数字房间号')
      error.code = 'INVALID_ROOM_CODE'
      throw error
    }

    const user = await this.ensureUser()
    const result = await this.cloudDB.callFunction('joinRoom', {
      roomCode: normalizedCode,
      userInfo: this.buildUserInfo(user)
    })
    const payload = result && result.result ? result.result : result

    if (!payload || !payload.success || !payload.room) {
      const error = new Error(payload && payload.message ? payload.message : '加入房间失败')
      if (payload && payload.code) error.code = payload.code
      throw error
    }

    this.setRoom(payload.room)
  }

  promptRoomCode() {
    if (typeof wx !== 'undefined' && wx.showModal) {
      return new Promise((resolve) => {
        wx.showModal({
          title: '加入房间',
          content: '',
          editable: true,
          placeholderText: '请输入6位房间号',
          confirmText: '加入',
          cancelText: '取消',
          success: (res) => {
            if (!res.confirm) {
              resolve('')
              return
            }
            resolve(String(res.content || '').trim())
          },
          fail: () => resolve('')
        })
      })
    }

    return Promise.resolve('')
  }

  setRoom(room) {
    this.room = this.normalizeRoom(room)
    this.myRole = this.resolveMyRole()
    this.preloadRoomAvatars(this.room)
  }

  async ensureUser() {
    const currentUser = this.userManager.getCurrentUser()
    if (currentUser && currentUser.openid) return currentUser
    return this.userManager.init()
  }

  buildUserInfo(user) {
    return {
      nickname: user.nickname || '玩家',
      avatar: user.avatar || user.avatarUrl || UI_IMAGES.DEFAULT_AVATAR,
      avatarUrl: user.avatarUrl || user.avatar || UI_IMAGES.DEFAULT_AVATAR
    }
  }

  createLayout() {
    const screen = this.getScreen()
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const safeBottom = screen.safeArea ? Math.max(0, screen.height - screen.safeArea.bottom) : 0
    const isSmall = screen.width <= 360 || screen.height <= 640
    const padding = isSmall ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING
    const bottomButtonY = screen.height - safeBottom - 78
    const smallButtonY = safeTop + 122
    const smallWidth = Math.min(104, (screen.width - padding * 3) / 2)

    this.buttons = [
      new Button({
        x: padding,
        y: safeTop + 14,
        width: 56,
        height: 36,
        anchorX: 0,
        anchorY: 0,
        text: '退出',
        font: FONTS.SMALL,
        fillStyle: 'rgba(255,255,255,0.12)',
        pressedFillStyle: 'rgba(255,255,255,0.22)',
        shadowBlur: 0,
        onClick: () => this.leaveRoom()
      }),
      new Button({
        x: screen.width / 2 - smallWidth - 8,
        y: smallButtonY,
        width: smallWidth,
        height: 38,
        anchorX: 0,
        anchorY: 0,
        text: '复制',
        font: FONTS.SMALL,
        fillStyle: 'rgba(255,255,255,0.14)',
        pressedFillStyle: 'rgba(255,255,255,0.24)',
        shadowBlur: 0,
        onClick: () => this.copyRoomCode()
      }),
      new Button({
        x: screen.width / 2 + 8,
        y: smallButtonY,
        width: smallWidth,
        height: 38,
        anchorX: 0,
        anchorY: 0,
        text: '邀请',
        font: FONTS.SMALL,
        fillStyle: COLORS.ACCENT,
        pressedFillStyle: COLORS.WARNING,
        shadowBlur: 6,
        onClick: () => this.shareRoom()
      }),
      new Button({
        x: padding,
        y: bottomButtonY,
        width: screen.width - padding * 2,
        height: 54,
        anchorX: 0,
        anchorY: 0,
        text: this.getReadyButtonText(),
        fillStyle: COLORS.PRIMARY,
        pressedFillStyle: COLORS.PRIMARY_DARK,
        onClick: () => this.toggleReady()
      })
    ]

    this.createDifficultyButtons(screen, padding)
  }

  createDifficultyButtons(screen, padding) {
    const width = screen.width - padding * 2
    const y = screen.height * 0.66
    const gap = 8
    const buttonWidth = (width - gap * 2) / 3
    const configs = [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD]

    this.difficultyButtons = configs.map((config, index) => new Button({
      x: padding + index * (buttonWidth + gap),
      y,
      width: buttonWidth,
      height: 46,
      anchorX: 0,
      anchorY: 0,
      text: `${this.getDifficultyName(config.key)} ${config.rows}x${config.cols}`,
      font: FONTS.SMALL,
      fillStyle: this.isDifficultySelected(config.key) ? COLORS.ACCENT : 'rgba(255,255,255,0.14)',
      pressedFillStyle: COLORS.WARNING,
      disabledFillStyle: this.isDifficultySelected(config.key)
        ? COLORS.ACCENT
        : 'rgba(255,255,255,0.14)',
      disabledTextColor: this.isDifficultySelected(config.key)
        ? COLORS.BG_TOP
        : COLORS.TEXT_MUTED,
      textColor: this.isDifficultySelected(config.key)
        ? COLORS.BG_TOP
        : COLORS.TEXT_PRIMARY,
      disabled: this.myRole !== PLAYER_ROLE.HOST || this.difficultyChanging,
      shadowBlur: 0,
      onClick: () => this.changeDifficulty(config.key)
    }))
  }

  registerInputs() {
    this.inputManager.clear()
    this.buttons.forEach((button) => this.inputManager.register(button, { priority: 8 }))
    this.difficultyButtons.forEach((button) => this.inputManager.register(button, { priority: 6 }))
  }

  unregisterInputs() {
    this.buttons.forEach((button) => this.inputManager.unregister(button))
    this.difficultyButtons.forEach((button) => this.inputManager.unregister(button))
  }

  startWatch() {
    this.stopWatch()
    if (this.shouldUseSocketSync()) {
      this.startSocketSync()
    }
  }

  stopWatch() {
    const watcher = this.watchHandle
    if (watcher && typeof watcher.close === 'function') {
      setTimeout(() => {
        try {
          watcher.close()
        } catch (error) {}
      }, 200)
    }
    this.watchHandle = null
    this.stopSocketSync()
  }

  shouldUseSocketSync() {
    return SYNC_MODE === 'websocket' && Boolean(this.room && this.room._id)
  }

  startSocketSync() {
    this.stopSocketSync()
    this.usingSocketSync = true
    this.statusText = '正在连接实时服务...'

    const applyRoomMessage = (message = {}) => {
      const payload = message.payload || {}
      if (payload.room) {
        this.applyRoomUpdate(payload.room)
        return
      }

      if (payload.players || payload.status || payload.difficulty) {
        this.applyRoomUpdate({
          ...this.room,
          players: payload.players || this.room.players,
          status: payload.status || this.room.status,
          difficulty: payload.difficulty || this.room.difficulty,
          countdownStartTime: payload.countdownStartTime || this.room.countdownStartTime || 0
        })
      }
    }

    const fallbackToPolling = () => {
      if (!this.shouldUseSocketSync()) return
      this.usingSocketSync = false
      this.statusText = '实时连接失败，已切回云同步'
      this.startPolling()
    }

    ;[
      'roomSnapshot',
      'roomState',
      'playerJoined',
      'playerOffline',
      'playerLeave',
      'countdownStart',
      'gameStart'
    ].forEach((type) => {
      this.socketOffs.push(this.socketManager.on(type, applyRoomMessage))
    })
    this.socketOffs.push(this.socketManager.on('fallback', fallbackToPolling))
    this.socketOffs.push(this.socketManager.on('socketError', fallbackToPolling))

    this.socketManager.connect()
      .then(() => {
        if (!this.shouldUseSocketSync()) return
        this.statusText = ''
        this.socketManager.send('joinRoom', {
          room: this.room,
          player: this.room.players[this.myRole] || {}
        }, this.getSocketSendOptions())
      })
      .catch(() => fallbackToPolling())
  }

  stopSocketSync() {
    this.socketOffs.forEach((off) => {
      if (typeof off === 'function') off()
    })
    this.socketOffs = []
    this.usingSocketSync = false
  }

  getSocketSendOptions() {
    const user = this.userManager.getCurrentUser()
    return {
      roomId: this.room && this.room._id ? this.room._id : '',
      roomCode: this.room && this.room.roomCode ? this.room.roomCode : '',
      role: this.myRole,
      openid: user.openid || ''
    }
  }

  broadcastSocketRoom(type = 'roomState') {
    if (!this.shouldUseSocketSync() || !this.socketManager.isOpen()) return

    this.socketManager.send('broadcast', {
      type,
      room: this.room
    }, this.getSocketSendOptions()).catch(() => {})
  }

  startPolling() {
    this.stopPolling()
    if (!this.room || !this.room._id) return

    this.pollTimer = setInterval(async () => {
      if (this.disposed || !this.room || !this.room._id) return

      try {
        const room = await this.fetchLatestRoom()
        if (room) {
          this.applyRoomUpdate(room)
        }
      } catch (error) {}
    }, 1500)
  }

  async fetchLatestRoom() {
    if (this.myRole === PLAYER_ROLE.GUEST && this.room.roomCode) {
      try {
        const user = await this.ensureUser()
        const result = await this.cloudDB.callFunction('joinRoom', {
          roomCode: this.room.roomCode,
          userInfo: this.buildUserInfo(user)
        })
        const payload = result && result.result ? result.result : result
        if (payload && payload.success && payload.room) return payload.room
      } catch (error) {}
    }

    try {
      const room = await this.cloudDB.get('rooms', this.room._id)
      if (room) return room
    } catch (error) {}

    try {
      const result = await this.cloudDB.callFunction('updateRoom', {
        roomId: this.room._id,
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

  applyRoomUpdate(room, options = {}) {
    const normalizedRoom = this.normalizeRoom(room)
    if (
      this.difficultyChanging &&
      this.pendingDifficulty &&
      normalizedRoom.difficulty !== this.pendingDifficulty
    ) {
      normalizedRoom.difficulty = this.pendingDifficulty
    }

    const signature = this.getRoomSignature(normalizedRoom)

    if (!options.force && signature === this.lastRoomSignature) {
      this.room = normalizedRoom
      this.myRole = this.resolveMyRole()
      this.preloadRoomAvatars(this.room)
      this.checkReadyCountdown()
      return
    }

    this.room = normalizedRoom
    this.myRole = this.resolveMyRole()
    this.lastRoomSignature = signature
    this.preloadRoomAvatars(this.room)
    this.createLayout()
    this.registerInputs()
    this.checkReadyCountdown()
  }

  async roomAction(action, data = {}) {
    if (!this.room || !this.room._id) return null

    const result = await this.cloudDB.callFunction('updateRoom', {
      roomId: this.room._id,
      action,
      ...data
    })
    const payload = result && result.result ? result.result : result

    if (!payload || !payload.success) {
      throw new Error(payload && payload.message ? payload.message : '房间更新失败')
    }

    if (payload.room) {
      this.applyRoomUpdate(payload.room, { force: true })
      this.broadcastSocketRoom(action === 'startGame' ? 'gameStart' : 'roomState')
    }

    return payload.room
  }

  async toggleReady() {
    const player = this.room.players[this.myRole]
    if (!player) return

    try {
      await this.roomAction('setReady', { ready: !player.ready })
    } catch (error) {
      this.showToast(this.getErrorMessage(error))
    }
  }

  async changeDifficulty(difficultyKey) {
    if (
      this.myRole !== PLAYER_ROLE.HOST ||
      this.room.status === ROOM_STATUS.PLAYING ||
      this.difficultyChanging ||
      this.isDifficultySelected(difficultyKey)
    ) return

    const previousDifficulty = this.room.difficulty
    this.difficultyChanging = true
    this.pendingDifficulty = difficultyKey
    this.statusText = '正在切换难度...'
    this.room = {
      ...this.room,
      difficulty: difficultyKey
    }
    this.lastRoomSignature = this.getRoomSignature(this.room)
    this.createLayout()
    this.registerInputs()

    try {
      await this.roomAction('setDifficulty', { difficulty: difficultyKey })
    } catch (error) {
      this.room = {
        ...this.room,
        difficulty: previousDifficulty
      }
      this.lastRoomSignature = this.getRoomSignature(this.room)
      this.showToast(this.getErrorMessage(error))
    } finally {
      this.difficultyChanging = false
      this.pendingDifficulty = ''
      this.statusText = ''
      this.createLayout()
      this.registerInputs()
    }
  }

  copyRoomCode() {
    if (typeof wx !== 'undefined' && wx.setClipboardData) {
      wx.setClipboardData({
        data: this.room.roomCode,
        success: () => this.showToast('房间号已复制'),
        fail: () => this.showRoomCodeFallback()
      })
      return
    }

    this.showRoomCodeFallback()
  }

  showRoomCodeFallback() {
    if (typeof wx !== 'undefined' && wx.showModal) {
      wx.showModal({
        title: '房间号',
        content: String(this.room.roomCode || ''),
        showCancel: false,
        confirmText: '知道了'
      })
    }
  }

  shareRoom() {
    this.shareManager.shareRoom(this.room.roomCode)
  }

  async leaveRoom() {
    if (this.room && this.room._id) {
      try {
        if (this.shouldUseSocketSync() && this.socketManager.isOpen()) {
          this.socketManager.send('leaveRoom', {}, this.getSocketSendOptions()).catch(() => {})
        }
        await this.cloudDB.callFunction('leaveRoom', { roomId: this.room._id })
      } catch (error) {}
    }
    this.gotoMenu()
  }

  checkReadyCountdown() {
    const hostReady = Boolean(this.room.players.host && this.room.players.host.ready)
    const guestReady = Boolean(this.room.players.guest && this.room.players.guest.ready)
    const hasGuest = Boolean(this.room.players.guest && this.room.players.guest.openid)

    if (hostReady && guestReady && hasGuest && !this.countdownActive) {
      this.countdownActive = true
      this.countdown = 3
      this.startRequested = false
      const startTime = this.room.countdownStartTime || Date.now()
      this.countdownElapsed = Math.max(0, Date.now() - startTime)
    }

    if ((!hostReady || !guestReady || !hasGuest) && this.countdownActive) {
      this.countdownActive = false
      this.countdown = 0
      this.countdownElapsed = 0
      this.startRequested = false
    }

    if (this.room.status === ROOM_STATUS.PLAYING) {
      this.gotoGame()
    }
  }

  async startGame() {
    try {
      await this.roomAction('startGame')
    } catch (error) {
      this.startRequested = false
      this.showToast(this.getErrorMessage(error))
    }
  }

  gotoGame() {
    if (!this.sceneManager) return
    this.sceneManager.switchTo(SCENE_KEYS.GAME, { room: this.room })
  }

  gotoMenu(delay = 0) {
    if (!this.sceneManager) return

    setTimeout(() => {
      if (this.sceneManager) this.sceneManager.switchTo(SCENE_KEYS.MENU)
    }, delay)
  }

  drawBackground(ctx, screen) {
    const gradient = ctx.createLinearGradient(0, 0, 0, screen.height)
    gradient.addColorStop(0, COLORS.BG_TOP)
    gradient.addColorStop(1, COLORS.BG_BOTTOM)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  drawLoading(ctx, screen) {
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SUBTITLE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.statusText || '加载中...', screen.width / 2, screen.height / 2)
  }

  drawHeader(ctx, screen) {
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SUBTITLE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('房间等待', screen.width / 2, screen.safeArea.top + 32)
  }

  drawRoomCode(ctx, screen) {
    const y = screen.safeArea.top + 86
    ctx.fillStyle = COLORS.TEXT_SECONDARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('房间号', screen.width / 2, y - 28)
    ctx.fillStyle = COLORS.ACCENT
    ctx.font = FONTS.ROOM_CODE
    ctx.fillText(this.room.roomCode, screen.width / 2, y + 6)
  }

  drawPlayers(ctx, screen) {
    const padding = screen.width <= 360 ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING
    const cardWidth = (screen.width - padding * 2 - 14) / 2
    const y = screen.height * 0.30
    this.drawPlayerCard(ctx, padding, y, cardWidth, 160, this.room.players.host, '房主')
    this.drawPlayerCard(ctx, padding + cardWidth + 14, y, cardWidth, 160, this.room.players.guest, '对手')
  }

  drawPlayerCard(ctx, x, y, width, height, player, label) {
    this.roundRect(ctx, x, y, width, height, LAYOUT.PANEL_RADIUS)
    ctx.fillStyle = COLORS.PANEL
    ctx.fill()

    ctx.fillStyle = COLORS.TEXT_MUTED
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + width / 2, y + 20)

    if (!player || !player.openid) {
      ctx.fillStyle = COLORS.TEXT_SECONDARY
      ctx.font = FONTS.SMALL
      ctx.fillText('等待加入', x + width / 2, y + height / 2)
      return
    }

    this.drawAvatar(ctx, x + width / 2 - 28, y + 38, 56, player.avatar || player.avatarUrl)

    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SMALL
    ctx.fillText(this.ellipsis(ctx, player.nickname || '玩家', width - 20), x + width / 2, y + 108)

    ctx.fillStyle = player.ready ? COLORS.SUCCESS : COLORS.WARNING
    ctx.fillText(player.ready ? '已准备' : '未准备', x + width / 2, y + 134)
  }

  drawDifficulty(ctx, screen) {
    const y = screen.height * 0.66 - 34
    ctx.fillStyle = COLORS.TEXT_SECONDARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.myRole === PLAYER_ROLE.HOST ? '选择难度' : '房主选择难度', screen.width / 2, y)
  }

  drawStatusHint(ctx, screen) {
    if (!this.statusText) return

    ctx.save()
    ctx.fillStyle = COLORS.ACCENT
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.statusText, screen.width / 2, screen.height * 0.66 + 66)
    ctx.restore()
  }

  drawCountdown(ctx, screen) {
    if (!this.countdownActive) return

    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, screen.width, screen.height)
    ctx.fillStyle = COLORS.ACCENT
    ctx.font = 'bold 96px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(this.countdown || 1), screen.width / 2, screen.height / 2)
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.BODY
    ctx.fillText('即将开始', screen.width / 2, screen.height / 2 + 82)
    ctx.restore()
  }

  drawAvatar(ctx, x, y, size, avatarUrl) {
    const image = this.loader.getImage(avatarUrl) || this.loader.getImage(UI_IMAGES.DEFAULT_AVATAR)
    ctx.save()
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()

    if (image) {
      ctx.drawImage(image, x, y, size, size)
    } else {
      ctx.fillStyle = COLORS.PRIMARY
      ctx.fillRect(x, y, size, size)
      ctx.fillStyle = COLORS.TEXT_PRIMARY
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('玩', x + size / 2, y + size / 2)
    }

    ctx.restore()
  }

  getReadyButtonText() {
    const player = this.room && this.room.players ? this.room.players[this.myRole] : null
    return player && player.ready ? '取消准备' : '准备'
  }

  getRoomSignature(room = this.room) {
    if (!room) return ''

    const players = room.players || {}
    const host = players.host || {}
    const guest = players.guest || {}

    return [
      room._id || '',
      room.roomCode || '',
      room.status || '',
      room.difficulty || '',
      room.countdownStartTime || 0,
      host.openid || room.hostId || '',
      guest.openid || room.guestId || '',
      host.nickname || '',
      guest.nickname || '',
      host.avatar || host.avatarUrl || '',
      guest.avatar || guest.avatarUrl || '',
      host.ready ? 1 : 0,
      guest.ready ? 1 : 0
    ].join('|')
  }

  preloadRoomAvatars(room = this.room) {
    if (!room || !room.players || !this.loader || !this.loader.loadImageLazy) return

    ;[room.players.host, room.players.guest].forEach((player) => {
      const avatar = player && (player.avatar || player.avatarUrl)
      if (!avatar || avatar === UI_IMAGES.DEFAULT_AVATAR) return
      if (this.loader.hasImage && this.loader.hasImage(avatar)) return

      this.loader.loadImageLazy(avatar).catch(() => {})
    })
  }

  normalizeRoom(room = {}) {
    const fallbackCode = room.roomCode || generateRoomCode()
    const normalized = {
      _id: room._id || '',
      roomCode: fallbackCode,
      hostId: room.hostId || '',
      guestId: room.guestId || '',
      difficulty: room.difficulty || 'EASY',
      status: room.status || ROOM_STATUS.WAITING,
      countdownStartTime: room.countdownStartTime || 0,
      players: {
        host: room.players && room.players.host ? room.players.host : null,
        guest: room.players && room.players.guest ? room.players.guest : null
      },
      gameState: room.gameState || {}
    }

    if (normalized.players.host) {
      normalized.players.host.ready = Boolean(normalized.players.host.ready)
      normalized.players.host.avatar = normalized.players.host.avatar || normalized.players.host.avatarUrl || UI_IMAGES.DEFAULT_AVATAR
      normalized.players.host.avatarUrl = normalized.players.host.avatarUrl || normalized.players.host.avatar || UI_IMAGES.DEFAULT_AVATAR
    }

    if (normalized.players.guest) {
      normalized.players.guest.ready = Boolean(normalized.players.guest.ready)
      normalized.players.guest.avatar = normalized.players.guest.avatar || normalized.players.guest.avatarUrl || UI_IMAGES.DEFAULT_AVATAR
      normalized.players.guest.avatarUrl = normalized.players.guest.avatarUrl || normalized.players.guest.avatar || UI_IMAGES.DEFAULT_AVATAR
    }

    return normalized
  }

  resolveMyRole() {
    const user = this.userManager.getCurrentUser()
    if (this.room && this.room.players.guest && this.room.players.guest.openid === user.openid) {
      return PLAYER_ROLE.GUEST
    }
    return PLAYER_ROLE.HOST
  }

  getDifficultyName(key) {
    if (key === 'EASY') return '初级'
    if (key === 'MEDIUM') return '中级'
    if (key === 'HARD') return '高级'
    return key
  }

  isDifficultySelected(key) {
    return String(this.room && this.room.difficulty || 'EASY').toUpperCase() === key
  }

  getErrorMessage(error) {
    const code = error && error.code
    if (code === 'INVALID_ROOM_CODE') return '请输入6位数字房间号'
    if (code === 'ROOM_NOT_FOUND') return '房间不存在，请检查房间号'
    if (code === 'ROOM_ALREADY_STARTED') return '房间已开始，无法加入'
    if (code === 'ROOM_FULL') return '房间已满'
    if (code === 'NOT_READY') return '双方准备后才能开始'
    if (code === 'ROOM_ENDED') return '房间已结束，请重新创建'
    if (code === 'ONLY_HOST') return '只有房主可以操作'
    if (code === 'ROOM_NOT_PLAYING') return '房间未在游戏中'
    if (code === 'NOT_IN_ROOM') return '你不在该房间中'

    const message = error && error.message ? error.message : ''
    if (message === 'Room code must be 6 digits.') return '请输入6位数字房间号'
    if (message === 'Room does not exist.') return '房间不存在，请检查房间号'
    if (message === 'Room has already started.') return '房间已开始，无法加入'
    if (message === 'Room is full.') return '房间已满'
    if (message === 'ROOM_ENDED') return '房间已结束，请重新创建'
    if (message === 'NOT_READY') return '双方准备后才能开始'
    if (message === 'ROOM_NOT_FOUND') return '房间不存在，请检查房间号'
    if (message === 'INVALID_ROOM_CODE') return '请输入6位数字房间号'
    if (message === 'ROOM_FULL') return '房间已满'
    if (message === 'ROOM_ALREADY_STARTED') return '房间已开始，无法加入'

    return message || '房间操作失败'
  }

  showToast(title) {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({
        title,
        icon: 'none',
        duration: 1500
      })
    }
  }

  getScreen() {
    if (this.gameManager && this.gameManager.screen) return this.gameManager.screen
    return { width: 375, height: 667, safeArea: { top: 0, bottom: 667 } }
  }

  ellipsis(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text
    let result = text
    while (result.length > 0 && ctx.measureText(`${result}...`).width > maxWidth) {
      result = result.slice(0, -1)
    }
    return `${result}...`
  }

  roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + width, y, x + width, y + height, r)
    ctx.arcTo(x + width, y + height, x, y + height, r)
    ctx.arcTo(x, y + height, x, y, r)
    ctx.arcTo(x, y, x + width, y, r)
    ctx.closePath()
  }
}

export default RoomScene
