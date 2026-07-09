import GameLogic, { GAME_FLOW_STATE } from '../managers/GameLogic.js'
import InputManager from '../managers/InputManager.js'
import AudioManager from '../managers/AudioManager.js'
import UserManager from '../managers/UserManager.js'
import NetworkManager from '../managers/NetworkManager.js'
import SocketManager from '../managers/SocketManager.js'
import ResourceLoader from '../utils/ResourceLoader.js'
import CardGrid from '../models/CardGrid.js'
import Player from '../models/Player.js'
import Button from '../ui/Button.js'
import {
  CARD_STATE,
  COLORS,
  FONTS,
  LAYOUT,
  PLAYER_ROLE,
  ROOM_STATUS,
  SCENE_KEYS,
  SYNC_MODE,
  TURN_SECONDS,
  UI_IMAGES
} from '../utils/config.js'

class GameScene {
  constructor(options = {}) {
    this.gameManager = options.gameManager || null
    this.sceneManager = options.sceneManager || null
    this.inputManager = options.inputManager || InputManager.getInstance()
    this.audioManager = options.audioManager || AudioManager.getInstance()
    this.userManager = options.userManager || UserManager.getInstance()
    this.networkManager = options.networkManager || NetworkManager.getInstance()
    this.socketManager = options.socketManager || SocketManager.getInstance()
    this.loader = options.loader || new ResourceLoader()

    this.room = null
    this.myRole = PLAYER_ROLE.HOST
    this.cardGrid = new CardGrid()
    this.players = {}
    this.logic = null
    this.pauseButton = null
    this.cardInputTarget = null
    this.syncingRemote = false
    this.socketOffs = []
    this.usingSocketSync = false
    this.uploadingCount = 0
    this.mode = 'battle'
    this.flipCount = 0
    this.startTime = 0
    this.lastAppliedUpdateTime = 0
    this.lastTurnVersion = 0
    this.lastTurnStartTime = 0
    this.lastSocketActionSeq = 0
    this.practiceAiElapsed = 0
    this.opponentLeaveHandled = false
    this.leavingRoom = false
  }

  enter(params = {}) {
    this.mode = params.mode || (params.room ? 'battle' : 'practice')
    this.room = this.normalizeRoom(params.room || null)
    this.myRole = this.resolveMyRole()
    this.flipCount = this.room.gameState.flipCount || 0
    this.startTime = this.room.gameState.startTime || Date.now()
    this.lastAppliedUpdateTime = this.room.updateTime || 0
    this.lastTurnVersion = this.room.gameState.turnVersion || 0
    this.lastTurnStartTime = this.room.gameState.turnStartTime || 0
    this.lastSocketActionSeq = Number(this.room.gameState.actionSeq || 0)
    this.opponentLeaveHandled = false
    this.leavingRoom = false

    this.createPlayers()
    this.createCards()
    this.createLogic()
    this.createLayout()
    this.registerInputs()
    this.startSync()

    const firstPlayer = this.room.gameState.currentPlayer || this.randomFirstPlayer()
    this.logic.start(firstPlayer)
    this.logic.syncTurnTimer(
      this.room.gameState.turnStartTime,
      this.room.gameState.turnDeadline
    )

    if (this.room._id && this.myRole === PLAYER_ROLE.HOST && (!params.room.cards || !params.room.cards.length)) {
      this.uploadGameState({ status: ROOM_STATUS.PLAYING }, true)
    }
  }

  exit() {
    if (this.pauseButton) this.inputManager.unregister(this.pauseButton)
    if (this.cardInputTarget) this.inputManager.unregister(this.cardInputTarget)
    this.stopSync()
  }

  update(deltaTime) {
    if (this.logic) {
      if (this.isServerAuthoritative()) {
        this.updateServerAuthoritativeState(deltaTime)
      } else {
        this.logic.update(deltaTime)
      }
    }
    if (this.pauseButton) this.pauseButton.update(deltaTime)
    this.updatePracticeAI(deltaTime)
  }

  render(ctx) {
    const screen = this.getScreen()
    this.drawBackground(ctx, screen)
    this.drawTopHud(ctx, screen)
    this.cardGrid.render(ctx)
    this.drawTurnInfo(ctx, screen)
    if (this.pauseButton) this.pauseButton.render(ctx)
  }

  createPlayers() {
    const hostData = this.room.players.host || {}
    const guestData = this.room.players.guest || {}
    const scores = this.room.gameState.scores || {}

    this.players = {
      [PLAYER_ROLE.HOST]: new Player({
        id: hostData.openid || 'host',
        openid: hostData.openid || 'host',
        nickname: hostData.nickname || '房主',
        avatar: hostData.avatar || hostData.avatarUrl || UI_IMAGES.DEFAULT_AVATAR,
        role: PLAYER_ROLE.HOST,
        score: scores.host || hostData.score || 0
      }),
      [PLAYER_ROLE.GUEST]: new Player({
        id: guestData.openid || 'guest',
        openid: guestData.openid || 'guest',
        nickname: guestData.nickname || (this.mode === 'practice' ? '练习对手' : '对手'),
        avatar: guestData.avatar || guestData.avatarUrl || UI_IMAGES.DEFAULT_AVATAR,
        role: PLAYER_ROLE.GUEST,
        score: scores.guest || guestData.score || 0
      })
    }
  }

  createCards() {
    const difficulty = this.room.difficulty || 'EASY'

    if (this.room.cards && this.room.cards.length) {
      this.cardGrid.load(this.room.cards, difficulty)
    } else {
      this.cardGrid.generate(difficulty, { seed: this.room.seed || Date.now() })
      this.room.cards = this.cardGrid.toJSON()
    }

    this.setCardTextures()
  }

  createLogic() {
    this.logic = new GameLogic({
      cardGrid: this.cardGrid,
      players: this.players,
      myRole: this.myRole,
      currentPlayer: this.room.gameState.currentPlayer || PLAYER_ROLE.HOST,
      turnSeconds: TURN_SECONDS
    })

    this.logic.on('cardFlip', (payload) => {
      if (this.isServerAuthoritative()) return
      this.flipCount += 1
      this.audioManager.play('FLIP')
      this.uploadGameState({}, true)
    })
    this.logic.on('matchSuccess', () => {
      if (this.isServerAuthoritative()) return
      this.audioManager.play('MATCH')
      // The gameEnd event immediately uploads the final matched deck and ended
      // status. Avoid a concurrent "playing" upload that could arrive later.
      if (this.cardGrid.isComplete()) return
      this.uploadGameState({}, true, { resetTurnTimer: true })
    })
    this.logic.on('matchFail', () => {
      if (this.isServerAuthoritative()) return
      this.audioManager.play('FAIL')
      this.uploadGameState({}, true, { resetTurnTimer: true })
    })
    this.logic.on('turnTimeout', () => {
      if (this.isServerAuthoritative()) return
      this.uploadGameState({}, true, { resetTurnTimer: true })
    })
    this.logic.on('gameEnd', (payload) => {
      if (this.isServerAuthoritative()) return
      this.uploadGameState({
        status: ROOM_STATUS.ENDED,
        gameState: {
          winner: payload.winner,
          endReason: payload.reason
        }
      }, true)
      this.gotoResult(payload)
    })
  }

  createLayout() {
    const screen = this.getScreen()
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const safeBottom = screen.safeArea ? Math.max(0, screen.height - screen.safeArea.bottom) : 0

    this.cardGrid.calculateLayout({
      width: screen.width,
      height: screen.height,
      safeTop,
      safeBottom,
      top: safeTop + 116,
      bottom: screen.height - safeBottom - 74
    })

    this.pauseButton = new Button({
      x: screen.width - 82,
      y: screen.height - safeBottom - 54,
      width: 62,
      height: 38,
      anchorX: 0,
      anchorY: 0,
      text: '退出',
      font: FONTS.SMALL,
      fillStyle: 'rgba(255,255,255,0.14)',
      pressedFillStyle: 'rgba(255,255,255,0.24)',
      shadowBlur: 0,
      onClick: () => this.confirmExit()
    })

    this.cardInputTarget = {
      visible: true,
      active: true,
      hitTest: (x, y) => Boolean(this.cardGrid.hitTest(x, y)),
      onClick: (point) => this.handleCardTap(point)
    }
  }

  registerInputs() {
    this.inputManager.clear()
    this.inputManager.register(this.pauseButton, { priority: 10 })
    this.inputManager.register(this.cardInputTarget, { priority: 2 })
  }

  handleCardTap(point) {
    const card = this.cardGrid.hitTest(point.x, point.y)
    if (!card || !this.logic) return

    if (this.isServerAuthoritative()) {
      this.sendSocketCardTap(card)
      return
    }

    this.logic.flipCard(card)
  }

  updatePracticeAI(deltaTime) {
    if (this.mode !== 'practice' || !this.logic) return

    if (this.logic.currentPlayer !== PLAYER_ROLE.GUEST || this.logic.state === 'JUDGING') {
      this.practiceAiElapsed = 0
      return
    }

    if (this.logic.flippedCards.length >= 2) {
      this.practiceAiElapsed = 0
      return
    }

    this.practiceAiElapsed += deltaTime
    const delay = this.logic.flippedCards.length === 0 ? 650 : 520
    if (this.practiceAiElapsed < delay) return

    this.practiceAiElapsed = 0
    const card = this.pickPracticeAICard()
    if (card) {
      this.logic.flipCard(card, { ignoreTurn: true })
    }
  }

  pickPracticeAICard() {
    const flippedIds = new Set(this.logic.flippedCards.map((card) => card.id))
    const hiddenCards = this.cardGrid.cards.filter((card) => {
      return card.state === CARD_STATE.HIDDEN && !card.locked && !flippedIds.has(card.id)
    })

    if (!hiddenCards.length) return null
    const randomIndex = Math.floor(Math.random() * hiddenCards.length)
    return hiddenCards[randomIndex]
  }

  startSync() {
    this.stopSync()
    if (!this.room._id) return

    if (this.shouldUseSocketSync()) {
      this.startSocketSync()
      return
    }

    this.networkManager.watchRoom(this.room._id, (room) => {
      this.applyRemoteRoom(room)
    })
  }

  stopSync() {
    this.networkManager.stopWatch()
    this.stopSocketSync()
  }

  shouldUseSocketSync() {
    return SYNC_MODE === 'websocket' && this.mode === 'battle' && Boolean(this.room && this.room._id)
  }

  isServerAuthoritative() {
    return this.shouldUseSocketSync() && this.usingSocketSync && this.socketManager.isOpen()
  }

  updateServerAuthoritativeState(deltaTime) {
    if (this.cardGrid) this.cardGrid.update(deltaTime)

    if (!this.logic || !this.room || !this.room.gameState) return
    if (this.logic.state === GAME_FLOW_STATE.WAITING || this.logic.state === GAME_FLOW_STATE.END) return
    if (this.room.gameState.state === GAME_FLOW_STATE.JUDGING) return

    this.logic.syncTurnTimer(
      this.room.gameState.turnStartTime,
      this.room.gameState.turnDeadline
    )
  }

  canSendServerCardTap(card) {
    if (!card || !this.logic || !this.room || !this.room.gameState) return false
    if (this.logic.currentPlayer !== this.myRole) return false
    if (this.room.gameState.state === GAME_FLOW_STATE.JUDGING) return false
    if (this.logic.flippedCards.length >= 2) return false
    if (card.state !== CARD_STATE.HIDDEN || card.locked || card.isMatched()) return false
    if (this.logic.flippedCards.some((flippedCard) => flippedCard.id === card.id)) return false
    return true
  }

  sendSocketCardTap(card) {
    if (!this.canSendServerCardTap(card)) return

    this.socketManager.send('flipCard', {
      cardId: card.id
    }, this.getSocketSendOptions()).catch(() => this.fallbackToCloudSync())
  }

  startSocketSync() {
    this.stopSocketSync()
    this.usingSocketSync = true

    const applyRoomMessage = (message = {}) => {
      if (!this.shouldApplySocketMessage(message)) return

      const room = message.payload && message.payload.room
      if (room) {
        this.playServerSyncAudio(message)
        this.applyRemoteRoom(room)
      }
    }

    const handleOpponentLeave = (message = {}) => {
      const from = message.from || {}
      if (!from.role || from.role === this.myRole) return
      const room = message.payload && message.payload.room
      if (room) {
        this.applyRemoteRoom(room, { force: true })
        return
      }

      this.handleOpponentLeave(this.createOpponentLeaveRoom(from.role))
    }

    const fallbackToCloud = () => this.fallbackToCloudSync()

    ;['roomSnapshot', 'gameStart', 'gameStateUpdate', 'turnResult', 'flipCard'].forEach((type) => {
      this.socketOffs.push(this.socketManager.on(type, applyRoomMessage))
    })
    this.socketOffs.push(this.socketManager.on('playerLeave', handleOpponentLeave))
    this.socketOffs.push(this.socketManager.on('playerOffline', handleOpponentLeave))
    this.socketOffs.push(this.socketManager.on('fallback', fallbackToCloud))
    this.socketOffs.push(this.socketManager.on('socketError', fallbackToCloud))

    this.socketManager.connect()
      .then(() => {
        if (!this.shouldUseSocketSync()) return
        this.socketManager.send('joinRoom', {
          room: this.room,
          player: this.room.players[this.myRole] || {}
        }, this.getSocketSendOptions()).catch(() => this.fallbackToCloudSync())
      })
      .catch(() => this.fallbackToCloudSync())
  }

  stopSocketSync() {
    this.socketOffs.forEach((off) => {
      if (typeof off === 'function') off()
    })
    this.socketOffs = []
    this.usingSocketSync = false
  }

  fallbackToCloudSync() {
    if (!this.shouldUseSocketSync() || !this.room._id) return
    if (!this.usingSocketSync) return

    this.stopSocketSync()
    this.showToast('实时连接不稳定，已切回云同步')
    this.networkManager.watchRoom(this.room._id, (room) => {
      this.applyRemoteRoom(room)
    })
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

  shouldApplySocketMessage(message = {}) {
    const room = message.payload && message.payload.room
    const seq = Number(
      message.actionSeq ||
      (room && room.gameState && room.gameState.actionSeq) ||
      0
    )

    if (!seq) return true
    if (seq < this.lastSocketActionSeq) return false

    this.lastSocketActionSeq = seq
    return true
  }

  playServerSyncAudio(message = {}) {
    const payload = message.payload || {}

    if (message.type === 'flipCard') {
      this.audioManager.play('FLIP')
      return
    }

    if (message.type === 'turnResult') {
      if (payload.matched) {
        this.audioManager.play('MATCH')
      } else if (payload.cards && payload.cards.length) {
        this.audioManager.play('FAIL')
      }
    }
  }

  uploadSocketFlip(payload = {}) {
    const card = payload.card
    if (!card) return

    this.socketManager.send('flipCard', {
      cardId: card.id,
      state: card.state,
      flippedCards: this.logic.flippedCards.map((item) => item.id),
      flipCount: this.flipCount
    }, this.getSocketSendOptions()).catch(() => this.fallbackToCloudSync())
  }

  async uploadSocketGameState(nextRoom) {
    if (!this.socketManager.isOpen()) {
      this.fallbackToCloudSync()
      return
    }

    try {
      await this.socketManager.send('gameStateUpdate', {
        room: nextRoom
      }, this.getSocketSendOptions())
    } catch (error) {
      this.fallbackToCloudSync()
    }
  }

  async fetchCloudRoomAndApply() {
    try {
      const room = await this.networkManager.cloudDB.get('rooms', this.room._id)
      if (room) this.applyRemoteRoom(room, { force: true })
    } catch (error) {}
  }

  async uploadGameState(extra = {}, immediate = false, options = {}) {
    if (!this.room._id || !this.logic) return
    if (this.isServerAuthoritative()) return

    const snapshot = this.logic.getSnapshot()
    const shouldResetTimer = Boolean(options.resetTurnTimer)
    const now = Date.now()
    const currentTurnVersion = Number(this.room.gameState.turnVersion || 0)
    const gameState = {
      ...this.room.gameState,
      ...snapshot,
      ...(extra.gameState || {}),
      timer: shouldResetTimer ? TURN_SECONDS : snapshot.timer,
      turnStartTime: shouldResetTimer ? now : (this.room.gameState.turnStartTime || this.startTime),
      turnDeadline: shouldResetTimer ? now + TURN_SECONDS * 1000 : (this.room.gameState.turnDeadline || 0),
      serverTime: shouldResetTimer ? now : (this.room.gameState.serverTime || 0),
      turnVersion: shouldResetTimer ? currentTurnVersion + 1 : currentTurnVersion,
      resetTurnTimer: shouldResetTimer,
      startTime: this.startTime,
      duration: Math.floor((now - this.startTime) / 1000),
      flipCount: this.flipCount
    }
    delete gameState.actionSeq

    const nextRoom = {
      ...extra,
      status: extra.status || this.room.status || ROOM_STATUS.PLAYING,
      cards: this.cardGrid.toJSON(),
      players: {
        host: {
          ...(this.room.players.host || {}),
          score: this.players.host.score
        },
        guest: {
          ...(this.room.players.guest || {}),
          score: this.players.guest.score
        }
      },
      gameState
    }

    this.room = { ...this.room, ...nextRoom }
    this.uploadingCount += 1
    this.syncingRemote = true

    try {
      if (this.shouldUseSocketSync() && this.usingSocketSync && this.socketManager.isOpen()) {
        await this.uploadSocketGameState(this.room)
        return
      }
      const cloudRoom = await this.networkManager.uploadGameState(this.room._id, nextRoom, { immediate })
      if (cloudRoom) this.applyRemoteRoom(cloudRoom, { force: true })
    } catch (error) {
      this.showToast('同步失败，请稍后重试')
    } finally {
      this.uploadingCount = Math.max(0, this.uploadingCount - 1)
      this.syncingRemote = this.uploadingCount > 0
    }
  }

  applyRemoteRoom(room, options = {}) {
    if (!room) return
    if (!options.force && room.updateTime && room.updateTime < this.lastAppliedUpdateTime) return

    const remoteGameState = room.gameState || {}
    const remoteTurnVersion = Number(remoteGameState.turnVersion || 0)
    const localGameState = (this.room && this.room.gameState) || {}
    const localTurnVersion = Number(localGameState.turnVersion || 0)
    const remoteMatchedCount = Number(remoteGameState.matchedCount || 0)
    const localMatchedCount = Number(localGameState.matchedCount || 0)
    const remoteFlipCount = Number(remoteGameState.flipCount || 0)
    const localFlipCount = Number(localGameState.flipCount || 0)
    if (remoteTurnVersion && localTurnVersion && remoteTurnVersion < localTurnVersion) return
    if (remoteMatchedCount < localMatchedCount) return
    if (remoteTurnVersion === localTurnVersion && remoteFlipCount < localFlipCount) return

    const remoteTurnStartTime = Number(remoteGameState.turnStartTime || 0)
    const shouldResetTurnTimer = remoteTurnVersion
      ? remoteTurnVersion !== this.lastTurnVersion
      : remoteTurnStartTime > 0 && remoteTurnStartTime !== this.lastTurnStartTime
    const shouldReloadDeck = this.shouldReloadDeck(room.cards || [])
    this.room = this.normalizeRoom(room)
    this.lastAppliedUpdateTime = this.room.updateTime || this.lastAppliedUpdateTime

    if (shouldReloadDeck) {
      this.cardGrid.load(this.room.cards, this.room.difficulty)
      this.setCardTextures()
      this.createLayout()
      this.registerInputs()
    }

    ;(this.room.cards || []).forEach((remoteCard) => {
      const card = this.cardGrid.getCardById(remoteCard.id)
      if (!card) return

      this.applyRemoteCardState(card, remoteCard.state || CARD_STATE.HIDDEN)
    })

    if (this.room.gameState && this.logic) {
      this.flipCount = this.room.gameState.flipCount || this.flipCount
      this.startTime = this.room.gameState.startTime || this.startTime
      this.logic.currentPlayer = this.room.gameState.currentPlayer || this.logic.currentPlayer
      this.logic.matchedCount = this.room.gameState.matchedCount || this.cardGrid.getMatchedCount()
      this.logic.flippedCards = (this.room.gameState.flippedCards || [])
        .map((cardId) => this.cardGrid.getCardById(cardId))
        .filter(Boolean)

      if (this.isServerAuthoritative()) {
        this.applyServerLogicState(this.room.gameState)
      } else if (this.shouldKeepLocalJudging(this.room.gameState)) {
        this.keepLocalJudging()
      } else {
        this.logic.updateTurnState()
      }

      if (remoteTurnStartTime || remoteGameState.turnDeadline) {
        this.logic.syncTurnTimer(remoteTurnStartTime, remoteGameState.turnDeadline)
      } else if (shouldResetTurnTimer) {
        this.logic.resetTurnTimer()
      }

      if (shouldResetTurnTimer) {
        this.lastTurnVersion = remoteTurnVersion
        this.lastTurnStartTime = remoteTurnStartTime
      }
    }

    if (this.room.gameState && this.room.gameState.scores) {
      this.players.host.score = this.room.gameState.scores.host || 0
      this.players.guest.score = this.room.gameState.scores.guest || 0
    }

    if (this.isOpponentLeaveEnd(this.room)) {
      this.handleOpponentLeave(this.room)
      return
    }

    if (this.room.status === ROOM_STATUS.ENDED && this.room.gameState) {
      this.gotoResult({
        winner: this.room.gameState.winner || null,
        snapshot: this.logic ? this.logic.getSnapshot() : {}
      })
    }
  }

  shouldReloadDeck(remoteCards = []) {
    if (!remoteCards.length) return false
    if (remoteCards.length !== this.cardGrid.cards.length) return true

    return remoteCards.some((remoteCard) => {
      const localCard = this.cardGrid.getCardById(remoteCard.id)
      if (!localCard) return true
      return localCard.pairId !== remoteCard.pairId ||
        localCard.frontImage !== (remoteCard.imageUrl || remoteCard.frontImage) ||
        localCard.position.row !== remoteCard.position.row ||
        localCard.position.col !== remoteCard.position.col
    })
  }

  clearCardAnimation(card) {
    if (card.animations && typeof card.animations.clear === 'function') {
      card.animations.clear(false)
    }
    card.scaleX = 1
    card.scaleY = 1
    card.rotation = 0
    card.isMatchedAnimating = false
  }

  applyRemoteCardState(card, nextState) {
    if (!card) return

    const currentState = card.state || CARD_STATE.HIDDEN
    const activeAnimations = card.animations &&
      Array.isArray(card.animations.animations) &&
      card.animations.animations.length > 0

    if (currentState === nextState) {
      if (!activeAnimations) {
        card.state = nextState
        card.locked = false
        card.flipProgress = 0
      }
      return
    }

    this.clearCardAnimation(card)
    card.locked = false
    card.flipProgress = 0

    if (currentState === CARD_STATE.HIDDEN && nextState === CARD_STATE.REVEALED) {
      card.state = CARD_STATE.HIDDEN
      card.reveal()
      return
    }

    if (nextState === CARD_STATE.HIDDEN) {
      card.state = CARD_STATE.REVEALED
      card.hide()
      return
    }

    if (nextState === CARD_STATE.MATCHED) {
      card.state = CARD_STATE.REVEALED
      card.matched()
      return
    }

    card.state = nextState
  }

  applyServerLogicState(gameState = {}) {
    if (!this.logic) return

    if (gameState.state === GAME_FLOW_STATE.JUDGING) {
      this.logic.state = GAME_FLOW_STATE.JUDGING
      this.logic.judgeElapsed = 0
      this.logic.pendingResult = null
      return
    }

    if (gameState.state === GAME_FLOW_STATE.END || this.room.status === ROOM_STATUS.ENDED) {
      this.logic.state = GAME_FLOW_STATE.END
      return
    }

    this.logic.updateTurnState()
  }

  shouldKeepLocalJudging(gameState = {}) {
    return gameState.state === 'JUDGING' &&
      gameState.currentPlayer === this.myRole &&
      this.logic &&
      this.logic.flippedCards.length === 2
  }

  keepLocalJudging() {
    if (this.logic.state !== 'JUDGING') {
      this.logic.state = 'JUDGING'
      this.logic.judgeElapsed = 0
      this.logic.pendingResult = this.logic.createJudgementResult()
    }
  }

  setCardTextures() {
    const frontTextures = {}
    this.cardGrid.cards.forEach((card) => {
      frontTextures[card.frontImage] = this.loader.getImage(card.frontImage)
    })
    this.cardGrid.setTextures(frontTextures, this.loader.getImage('assets/images/cards/back.png'))
  }

  confirmExit() {
    const leave = () => this.leaveCurrentBattle()

    if (typeof wx !== 'undefined' && wx.showModal) {
      wx.showModal({
        title: '退出游戏',
        content: '确定离开当前对局吗？',
        confirmText: '退出',
        cancelText: '留下',
        success: (res) => {
          if (res.confirm) leave()
        }
      })
      return
    }

    leave()
  }

  async leaveCurrentBattle() {
    if (this.leavingRoom) return
    this.leavingRoom = true

    if (this.room && this.room._id && this.mode === 'battle') {
      try {
        if (this.shouldUseSocketSync() && this.socketManager.isOpen()) {
          await this.socketManager.send('leaveRoom', {}, this.getSocketSendOptions())
        }
      } catch (error) {}

      try {
        await this.networkManager.cloudDB.callFunction('leaveRoom', { roomId: this.room._id })
      } catch (error) {}
    }

    if (this.sceneManager) this.sceneManager.switchTo(SCENE_KEYS.MENU)
  }

  isOpponentLeaveEnd(room) {
    if (!room || room.status !== ROOM_STATUS.ENDED || !room.gameState) return false

    const reason = room.gameState.endReason || ''
    const leaveRole = reason === 'host_leave'
      ? PLAYER_ROLE.HOST
      : reason === 'guest_leave'
        ? PLAYER_ROLE.GUEST
        : ''

    return Boolean(leaveRole && leaveRole !== this.myRole)
  }

  createOpponentLeaveRoom(leaveRole) {
    const winner = leaveRole === PLAYER_ROLE.HOST ? PLAYER_ROLE.GUEST : PLAYER_ROLE.HOST
    const gameState = {
      ...(this.room.gameState || {}),
      winner,
      endReason: leaveRole === PLAYER_ROLE.HOST ? 'host_leave' : 'guest_leave',
      flippedCards: [],
      duration: Math.floor((Date.now() - this.startTime) / 1000),
      flipCount: this.flipCount,
      scores: {
        host: this.players.host ? this.players.host.score : 0,
        guest: this.players.guest ? this.players.guest.score : 0
      }
    }

    return {
      ...this.room,
      status: ROOM_STATUS.ENDED,
      cards: this.cardGrid.toJSON().map((card) => ({
        ...card,
        state: card.state === CARD_STATE.REVEALED ? CARD_STATE.HIDDEN : card.state
      })),
      gameState
    }
  }

  async handleOpponentLeave(room) {
    if (this.opponentLeaveHandled) return
    this.opponentLeaveHandled = true
    this.stopSync()

    const winner = room.gameState && room.gameState.winner ? room.gameState.winner : this.myRole
    const scores = room.gameState && room.gameState.scores
      ? room.gameState.scores
      : {
          host: this.players.host ? this.players.host.score : 0,
          guest: this.players.guest ? this.players.guest.score : 0
        }

    await this.saveForfeitResult(room, winner, scores)
    this.showOpponentLeaveModal()
  }

  async saveForfeitResult(room, winner, scores) {
    const players = room.players || {}
    const host = players.host || {}
    const guest = players.guest || {}

    try {
      await this.networkManager.cloudDB.callFunction('saveGameResult', {
        roomId: room._id || '',
        roomCode: room.roomCode || '',
        difficulty: room.difficulty || 'EASY',
        players: [
          {
            role: PLAYER_ROLE.HOST,
            openid: host.openid || room.hostId || '',
            nickname: host.nickname || '房主',
            avatar: host.avatar || host.avatarUrl || '',
            score: scores.host || 0
          },
          {
            role: PLAYER_ROLE.GUEST,
            openid: guest.openid || room.guestId || '',
            nickname: guest.nickname || '对手',
            avatar: guest.avatar || guest.avatarUrl || '',
            score: scores.guest || 0
          }
        ],
        scores,
        winner,
        duration: room.gameState.duration || Math.floor((Date.now() - this.startTime) / 1000),
        flipCount: room.gameState.flipCount || this.flipCount,
        endReason: room.gameState.endReason || 'opponent_leave',
        createTime: Date.now()
      })

      this.userManager.updateStats({ outcome: 'win' })
    } catch (error) {
      this.showToast('战绩保存失败，请稍后查看')
    }
  }

  showOpponentLeaveModal() {
    const backToMenu = () => {
      if (this.sceneManager) this.sceneManager.switchTo(SCENE_KEYS.MENU)
    }

    if (typeof wx !== 'undefined' && wx.showModal) {
      wx.showModal({
        title: '对方已退出',
        content: '对方已离开本局，系统判定你获胜，胜场已增加 1。',
        showCancel: false,
        confirmText: '确定',
        success: backToMenu,
        fail: backToMenu
      })
      return
    }

    backToMenu()
  }

  gotoResult(payload) {
    if (!this.sceneManager) return

    try {
      this.sceneManager.switchTo(SCENE_KEYS.RESULT, {
        room: this.room,
        winner: payload.winner,
        snapshot: payload.snapshot
      })
    } catch (error) {
      this.sceneManager.switchTo(SCENE_KEYS.MENU)
    }
  }

  drawBackground(ctx, screen) {
    const gradient = ctx.createLinearGradient(0, 0, 0, screen.height)
    gradient.addColorStop(0, COLORS.BG_TOP)
    gradient.addColorStop(1, COLORS.BG_BOTTOM)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  drawTopHud(ctx, screen) {
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const panelY = safeTop + 10
    const panelH = 78

    this.roundRect(ctx, 14, panelY, screen.width - 28, panelH, LAYOUT.PANEL_RADIUS)
    ctx.fillStyle = COLORS.PANEL
    ctx.fill()

    this.drawPlayerInfo(ctx, 26, panelY + 12, 138, this.players.host, PLAYER_ROLE.HOST)
    this.drawPlayerInfo(ctx, screen.width - 164, panelY + 12, 138, this.players.guest, PLAYER_ROLE.GUEST)

    const timer = this.logic ? this.logic.getRemainingSeconds() : TURN_SECONDS
    ctx.fillStyle = timer <= 5 ? COLORS.WARNING : COLORS.ACCENT
    ctx.font = 'bold 26px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(timer), screen.width / 2, panelY + 35)

    ctx.fillStyle = COLORS.TEXT_MUTED
    ctx.font = FONTS.SMALL
    ctx.fillText('秒', screen.width / 2, panelY + 58)
  }

  drawPlayerInfo(ctx, x, y, width, player, role) {
    const isTurn = this.logic && this.logic.currentPlayer === role
    if (isTurn) {
      this.roundRect(ctx, x - 6, y - 6, width + 12, 64, 10)
      ctx.fillStyle = 'rgba(251,191,36,0.20)'
      ctx.fill()
    }

    this.drawAvatar(ctx, x, y, 42, player.avatar)
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.ellipsis(ctx, player.nickname, width - 50), x + 50, y + 14)
    ctx.fillStyle = isTurn ? COLORS.ACCENT : COLORS.TEXT_SECONDARY
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(`${player.score}`, x + 50, y + 40)
  }

  drawTurnInfo(ctx, screen) {
    const text = this.logic && this.logic.currentPlayer === this.myRole ? '轮到你了' : '等待对手'
    const y = screen.safeArea.top + 102
    ctx.fillStyle = COLORS.TEXT_SECONDARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, screen.width / 2, y)
  }

  drawAvatar(ctx, x, y, size, avatarUrl) {
    if (
      avatarUrl &&
      avatarUrl !== UI_IMAGES.DEFAULT_AVATAR &&
      this.loader.loadImageLazy &&
      !this.loader.getImage(avatarUrl)
    ) {
      this.loader.loadImageLazy(avatarUrl).catch(() => {})
    }

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
    }
    ctx.restore()
  }

  normalizeRoom(room) {
    const user = this.userManager.getCurrentUser()
    const fallbackHost = {
      openid: user.openid || 'host',
      nickname: user.nickname || '房主',
      avatar: user.avatar,
      score: 0
    }
    const fallbackGuest = {
      openid: 'guest',
      nickname: this.mode === 'practice' ? '练习对手' : '对手',
      avatar: UI_IMAGES.DEFAULT_AVATAR,
      score: 0
    }

    return {
      _id: room ? room._id || '' : '',
      roomCode: room ? room.roomCode || '' : '',
      difficulty: room ? room.difficulty || 'EASY' : 'EASY',
      status: room ? room.status || ROOM_STATUS.PLAYING : ROOM_STATUS.PLAYING,
      seed: room ? room.seed || Date.now() : Date.now(),
      updateTime: room ? room.updateTime || 0 : 0,
      players: {
        host: room && room.players && room.players.host ? room.players.host : fallbackHost,
        guest: room && room.players && room.players.guest ? room.players.guest : fallbackGuest
      },
      cards: room && room.cards ? room.cards : [],
      gameState: room && room.gameState ? room.gameState : {}
    }
  }

  resolveMyRole() {
    const user = this.userManager.getCurrentUser()
    if (this.room.players.guest && this.room.players.guest.openid === user.openid) {
      return PLAYER_ROLE.GUEST
    }
    return PLAYER_ROLE.HOST
  }

  randomFirstPlayer() {
    if (this.mode === 'practice') return PLAYER_ROLE.HOST
    return Math.random() > 0.5 ? PLAYER_ROLE.HOST : PLAYER_ROLE.GUEST
  }

  showToast(title) {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title, icon: 'none', duration: 1200 })
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

export default GameScene
