import ParticleSystem from '../engine/ParticleSystem.js'
import AudioManager from '../managers/AudioManager.js'
import InputManager from '../managers/InputManager.js'
import UserManager from '../managers/UserManager.js'
import ShareManager from '../managers/ShareManager.js'
import CloudDB from '../utils/CloudDB.js'
import Button from '../ui/Button.js'
import {
  COLORS,
  DIFFICULTY,
  FONTS,
  LAYOUT,
  PLAYER_ROLE,
  SCENE_KEYS
} from '../utils/config.js'

class ResultScene {
  constructor(options = {}) {
    this.gameManager = options.gameManager || null
    this.sceneManager = options.sceneManager || null
    this.inputManager = options.inputManager || InputManager.getInstance()
    this.userManager = options.userManager || UserManager.getInstance()
    this.audioManager = options.audioManager || AudioManager.getInstance()
    this.cloudDB = options.cloudDB || CloudDB.getInstance()
    this.shareManager = options.shareManager || ShareManager.getInstance()

    this.room = null
    this.snapshot = null
    this.winner = null
    this.myRole = PLAYER_ROLE.HOST
    this.outcome = 'draw'
    this.buttons = []
    this.particles = new ParticleSystem()
    this.elapsed = 0
    this.saved = false
    this.saveText = ''
  }

  enter(params = {}) {
    this.room = params.room || this.createFallbackRoom()
    this.snapshot = params.snapshot || this.room.gameState || {}
    this.winner = typeof params.winner !== 'undefined' ? params.winner : this.snapshot.winner
    this.myRole = this.resolveMyRole()
    this.outcome = this.resolveOutcome()
    this.elapsed = 0
    this.saved = false
    this.saveText = '正在保存...'

    this.createLayout()
    this.registerInputs()
    this.createVictoryEffects()
    this.playResultAudio()
    this.saveResult()
  }

  exit() {
    this.buttons.forEach((button) => this.inputManager.unregister(button))
    this.buttons = []
    this.particles.clear()
  }

  update(deltaTime) {
    this.elapsed += deltaTime
    this.buttons.forEach((button) => button.update(deltaTime))
    this.particles.update(deltaTime)
  }

  render(ctx) {
    const screen = this.getScreen()
    this.drawBackground(ctx, screen)
    this.particles.render(ctx)
    this.drawResultTitle(ctx, screen)
    this.drawScorePanel(ctx, screen)
    this.drawMetaPanel(ctx, screen)
    this.drawSaveText(ctx, screen)
    this.buttons.forEach((button) => button.render(ctx))
  }

  createLayout() {
    const screen = this.getScreen()
    const safeBottom = screen.safeArea ? Math.max(0, screen.height - screen.safeArea.bottom) : 0
    const padding = screen.width <= 360 ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING
    const buttonWidth = Math.min(screen.width - padding * 2, LAYOUT.BUTTON_WIDTH)
    const buttonX = (screen.width - buttonWidth) / 2
    const buttonH = screen.height <= 640 ? 48 : LAYOUT.BUTTON_HEIGHT
    const baseY = screen.height - safeBottom - buttonH * 3 - 42

    this.buttons = [
      new Button({
        x: buttonX,
        y: baseY,
        width: buttonWidth,
        height: buttonH,
        anchorX: 0,
        anchorY: 0,
        text: '再来一局',
        fillStyle: COLORS.PRIMARY,
        pressedFillStyle: COLORS.PRIMARY_DARK,
        onClick: () => this.playAgain()
      }),
      new Button({
        x: buttonX,
        y: baseY + buttonH + 14,
        width: buttonWidth,
        height: buttonH,
        anchorX: 0,
        anchorY: 0,
        text: '分享战绩',
        fillStyle: COLORS.ACCENT,
        pressedFillStyle: COLORS.WARNING,
        onClick: () => this.shareResult()
      }),
      new Button({
        x: buttonX,
        y: baseY + (buttonH + 14) * 2,
        width: buttonWidth,
        height: buttonH,
        anchorX: 0,
        anchorY: 0,
        text: '返回主菜单',
        fillStyle: 'rgba(255,255,255,0.18)',
        pressedFillStyle: 'rgba(255,255,255,0.28)',
        onClick: () => this.gotoMenu()
      })
    ]
  }

  registerInputs() {
    this.inputManager.clear()
    this.buttons.forEach((button) => this.inputManager.register(button, { priority: 8 }))
  }

  createVictoryEffects() {
    const screen = this.getScreen()
    if (this.outcome === 'win') {
      this.particles.createFireworks(3, screen.width, screen.height)
      this.particles.createCoins(34, screen.width)
    } else if (this.outcome === 'draw') {
      this.particles.createFireworks(1, screen.width, screen.height)
    }
  }

  playResultAudio() {
    if (this.outcome === 'win') this.audioManager.play('VICTORY')
    if (this.outcome === 'loss') this.audioManager.play('DEFEAT')
  }

  async saveResult() {
    if (this.saved) return

    // Practice games never write fake players to the global records.
    if (!this.room._id) {
      this.userManager.updateStats({ outcome: this.outcome })
      this.saveText = '练习战绩已保存到本地'
      this.saved = true
      return
    }

    // Both clients enter this scene. Only the host writes the shared result,
    // otherwise one match can be counted twice in records and rankings.
    if (this.myRole !== PLAYER_ROLE.HOST) {
      this.userManager.updateStats({ outcome: this.outcome })
      this.saveText = '战绩已同步'
      this.saved = true
      return
    }

    try {
      await this.cloudDB.callFunction('saveGameResult', this.buildRecordPayload())
      this.saveText = '战绩已保存'
    } catch (error) {
      this.saveText = '已保存到本地'
    }

    this.userManager.updateStats({ outcome: this.outcome })
    this.saved = true
  }

  buildRecordPayload() {
    const scores = this.getScores()
    return {
      roomId: this.room._id || '',
      roomCode: this.room.roomCode || '',
      difficulty: this.room.difficulty || 'EASY',
      players: [
        {
          role: PLAYER_ROLE.HOST,
          openid: this.room.players.host.openid,
          nickname: this.room.players.host.nickname,
          score: scores.host
        },
        {
          role: PLAYER_ROLE.GUEST,
          openid: this.room.players.guest.openid,
          nickname: this.room.players.guest.nickname,
          score: scores.guest
        }
      ],
      winner: this.winner,
      duration: this.getDuration(),
      flipCount: this.getFlipCount(),
      createTime: Date.now()
    }
  }

  playAgain() {
    if (!this.sceneManager) return

    const difficulty = this.room.difficulty || 'EASY'

    if (!this.room._id) {
      this.sceneManager.switchTo(SCENE_KEYS.GAME, {
        mode: 'practice',
        room: {
          ...this.createFallbackRoom(),
          difficulty,
          seed: Date.now()
        }
      })
      return
    }

    this.sceneManager.switchTo(SCENE_KEYS.ROOM, {
      mode: 'create',
      difficulty
    })
  }

  gotoMenu() {
    if (this.sceneManager) this.sceneManager.switchTo(SCENE_KEYS.MENU)
  }

  shareResult() {
    this.shareManager.shareResult({
      outcome: this.outcome,
      scores: this.getScores(),
      difficulty: this.room.difficulty,
      duration: this.getDuration()
    })
  }

  drawBackground(ctx, screen) {
    const gradient = ctx.createLinearGradient(0, 0, 0, screen.height)
    gradient.addColorStop(0, COLORS.BG_TOP)
    gradient.addColorStop(1, COLORS.BG_BOTTOM)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  drawResultTitle(ctx, screen) {
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const color = this.outcome === 'win'
      ? COLORS.ACCENT
      : this.outcome === 'loss'
        ? COLORS.WARNING
        : COLORS.TEXT_PRIMARY

    ctx.save()
    ctx.fillStyle = color
    ctx.font = 'bold 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.getResultTitle(), screen.width / 2, safeTop + 82)
    ctx.restore()
  }

  drawScorePanel(ctx, screen) {
    const padding = screen.width <= 360 ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING
    const x = padding
    const y = screen.safeArea.top + 140
    const width = screen.width - padding * 2
    const height = 132
    const scores = this.getScores()

    this.roundRect(ctx, x, y, width, height, LAYOUT.PANEL_RADIUS)
    ctx.fillStyle = COLORS.PANEL
    ctx.fill()

    this.drawPlayerScore(ctx, x, y, width / 2, this.room.players.host, scores.host, '房主')
    this.drawPlayerScore(ctx, x + width / 2, y, width / 2, this.room.players.guest, scores.guest, '对手')

    ctx.fillStyle = COLORS.TEXT_MUTED
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.fillText('VS', screen.width / 2, y + height / 2)
  }

  drawPlayerScore(ctx, x, y, width, player, score, label) {
    ctx.fillStyle = COLORS.TEXT_MUTED
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + width / 2, y + 26)

    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SMALL
    ctx.fillText(this.ellipsis(ctx, player.nickname || '玩家', width - 24), x + width / 2, y + 56)

    ctx.fillStyle = COLORS.ACCENT
    ctx.font = 'bold 34px sans-serif'
    ctx.fillText(String(score), x + width / 2, y + 96)
  }

  drawMetaPanel(ctx, screen) {
    const padding = screen.width <= 360 ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING
    const x = padding
    const y = screen.safeArea.top + 292
    const width = screen.width - padding * 2
    const height = 92

    this.roundRect(ctx, x, y, width, height, LAYOUT.PANEL_RADIUS)
    ctx.fillStyle = COLORS.PANEL
    ctx.fill()

    const items = [
      { label: '翻牌', value: `${this.getFlipCount()}次` },
      { label: '用时', value: this.formatDuration(this.getDuration()) },
      { label: '难度', value: this.getDifficultyName(this.room.difficulty) }
    ]

    items.forEach((item, index) => {
      const centerX = x + width * (index + 0.5) / items.length
      ctx.fillStyle = COLORS.TEXT_PRIMARY
      ctx.font = FONTS.BODY
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(item.value, centerX, y + 34)
      ctx.fillStyle = COLORS.TEXT_MUTED
      ctx.font = FONTS.SMALL
      ctx.fillText(item.label, centerX, y + 62)
    })
  }

  drawSaveText(ctx, screen) {
    ctx.fillStyle = COLORS.TEXT_MUTED
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.saveText, screen.width / 2, screen.safeArea.top + 410)
  }

  resolveMyRole() {
    const user = this.userManager.getCurrentUser()
    if (this.room.players.guest && this.room.players.guest.openid === user.openid) {
      return PLAYER_ROLE.GUEST
    }
    return PLAYER_ROLE.HOST
  }

  resolveOutcome() {
    if (!this.winner) return 'draw'
    return this.winner === this.myRole ? 'win' : 'loss'
  }

  getResultTitle() {
    if (this.outcome === 'win') return '胜利'
    if (this.outcome === 'loss') return '失败'
    return '平局'
  }

  getScores() {
    const snapshotScores = this.snapshot.scores || {}
    return {
      host: snapshotScores.host || this.room.players.host.score || 0,
      guest: snapshotScores.guest || this.room.players.guest.score || 0
    }
  }

  getFlipCount() {
    return this.snapshot.flipCount || this.room.gameState.flipCount || 0
  }

  getDuration() {
    return this.snapshot.duration || this.room.gameState.duration || 0
  }

  getDifficultyName(key) {
    const item = DIFFICULTY[key]
    return item ? item.name : key || '初级'
  }

  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60)
    const rest = seconds % 60
    return `${minutes}:${String(rest).padStart(2, '0')}`
  }

  createFallbackRoom() {
    return {
      roomCode: '',
      difficulty: 'EASY',
      players: {
        host: { openid: 'host', nickname: '房主', score: 0 },
        guest: { openid: 'guest', nickname: '对手', score: 0 }
      },
      gameState: {}
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

export default ResultScene
