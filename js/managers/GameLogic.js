import { CARD_STATE, MATCH_FAIL_DELAY, PLAYER_ROLE, TURN_SECONDS } from '../utils/config.js'

export const GAME_FLOW_STATE = {
  WAITING: 'WAITING',
  MY_TURN: 'MY_TURN',
  OPPONENT_TURN: 'OPPONENT_TURN',
  JUDGING: 'JUDGING',
  END: 'END'
}

class GameLogic {
  constructor(options = {}) {
    // cardGrid 持有所有卡片实例，GameLogic 只通过它查询完成度和更新卡片动画。
    this.cardGrid = options.cardGrid || null
    // players 使用 role 作为 key：{ host: Player, guest: Player }。
    this.players = options.players || {}
    // myRole 用于把 currentPlayer 转换成本机视角的 MY_TURN / OPPONENT_TURN。
    this.myRole = options.myRole || PLAYER_ROLE.HOST
    this.currentPlayer = options.currentPlayer || PLAYER_ROLE.HOST
    this.state = GAME_FLOW_STATE.WAITING

    // 当前回合已经翻开的卡片，最多两张。
    this.flippedCards = []
    this.matchedCount = 0
    this.turnSeconds = typeof options.turnSeconds === 'number' ? options.turnSeconds : TURN_SECONDS
    // 倒计时只在本地累计，后续联网时可用云端 turnStartTime 纠偏。
    this.turnElapsed = 0
    this.judgeElapsed = 0
    this.judgeDelay = typeof options.judgeDelay === 'number' ? options.judgeDelay : MATCH_FAIL_DELAY
    // pendingResult 缓存第二张牌翻开后的判定结果，等待失败延迟后再结算。
    this.pendingResult = null
    this.winner = null
    this.ended = false

    // 简单事件系统，场景层可订阅并触发 UI、音效、粒子和网络同步。
    this.listeners = {}
  }

  init({ cardGrid, players, myRole, currentPlayer } = {}) {
    this.cardGrid = cardGrid || this.cardGrid
    this.players = players || this.players
    this.myRole = myRole || this.myRole
    this.currentPlayer = currentPlayer || this.currentPlayer
    this.resetRoundState()
    this.state = GAME_FLOW_STATE.WAITING
  }

  start(firstPlayer = PLAYER_ROLE.HOST) {
    this.currentPlayer = firstPlayer
    this.turnElapsed = 0
    this.judgeElapsed = 0
    this.pendingResult = null
    this.flippedCards = []
    this.matchedCount = this.cardGrid ? this.cardGrid.getMatchedCount() : 0
    this.ended = false
    this.winner = null
    this.updateTurnState()
    this.emit('gameStart', this.getSnapshot())
  }

  update(deltaTime) {
    if (this.state === GAME_FLOW_STATE.WAITING || this.state === GAME_FLOW_STATE.END) {
      return
    }

    if (this.cardGrid) {
      this.cardGrid.update(deltaTime)
    }

    if (this.state === GAME_FLOW_STATE.JUDGING) {
      // 判定阶段不继续消耗回合倒计时，避免失败延迟期间又触发超时。
      this.updateJudging(deltaTime)
      return
    }

    this.turnElapsed += deltaTime

    if (this.getRemainingSeconds() <= 0 && this.state === GAME_FLOW_STATE.MY_TURN) {
      this.handleTimeout()
    }
  }

  flipCard(card, options = {}) {
    if (!this.canFlipCard(card, options)) {
      return false
    }

    // Card 自己负责翻转动画；逻辑层立即记录这张牌已经被本回合选择。
    card.reveal()
    this.flippedCards.push(card)

    if (this.flippedCards.length === 2) {
      this.beginJudging()
    }

    this.emit('cardFlip', { card, snapshot: this.getSnapshot() })
    return true
  }

  canFlipCard(card, options = {}) {
    if (!card) return false
    if (!options.ignoreTurn && this.state !== GAME_FLOW_STATE.MY_TURN) return false
    if (this.flippedCards.length >= 2) return false
    if (card.state !== CARD_STATE.HIDDEN) return false
    if (card.locked || card.isMatched()) return false
    if (this.flippedCards.some((flippedCard) => flippedCard.id === card.id)) return false
    return true
  }

  beginJudging() {
    // 翻满两张后进入 JUDGING，统一锁住规则输入，等延迟结束后结算。
    this.state = GAME_FLOW_STATE.JUDGING
    this.judgeElapsed = 0
    this.pendingResult = this.createJudgementResult()
    this.emit('judgeStart', this.pendingResult)
  }

  updateJudging(deltaTime) {
    this.judgeElapsed += deltaTime

    if (this.judgeElapsed >= this.judgeDelay) {
      this.resolveJudgement()
    }
  }

  createJudgementResult() {
    const [firstCard, secondCard] = this.flippedCards
    const matched = firstCard && secondCard && firstCard.pairId === secondCard.pairId

    return {
      matched,
      cards: [firstCard, secondCard],
      player: this.currentPlayer
    }
  }

  resolveJudgement() {
    if (!this.pendingResult) return

    if (this.pendingResult.matched) {
      this.handleMatchSuccess(this.pendingResult.cards)
    } else {
      this.handleMatchFail(this.pendingResult.cards)
    }

    this.pendingResult = null

    if (this.checkGameEnd()) {
      this.endGame('completed')
      return
    }

    this.updateTurnState()
  }

  handleMatchSuccess(cards) {
    // 匹配成功：两张牌保持正面，当前玩家加 1 分，并继续自己的回合。
    cards.forEach((card) => card.matched())
    this.flippedCards = []
    this.matchedCount += 1

    const player = this.players[this.currentPlayer]
    if (player) {
      player.addScore(1)
    }

    this.resetTurnTimer()
    this.emit('matchSuccess', {
      player: this.currentPlayer,
      cards,
      score: player ? player.score : 0,
      snapshot: this.getSnapshot()
    })
  }

  handleMatchFail(cards) {
    // 匹配失败：两张牌翻回背面，然后切换到另一名玩家。
    cards.forEach((card) => {
      if (card && card.state !== CARD_STATE.MATCHED) {
        card.hide()
      }
    })

    this.flippedCards = []
    this.switchTurn()
    this.emit('matchFail', {
      nextPlayer: this.currentPlayer,
      cards,
      snapshot: this.getSnapshot()
    })
  }

  switchTurn() {
    this.currentPlayer = this.currentPlayer === PLAYER_ROLE.HOST
      ? PLAYER_ROLE.GUEST
      : PLAYER_ROLE.HOST

    this.resetTurnTimer()
    this.emit('turnChange', this.getSnapshot())
  }

  handleTimeout() {
    // 超时：本回合已翻但未匹配的牌翻回，并自动交给对手。
    this.flippedCards.forEach((card) => {
      if (card && card.state !== CARD_STATE.MATCHED) {
        card.state = CARD_STATE.REVEALED
        card.locked = false
        card.hide()
      }
    })

    this.flippedCards = []
    this.switchTurn()
    this.updateTurnState()
    this.emit('turnTimeout', this.getSnapshot())
  }

  checkGameEnd() {
    return this.cardGrid ? this.cardGrid.isComplete() : false
  }

  endGame(reason = 'completed') {
    this.ended = true
    this.state = GAME_FLOW_STATE.END
    this.winner = this.calculateWinner()

    this.emit('gameEnd', {
      reason,
      winner: this.winner,
      snapshot: this.getSnapshot()
    })
  }

  calculateWinner() {
    // 平局返回 null，结算场景可据此显示“平局”。
    const host = this.players[PLAYER_ROLE.HOST]
    const guest = this.players[PLAYER_ROLE.GUEST]

    if (!host || !guest) return null
    if (host.score > guest.score) return PLAYER_ROLE.HOST
    if (guest.score > host.score) return PLAYER_ROLE.GUEST
    return null
  }

  updateTurnState() {
    if (this.ended) {
      this.state = GAME_FLOW_STATE.END
      return
    }

    // 当前玩家等于本机角色时是 MY_TURN，否则是 OPPONENT_TURN。
    this.state = this.currentPlayer === this.myRole
      ? GAME_FLOW_STATE.MY_TURN
      : GAME_FLOW_STATE.OPPONENT_TURN
  }

  resetTurnTimer() {
    this.turnElapsed = 0
  }

  syncTurnTimer(turnStartTime, turnDeadline, now = Date.now()) {
    const duration = this.turnSeconds * 1000
    let elapsed = 0

    if (Number(turnDeadline) > 0) {
      elapsed = duration - (Number(turnDeadline) - now)
    } else if (Number(turnStartTime) > 0) {
      elapsed = now - Number(turnStartTime)
    }

    this.turnElapsed = Math.max(0, Math.min(duration, elapsed))
  }

  resetRoundState() {
    this.flippedCards = []
    this.matchedCount = 0
    this.turnElapsed = 0
    this.judgeElapsed = 0
    this.pendingResult = null
    this.winner = null
    this.ended = false
  }

  resetGame(firstPlayer = PLAYER_ROLE.HOST) {
    Object.values(this.players).forEach((player) => {
      if (player && typeof player.reset === 'function') {
        player.reset()
      }
    })

    if (this.cardGrid) {
      this.cardGrid.reset()
    }

    this.start(firstPlayer)
  }

  getRemainingSeconds() {
    const remainingMs = this.turnSeconds * 1000 - this.turnElapsed
    return Math.max(0, Math.ceil(remainingMs / 1000))
  }

  getSnapshot() {
    // 提供轻量快照，方便 UI 渲染和后续上传云端 gameState。
    return {
      state: this.state,
      currentPlayer: this.currentPlayer,
      flippedCards: this.flippedCards.map((card) => card.id),
      matchedCount: this.matchedCount,
      timer: this.getRemainingSeconds(),
      scores: {
        host: this.players[PLAYER_ROLE.HOST] ? this.players[PLAYER_ROLE.HOST].score : 0,
        guest: this.players[PLAYER_ROLE.GUEST] ? this.players[PLAYER_ROLE.GUEST].score : 0
      },
      winner: this.winner
    }
  }

  on(eventName, handler) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = []
    }

    this.listeners[eventName].push(handler)

    return () => this.off(eventName, handler)
  }

  off(eventName, handler) {
    if (!this.listeners[eventName]) return

    this.listeners[eventName] = this.listeners[eventName].filter((listener) => {
      return listener !== handler
    })
  }

  emit(eventName, payload) {
    const eventListeners = this.listeners[eventName] || []
    eventListeners.forEach((listener) => listener(payload))
  }
}

export default GameLogic
