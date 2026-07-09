import ParticleSystem from '../engine/ParticleSystem.js'
import AudioManager from '../managers/AudioManager.js'
import InputManager from '../managers/InputManager.js'
import SocketManager from '../managers/SocketManager.js'
import UserManager from '../managers/UserManager.js'
import CloudDB from '../utils/CloudDB.js'
import ResourceLoader from '../utils/ResourceLoader.js'
import Button from '../ui/Button.js'
import {
  COLORS,
  FONTS,
  HOME_IMAGES,
  SCENE_KEYS,
  SYNC_MODE,
  UI_IMAGES
} from '../utils/config.js'

class MenuScene {
  constructor(options = {}) {
    this.gameManager = options.gameManager || null
    this.sceneManager = options.sceneManager || null
    this.inputManager = options.inputManager || InputManager.getInstance()
    this.userManager = options.userManager || UserManager.getInstance()
    this.audioManager = options.audioManager || AudioManager.getInstance()
    this.socketManager = options.socketManager || SocketManager.getInstance()
    this.cloudDB = options.cloudDB || CloudDB.getInstance()
    this.loader = options.loader || new ResourceLoader()

    this.user = this.userManager.getCurrentUser()
    this.buttons = []
    this.authButton = null
    this.settingsButton = null
    this.particles = new ParticleSystem()
    this.elapsed = 0
    this.authMessage = ''
    this.authMessageTimer = 0
    this.homeRanks = []
    this.myRank = 0
    this.rankLoading = false
    this.rankError = ''
    this.showHomeRankPanel = false
    this.layout = {}
    this.active = false
    this.enterToken = 0
  }

  async enter() {
    this.active = true
    const enterToken = ++this.enterToken
    this.user = this.userManager.getCurrentUser()
    this.preloadUserAvatar(this.user, enterToken)
    this.elapsed = 0
    this.createLayout()
    this.registerInputs()
    this.audioManager.playBgm()
    this.warmupSocket()
    if (this.showHomeRankPanel) this.loadHomeRanks(enterToken)

    const user = await this.userManager.init()
    if (!this.isActiveEnter(enterToken)) return
    this.user = user
    this.preloadUserAvatar(user, enterToken)
    this.createLayout()
    this.registerInputs()
    if (this.showHomeRankPanel) this.loadHomeRanks(enterToken)
  }

  warmupSocket() {
    if (SYNC_MODE !== 'websocket') return
    this.socketManager.connect().catch(() => {})
  }

  isActiveEnter(token) {
    return this.active && token === this.enterToken
  }

  exit() {
    this.active = false
    this.enterToken += 1
    this.unregisterInputs()
  }

  update(deltaTime) {
    this.elapsed += deltaTime
    const screen = this.getScreen()
    this.particles.update(deltaTime, screen)
    this.buttons.forEach((button) => button.update(deltaTime))
    if (this.authButton) this.authButton.update(deltaTime)
    if (this.settingsButton) this.settingsButton.update(deltaTime)
    this.updateAuthMessage(deltaTime)
  }

  render(ctx) {
    const screen = this.getScreen()
    this.drawBackground(ctx, screen)
    this.particles.render(ctx)
    if (this.settingsButton) this.settingsButton.render(ctx)
    this.drawLogo(ctx)
    this.drawUserPanel(ctx)
    this.buttons.forEach((button) => button.render(ctx))
    if (this.authButton) this.authButton.render(ctx)
    if (this.showHomeRankPanel) this.drawRankPanel(ctx)
  }

  createLayout() {
    const screen = this.getScreen()
    const safeTop = screen.safeArea ? screen.safeArea.top : 0
    const safeBottom = screen.safeArea ? Math.max(0, screen.height - screen.safeArea.bottom) : 0
    const scale = Math.min(screen.width / 375, screen.height / 812)
    const side = Math.max(18, Math.round(24 * scale))
    const contentW = screen.width - side * 2
    const logoW = Math.min(screen.width * 0.78, 330)
    const logoH = logoW * 0.80
    const logoY = safeTop + Math.max(42, 64 * scale)
    const panelY = Math.min(safeTop + logoH * 0.80 + 48, screen.height * 0.32)
    const panelH = Math.max(150, Math.min(176, screen.height * 0.21))
    const buttonH = Math.max(52, Math.min(64, 58 * scale))
    const buttonGap = Math.max(12, 14 * scale)
    const firstButtonY = panelY + panelH + Math.max(18, 22 * scale)
    const rankMinH = 136
    const desiredRankY = firstButtonY + (buttonH + buttonGap) * 3 + Math.max(14, 18 * scale)
    const maxRankY = screen.height - safeBottom - rankMinH - 16
    const rankY = Math.max(firstButtonY + (buttonH + buttonGap) * 3 + 8, Math.min(desiredRankY, maxRankY))
    const rankH = Math.max(rankMinH, screen.height - safeBottom - rankY - 16)

    this.layout = {
      scale,
      side,
      contentW,
      logo: {
        x: (screen.width - logoW) / 2,
        y: logoY,
        width: logoW,
        height: logoH
      },
      userPanel: {
        x: side,
        y: panelY,
        width: contentW,
        height: panelH
      },
      rankPanel: {
        x: side,
        y: rankY,
        width: contentW,
        height: rankH
      }
    }

    this.particles.createFloatingLights(screen.width <= 360 ? 22 : 34, screen.width, screen.height)
    this.settingsButton = this.createSettingsButton(safeTop)
    this.buttons = this.createMainButtons(firstButtonY, buttonH, buttonGap)
    this.authButton = this.createAuthButton()
  }

  createSettingsButton(safeTop) {
    const { side, scale } = this.layout
    return new Button({
      x: side,
      y: safeTop + 16,
      width: Math.max(92, 110 * scale),
      height: Math.max(42, 48 * scale),
      anchorX: 0,
      anchorY: 0,
      text: '设置',
      font: `bold ${Math.max(16, 18 * scale)}px sans-serif`,
      fillStyle: 'rgba(0,0,0,0)',
      pressedFillStyle: 'rgba(255,255,255,0.10)',
      shadowBlur: 0,
      customRender: (ctx, button) => this.drawSettingsButtonFace(ctx, button),
      onClick: () => this.openSettings()
    })
  }

  createAuthButton() {
    if (this.user.authorized) return null

    const { scale, userPanel } = this.layout
    const authY = userPanel.y + userPanel.height - Math.max(50, 56 * scale)
    return new Button({
      x: userPanel.x + 30 * scale,
      y: authY,
      width: userPanel.width - 60 * scale,
      height: Math.max(40, 44 * scale),
      anchorX: 0,
      anchorY: 0,
      text: '授权头像昵称',
      font: `bold ${Math.max(16, 18 * scale)}px sans-serif`,
      fillStyle: '#FFC541',
      pressedFillStyle: '#F59E0B',
      textColor: '#653B00',
      shadowBlur: 8,
      onClick: () => this.requestProfile()
    })
  }

  createMainButtons(firstY, buttonH, gap) {
    const { side, contentW, scale } = this.layout
    const buttonData = [
      {
        text: '创建房间',
        icon: HOME_IMAGES.ICON_CREATE,
        colors: ['#7B5CFF', '#1067FF', '#4A75FF'],
        scene: SCENE_KEYS.ROOM,
        params: { mode: 'create' }
      },
      {
        text: '加入房间',
        icon: HOME_IMAGES.ICON_JOIN,
        colors: ['#9B43FF', '#7D2AEE', '#C34EFF'],
        scene: SCENE_KEYS.ROOM,
        params: { mode: 'join' }
      },
      {
        text: '单人练习',
        icon: HOME_IMAGES.ICON_PRACTICE,
        colors: ['#24D7F1', '#087BFF', '#1E5DFF'],
        scene: SCENE_KEYS.GAME,
        params: { mode: 'practice' }
      }
    ]

    return buttonData.map((item, index) => new Button({
      x: side + 16 * scale,
      y: firstY + (buttonH + gap) * index,
      width: contentW - 32 * scale,
      height: buttonH,
      anchorX: 0,
      anchorY: 0,
      text: item.text,
      font: `bold ${Math.max(24, 30 * scale)}px sans-serif`,
      radius: 14,
      shadowBlur: 14,
      customRender: (ctx, button) => this.drawHomeButton(ctx, button, item),
      onClick: () => this.safeSwitch(item.scene, item.params)
    }))
  }

  registerInputs() {
    if (!this.active) return
    this.unregisterInputs()
    if (this.settingsButton) this.inputManager.register(this.settingsButton, { priority: 10 })
    if (this.authButton) this.inputManager.register(this.authButton, { priority: 8 })
    this.buttons.forEach((button) => this.inputManager.register(button, { priority: 5 }))
  }

  unregisterInputs() {
    this.buttons.forEach((button) => this.inputManager.unregister(button))
    if (this.authButton) this.inputManager.unregister(this.authButton)
    if (this.settingsButton) this.inputManager.unregister(this.settingsButton)
  }

  async requestProfile() {
    if (!this.active) return
    const enterToken = this.enterToken
    this.authMessage = '正在请求授权...'
    const user = await this.userManager.requestUserProfile()
    if (!this.isActiveEnter(enterToken)) return
    this.user = user
    this.preloadUserAvatar(user, enterToken)
    this.authMessage = user.authorized
      ? '资料已更新'
      : `授权失败：${user.authError || this.userManager.lastAuthError || '未获得用户信息'}`
    this.authMessageTimer = user.authorized ? 1600 : 0
    if (!user.authorized) this.showAuthDebug(this.authMessage)
    this.createLayout()
    this.registerInputs()
  }

  preloadUserAvatar(user = this.user, enterToken = this.enterToken) {
    const avatar = user && (user.avatar || user.avatarUrl)
    if (!avatar || avatar === UI_IMAGES.DEFAULT_AVATAR) return
    if (this.loader.hasImage && this.loader.hasImage(avatar)) return
    if (!this.loader.loadImageLazy) return

    this.loader.loadImageLazy(avatar)
      .then(() => {})
      .catch(() => {
        if (!this.isActiveEnter(enterToken)) return
        this.authMessage = '头像加载失败，已使用默认头像'
        this.authMessageTimer = 2200
      })
  }

  updateAuthMessage(deltaTime) {
    if (!this.authMessageTimer) return
    this.authMessageTimer = Math.max(0, this.authMessageTimer - deltaTime)
    if (this.authMessageTimer === 0) {
      this.authMessage = ''
    }
  }

  drawBackground(ctx, screen) {
    const bg = ctx.createLinearGradient(0, 0, 0, screen.height)
    bg.addColorStop(0, '#020520')
    bg.addColorStop(0.46, '#07116A')
    bg.addColorStop(1, '#101087')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, screen.width, screen.height)

    ctx.save()
    ctx.globalAlpha = 0.34
    ctx.strokeStyle = '#7C3AED'
    ctx.lineWidth = 2
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath()
      ctx.arc(
        screen.width / 2,
        screen.height + 70 + i * 18,
        screen.width * (0.8 + i * 0.15),
        Math.PI * 1.04,
        Math.PI * 1.96
      )
      ctx.stroke()
    }
    ctx.restore()
  }

  drawSettingsButtonFace(ctx, button) {
    const iconX = button.height * 0.40
    const iconY = button.height / 2
    const outerR = button.height * 0.18
    const innerR = button.height * 0.075

    ctx.save()
    ctx.translate(iconX, iconY)
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    for (let i = 0; i < 8; i += 1) {
      ctx.save()
      ctx.rotate((Math.PI * 2 * i) / 8)
      this.roundRect(ctx, outerR * 0.68, -button.height * 0.035, button.height * 0.14, button.height * 0.07, button.height * 0.025)
      ctx.fill()
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(0, 0, outerR, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(0, 0, innerR, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = button.font
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('设置', button.height * 0.68, button.height / 2)
  }

  drawLogo(ctx) {
    const logo = this.loader.getImage(HOME_IMAGES.LOGO)
    const box = this.layout.logo
    if (!box) return

    ctx.save()
    const pulse = 1 + Math.sin(this.elapsed / 900) * 0.01
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2)
    ctx.scale(pulse, pulse)
    if (logo) {
      ctx.drawImage(logo, -box.width / 2, -box.height / 2, box.width, box.height)
    } else {
      ctx.fillStyle = COLORS.TEXT_PRIMARY
      ctx.font = FONTS.TITLE
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('翻翻对决', 0, 0)
    }
    ctx.restore()
  }

  drawUserPanel(ctx) {
    const p = this.layout.userPanel
    if (!p) return

    this.drawGlassPanel(ctx, p.x, p.y, p.width, p.height, 18)
    this.drawAvatar(ctx, p.x + 20, p.y + 22, 72 * this.layout.scale)

    ctx.save()
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = `bold ${28 * this.layout.scale}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.ellipsis(ctx, this.user.nickname || '玩家', p.width - 132), p.x + 112 * this.layout.scale, p.y + 42 * this.layout.scale)

    ctx.fillStyle = 'rgba(255,255,255,0.76)'
    ctx.font = `${16 * this.layout.scale}px sans-serif`
    ctx.fillText(
      this.user.authorized ? '准备开始记忆对决' : '授权后展示头像昵称',
      p.x + 112 * this.layout.scale,
      p.y + 72 * this.layout.scale
    )
    ctx.restore()

    this.drawStats(ctx, p)

    if (this.authMessage) {
      ctx.save()
      ctx.fillStyle = this.authMessage.indexOf('失败') !== -1 ? '#FFD84B' : '#FFD75A'
      ctx.font = `bold ${14 * this.layout.scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(this.authMessage, p.x + p.width / 2, p.y + p.height + 18)
      ctx.restore()
    }
  }

  drawAvatar(ctx, x, y, size) {
    const avatar = this.loader.getImage(this.user.avatar) ||
      this.loader.getImage(this.user.avatarUrl) ||
      this.loader.getImage(HOME_IMAGES.AVATAR_PLACEHOLDER) ||
      this.loader.getImage(UI_IMAGES.DEFAULT_AVATAR)

    ctx.save()
    ctx.shadowColor = 'rgba(255, 209, 75, 0.7)'
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#4153FF'
    ctx.fill()
    ctx.clip()
    if (avatar) ctx.drawImage(avatar, x, y, size, size)
    ctx.restore()
  }

  drawStats(ctx, panel) {
    const stats = this.user.stats || {}
    const items = [
      { label: '胜场', value: stats.wins || 0, accent: false },
      { label: '败场', value: stats.losses || 0, accent: false },
      { label: '胜率', value: `${stats.winRate || 0}%`, accent: true }
    ]
    const y = panel.y + panel.height - 42 * this.layout.scale
    const startX = panel.x + panel.width * 0.22
    const gap = panel.width * 0.26

    items.forEach((item, index) => {
      const x = startX + gap * index
      ctx.fillStyle = item.accent ? '#FFD84B' : COLORS.TEXT_PRIMARY
      ctx.font = `bold ${24 * this.layout.scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(item.value), x, y)
      ctx.fillStyle = 'rgba(255,255,255,0.68)'
      ctx.font = `${14 * this.layout.scale}px sans-serif`
      ctx.fillText(item.label, x, y + 24 * this.layout.scale)
    })
  }

  drawHomeButton(ctx, button, data) {
    const gradient = ctx.createLinearGradient(0, 0, button.width, button.height)
    gradient.addColorStop(0, data.colors[0])
    gradient.addColorStop(0.52, data.colors[1])
    gradient.addColorStop(1, data.colors[2])

    this.roundRect(ctx, 0, 0, button.width, button.height, 14)
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = 'rgba(196, 210, 255, 0.95)'
    ctx.lineWidth = 2
    ctx.stroke()

    const icon = this.loader.getImage(data.icon)
    const iconSize = button.height * 0.70
    if (icon) {
      ctx.drawImage(icon, button.width * 0.10, (button.height - iconSize) / 2, iconSize, iconSize)
    }

    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = button.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(button.text, button.width * 0.52, button.height / 2 + 1)

    ctx.fillStyle = 'rgba(210, 255, 255, 0.75)'
    ctx.font = `bold ${button.height * 0.34}px sans-serif`
    ctx.fillText('>', button.width - button.height * 0.58, button.height / 2)
  }

  async loadHomeRanks(enterToken = this.enterToken) {
    if (this.rankLoading) return

    this.rankLoading = true
    this.rankError = ''

    try {
      const rows = await this.cloudDB.query('ranks', {}, { limit: 100 })
      if (!this.isActiveEnter(enterToken)) return
      const ranks = (rows || [])
        .sort((a, b) => this.compareHomeRank(a, b))
        .map((item, index) => this.normalizeHomeRankItem(item, index + 1))

      const user = this.userManager.getCurrentUser()
      const myRankItem = ranks.find((item) => item.openid === user.openid)

      this.homeRanks = ranks.slice(0, 3)
      this.myRank = myRankItem ? myRankItem.rank : 0
      this.homeRanks.forEach((item) => this.preloadRankAvatar(item.avatar))
    } catch (error) {
      this.homeRanks = []
      this.myRank = 0
      this.rankError = 'RANK_LOAD_FAILED'
    } finally {
      this.rankLoading = false
    }
  }

  compareHomeRank(a, b) {
    return (b.winRate || 0) - (a.winRate || 0)
      || (b.wins || 0) - (a.wins || 0)
      || (b.games || 0) - (a.games || 0)
  }

  normalizeHomeRankItem(item, rank) {
    return {
      rank,
      openid: item._openid || item.openid || '',
      medal: [HOME_IMAGES.MEDAL_1, HOME_IMAGES.MEDAL_2, HOME_IMAGES.MEDAL_3][rank - 1],
      name: item.nickname || '玩家',
      avatar: item.avatar || item.avatarUrl || UI_IMAGES.DEFAULT_AVATAR,
      wins: `${item.wins || 0}胜`
    }
  }

  preloadRankAvatar(avatar) {
    if (!avatar || avatar === UI_IMAGES.DEFAULT_AVATAR) return
    if (this.loader.hasImage && this.loader.hasImage(avatar)) return
    if (this.loader.loadImageLazy) this.loader.loadImageLazy(avatar).catch(() => {})
  }

  getMyRankText() {
    return this.myRank > 0 ? `我的排名：No.${this.myRank}` : ''
  }

  drawRankPanel(ctx) {
    const p = this.layout.rankPanel
    if (!p || p.height < 120) return
    if (this.rankLoading || this.rankError || !this.homeRanks.length) return

    this.drawGlassPanel(ctx, p.x, p.y, p.width, p.height, 16)
    ctx.save()
    this.drawSmallCup(ctx, p.x + 24, p.y + 24, 15 * this.layout.scale)
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = `bold ${18 * this.layout.scale}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('本周排行', p.x + 46, p.y + 28)

    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = `${14 * this.layout.scale}px sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText('查看更多  >', p.x + p.width - 22, p.y + 28)
    ctx.restore()

    const rows = this.homeRanks
    const rowH = Math.min(34, (p.height - 70) / 3)
    rows.forEach((row, index) => this.drawRankRow(ctx, p, row, index, rowH))
    this.drawHomeRankFooter(ctx, p)
  }

  drawSmallCup(ctx, x, y, size) {
    ctx.save()
    ctx.fillStyle = '#FFD84B'
    ctx.beginPath()
    ctx.moveTo(x - size * 0.45, y - size * 0.35)
    ctx.lineTo(x + size * 0.45, y - size * 0.35)
    ctx.lineTo(x + size * 0.28, y + size * 0.22)
    ctx.lineTo(x - size * 0.28, y + size * 0.22)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(x - size * 0.10, y + size * 0.20, size * 0.20, size * 0.34)
    ctx.fillRect(x - size * 0.34, y + size * 0.54, size * 0.68, size * 0.16)
    ctx.restore()
  }

  drawHomeRankFooter(ctx, panel) {
    const text = this.getMyRankText()
    if (!text) return

    ctx.save()
    ctx.fillStyle = 'rgba(165, 180, 252, 0.95)'
    ctx.font = `bold ${15 * this.layout.scale}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(text, panel.x + panel.width / 2, panel.y + panel.height - 18)
    ctx.restore()
  }

  drawRankRow(ctx, panel, row, index, rowH) {
    const y = panel.y + 48 + index * (rowH + 4)
    this.roundRect(ctx, panel.x + 12, y, panel.width - 24, rowH, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fill()

    const medal = this.loader.getImage(row.medal)
    if (medal) ctx.drawImage(medal, panel.x + 28, y + 3, rowH - 6, rowH - 6)

    const avatar = this.loader.getImage(row.avatar) || this.loader.getImage(HOME_IMAGES.AVATAR_PLACEHOLDER)
    if (avatar) ctx.drawImage(avatar, panel.x + 72, y + 4, rowH - 8, rowH - 8)

    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = `bold ${15 * this.layout.scale}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.ellipsis(ctx, row.name, panel.width - 210), panel.x + 112, y + rowH / 2)
    ctx.fillStyle = '#FFD84B'
    ctx.textAlign = 'right'
    ctx.fillText(row.wins, panel.x + panel.width - 44, y + rowH / 2)
  }

  drawGlassPanel(ctx, x, y, width, height, radius) {
    this.roundRect(ctx, x, y, width, height, radius)
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height)
    gradient.addColorStop(0, 'rgba(18, 42, 156, 0.78)')
    gradient.addColorStop(1, 'rgba(8, 15, 76, 0.86)')
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = 'rgba(38, 116, 255, 0.92)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  safeSwitch(sceneKey, params = {}) {
    if (!this.active) return
    if (!this.sceneManager) return
    try {
      this.sceneManager.switchTo(sceneKey, params)
    } catch (error) {
      this.showComingSoon(sceneKey)
    }
  }

  showComingSoon(name) {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title: `${name} 场景暂未开放`, icon: 'none', duration: 1200 })
    }
  }

  openSettings() {
    if (!this.active) return
    const settings = this.audioManager.getSettings()
    const musicLabel = settings.musicEnabled ? '音乐：开' : '音乐：关'
    const soundLabel = settings.soundEnabled ? '音效：开' : '音效：关'

    if (typeof wx !== 'undefined' && wx.showActionSheet) {
      wx.showActionSheet({
        itemList: [musicLabel, soundLabel, '隐私保护指引'],
        success: (res) => {
          if (res.tapIndex === 0) {
            const enabled = this.audioManager.toggleMusic()
            this.showSettingToast(`音乐${enabled ? '已开启' : '已关闭'}`)
          }
          if (res.tapIndex === 1) {
            const enabled = this.audioManager.toggleSound()
            this.showSettingToast(`音效${enabled ? '已开启' : '已关闭'}`)
          }
          if (res.tapIndex === 2) this.openPrivacyContract()
        }
      })
      return
    }

    const enabled = this.audioManager.toggleSound()
    this.showSettingToast(`音效${enabled ? '已开启' : '已关闭'}`)
  }

  async openPrivacyContract() {
    try {
      await this.userManager.openPrivacyContract()
    } catch (error) {
      if (typeof wx !== 'undefined' && wx.showModal) {
        wx.showModal({
          title: '无法打开隐私保护指引',
          content: '请确认微信公众平台已填写并发布《用户隐私保护指引》，并升级微信后重试。',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    }
  }

  showSettingToast(title) {
    if (typeof wx !== 'undefined' && wx.showToast) {
      wx.showToast({ title, icon: 'none', duration: 1200 })
    }
  }

  showAuthDebug(message) {
    if (typeof wx !== 'undefined' && wx.showModal) {
      wx.showModal({
        title: '授权调试信息',
        content: String(message || '无错误信息'),
        showCancel: false,
        confirmText: '知道了'
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

export default MenuScene
