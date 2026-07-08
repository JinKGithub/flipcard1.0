import InputManager from '../managers/InputManager.js'
import UserManager from '../managers/UserManager.js'
import CloudDB from '../utils/CloudDB.js'
import Button from '../ui/Button.js'
import {
  COLORS,
  FONTS,
  LAYOUT,
  SCENE_KEYS,
  UI_IMAGES
} from '../utils/config.js'
import ResourceLoader from '../utils/ResourceLoader.js'

class RankScene {
  constructor(options = {}) {
    this.gameManager = options.gameManager || null
    this.sceneManager = options.sceneManager || null
    this.inputManager = options.inputManager || InputManager.getInstance()
    this.userManager = options.userManager || UserManager.getInstance()
    this.cloudDB = options.cloudDB || CloudDB.getInstance()
    this.loader = options.loader || new ResourceLoader()

    this.rankType = 'winRate'
    this.ranks = []
    this.loading = false
    this.errorText = ''
    this.buttons = []
    this.scrollY = 0
    this.maxScrollY = 0
    this.touchStartY = 0
    this.startScrollY = 0

    this.boundMove = this.handleTouchMove.bind(this)
    this.boundStart = this.handleTouchStart.bind(this)
  }

  enter() {
    this.createLayout()
    this.registerInputs()
    this.bindScroll()
    this.loadRanks()
  }

  exit() {
    this.buttons.forEach((button) => this.inputManager.unregister(button))
    this.buttons = []
    this.unbindScroll()
  }

  update(deltaTime) {
    this.buttons.forEach((button) => button.update(deltaTime))
  }

  render(ctx) {
    const screen = this.getScreen()
    this.drawBackground(ctx, screen)
    this.drawHeader(ctx, screen)
    this.buttons.forEach((button) => button.render(ctx))
    this.drawRankList(ctx, screen)
  }

  createLayout() {
    const screen = this.getScreen()
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const padding = screen.width <= 360 ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING

    this.buttons = [
      new Button({
        x: padding,
        y: safeTop + 14,
        width: 56,
        height: 36,
        anchorX: 0,
        anchorY: 0,
        text: '返回',
        font: FONTS.SMALL,
        fillStyle: 'rgba(255,255,255,0.14)',
        pressedFillStyle: 'rgba(255,255,255,0.24)',
        shadowBlur: 0,
        onClick: () => this.sceneManager.switchTo(SCENE_KEYS.MENU)
      }),
      new Button({
        x: padding,
        y: safeTop + 86,
        width: (screen.width - padding * 2 - 10) / 2,
        height: 42,
        anchorX: 0,
        anchorY: 0,
        text: '胜率',
        font: FONTS.SMALL,
        fillStyle: this.rankType === 'winRate' ? COLORS.ACCENT : 'rgba(255,255,255,0.14)',
        pressedFillStyle: COLORS.WARNING,
        shadowBlur: 0,
        onClick: () => this.switchRankType('winRate')
      }),
      new Button({
        x: padding + (screen.width - padding * 2 - 10) / 2 + 10,
        y: safeTop + 86,
        width: (screen.width - padding * 2 - 10) / 2,
        height: 42,
        anchorX: 0,
        anchorY: 0,
        text: '胜场',
        font: FONTS.SMALL,
        fillStyle: this.rankType === 'wins' ? COLORS.ACCENT : 'rgba(255,255,255,0.14)',
        pressedFillStyle: COLORS.WARNING,
        shadowBlur: 0,
        onClick: () => this.switchRankType('wins')
      })
    ]
  }

  registerInputs() {
    this.inputManager.clear()
    this.buttons.forEach((button) => this.inputManager.register(button, { priority: 10 }))
  }

  async loadRanks() {
    this.loading = true
    this.errorText = ''

    try {
      const rows = await this.cloudDB.query('ranks', {}, { limit: 100 })
      this.ranks = (rows || [])
        .sort((a, b) => this.compareRank(a, b))
        .slice(0, 50)
        .map((item, index) => ({ ...item, rank: index + 1 }))
      this.updateScrollBounds()
    } catch (error) {
      this.ranks = []
      this.errorText = '排行榜加载失败'
    }

    this.loading = false
  }

  switchRankType(type) {
    if (this.rankType === type) return
    this.rankType = type
    this.scrollY = 0
    this.createLayout()
    this.registerInputs()
    this.loadRanks()
  }

  compareRank(a, b) {
    if (this.rankType === 'wins') {
      return (b.wins || 0) - (a.wins || 0)
        || (b.winRate || 0) - (a.winRate || 0)
        || (b.games || 0) - (a.games || 0)
    }

    return (b.winRate || 0) - (a.winRate || 0)
      || (b.wins || 0) - (a.wins || 0)
      || (b.games || 0) - (a.games || 0)
  }

  drawBackground(ctx, screen) {
    const gradient = ctx.createLinearGradient(0, 0, 0, screen.height)
    gradient.addColorStop(0, COLORS.BG_TOP)
    gradient.addColorStop(1, COLORS.BG_BOTTOM)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, screen.width, screen.height)
  }

  drawHeader(ctx, screen) {
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SUBTITLE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('排行榜', screen.width / 2, screen.safeArea.top + 34)
  }

  drawRankList(ctx, screen) {
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const padding = screen.width <= 360 ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING
    const listX = padding
    const listY = safeTop + 146
    const listW = screen.width - padding * 2
    const listH = screen.height - listY - 24
    const rowH = 68

    this.roundRect(ctx, listX, listY, listW, listH, LAYOUT.PANEL_RADIUS)
    ctx.fillStyle = COLORS.PANEL
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    this.roundRect(ctx, listX, listY, listW, listH, LAYOUT.PANEL_RADIUS)
    ctx.clip()

    if (this.loading) {
      this.drawCentered(ctx, '加载中...', screen.width / 2, listY + listH / 2)
    } else if (this.errorText) {
      this.drawCentered(ctx, this.errorText, screen.width / 2, listY + listH / 2)
    } else if (!this.ranks.length) {
      this.drawCentered(ctx, '暂无排行数据', screen.width / 2, listY + listH / 2)
    } else {
      const user = this.userManager.getCurrentUser()
      this.ranks.forEach((item, index) => {
        const rowY = listY + index * rowH - this.scrollY
        if (rowY + rowH < listY || rowY > listY + listH) return
        this.drawRankRow(ctx, listX, rowY, listW, rowH, item, item._openid === user.openid)
      })
    }

    ctx.restore()
  }

  drawRankRow(ctx, x, y, width, height, item, highlighted) {
    if (highlighted) {
      this.roundRect(ctx, x + 8, y + 6, width - 16, height - 10, 10)
      ctx.fillStyle = 'rgba(251,191,36,0.22)'
      ctx.fill()
    }

    ctx.fillStyle = highlighted ? COLORS.ACCENT : COLORS.TEXT_PRIMARY
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(item.rank), x + 30, y + height / 2)

    this.drawAvatar(ctx, x + 54, y + 14, 40, item.avatar)

    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'left'
    ctx.fillText(this.ellipsis(ctx, item.nickname || '玩家', width - 210), x + 104, y + 25)

    ctx.fillStyle = COLORS.TEXT_MUTED
    ctx.font = '14px sans-serif'
    ctx.fillText(`${item.games || 0}局`, x + 104, y + 48)

    ctx.fillStyle = COLORS.ACCENT
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${item.winRate || 0}%`, x + width - 18, y + 25)
    ctx.fillStyle = COLORS.TEXT_SECONDARY
    ctx.font = '14px sans-serif'
    ctx.fillText(`${item.wins || 0}胜`, x + width - 18, y + 48)
  }

  drawAvatar(ctx, x, y, size, avatarUrl) {
    const avatar = this.loader.getImage(avatarUrl) || this.loader.getImage(UI_IMAGES.DEFAULT_AVATAR)
    ctx.save()
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    if (avatar) {
      ctx.drawImage(avatar, x, y, size, size)
    } else {
      ctx.fillStyle = COLORS.PRIMARY
      ctx.fillRect(x, y, size, size)
    }
    ctx.restore()
  }

  drawCentered(ctx, text, x, y) {
    ctx.fillStyle = COLORS.TEXT_SECONDARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  bindScroll() {
    if (typeof wx === 'undefined') return
    wx.onTouchStart(this.boundStart)
    wx.onTouchMove(this.boundMove)
  }

  unbindScroll() {
    if (typeof wx === 'undefined') return
    wx.offTouchStart && wx.offTouchStart(this.boundStart)
    wx.offTouchMove && wx.offTouchMove(this.boundMove)
  }

  handleTouchStart(event) {
    const touch = event.touches && event.touches[0]
    if (!touch) return
    this.touchStartY = touch.clientY
    this.startScrollY = this.scrollY
  }

  handleTouchMove(event) {
    const touch = event.touches && event.touches[0]
    if (!touch) return
    const delta = this.touchStartY - touch.clientY
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.startScrollY + delta))
  }

  updateScrollBounds() {
    const screen = this.getScreen()
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const listY = safeTop + 146
    const listH = screen.height - listY - 24
    this.maxScrollY = Math.max(0, this.ranks.length * 68 - listH)
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

export default RankScene
