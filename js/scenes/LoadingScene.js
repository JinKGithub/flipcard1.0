import ResourceLoader from '../utils/ResourceLoader.js'
import AudioManager from '../managers/AudioManager.js'
import {
  AUDIO,
  CARD_BACK_IMAGE,
  CARD_IMAGES,
  CLOUD_ENV_ID,
  COLORS,
  FONTS,
  GAME_NAME,
  HOME_IMAGES,
  SCENE_KEYS,
  SHARE_IMAGES,
  UI_IMAGES
} from '../utils/config.js'

class LoadingScene {
  constructor(options = {}) {
    this.gameManager = options.gameManager || null
    this.sceneManager = options.sceneManager || null
    this.audioManager = options.audioManager || AudioManager.getInstance()
    this.loader = options.loader || new ResourceLoader()
    this.progress = 0
    this.statusText = '准备加载'
    this.errorText = ''
    this.elapsed = 0
    this.completed = false
  }

  enter() {
    this.progress = 0
    this.statusText = '初始化云开发'
    this.errorText = ''
    this.elapsed = 0
    this.completed = false
    this.startLoading()
  }

  update(deltaTime) {
    this.elapsed += deltaTime
  }

  render(ctx) {
    const screen = this.gameManager ? this.gameManager.screen : { width: 375, height: 667 }
    this.drawBackground(ctx, screen.width, screen.height)
    this.drawLogo(ctx, screen.width, screen.height)
    this.drawProgress(ctx, screen.width, screen.height)
    this.drawStatus(ctx, screen.width, screen.height)
  }

  async startLoading() {
    try {
      this.initCloud()
      this.statusText = '加载图片和音频'

      const images = [
        CARD_BACK_IMAGE,
        ...CARD_IMAGES,
        UI_IMAGES.LOGO,
        UI_IMAGES.DEFAULT_AVATAR,
        ...Object.values(HOME_IMAGES),
        ...Object.values(SHARE_IMAGES)
      ]
      const audios = Object.keys(AUDIO)
        .filter((key) => key !== 'BGM')
        .map((key) => AUDIO[key])

      await this.loader.loadAll({ images, audios }, (progress, detail) => {
        this.progress = progress
        this.statusText = detail.failed > 0
          ? `资源加载中 ${progress}%（${detail.failed} 个失败，已跳过）`
          : `资源加载中 ${progress}%`
      })
      await this.audioManager.preload()

      this.progress = 100
      this.statusText = '加载完成'
      this.completed = true

      setTimeout(() => this.gotoMenu(), 300)
    } catch (error) {
      this.errorText = '加载失败，请稍后重试'
      this.statusText = error && error.message ? error.message : '加载失败'
    }
  }

  initCloud() {
    if (typeof wx === 'undefined' || !wx.cloud) {
      this.statusText = '当前环境不支持云开发'
      return
    }

    if (LoadingScene.cloudInitialized) return

    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true
    })
    LoadingScene.cloudInitialized = true
  }

  gotoMenu() {
    if (!this.sceneManager) return

    try {
      const launchOptions = this.gameManager ? this.gameManager.launchOptions : null
      const roomCode = launchOptions && launchOptions.query && launchOptions.query.roomCode
      if (roomCode) {
        this.sceneManager.switchTo(SCENE_KEYS.ROOM, { mode: 'join', roomCode })
        return
      }
      this.sceneManager.switchTo(SCENE_KEYS.MENU)
    } catch (error) {
      this.errorText = '主菜单场景未注册'
    }
  }

  drawBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, COLORS.BG_TOP)
    gradient.addColorStop(1, COLORS.BG_BOTTOM)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  drawLogo(ctx, width, height) {
    const pulse = 1 + Math.sin(this.elapsed / 450) * 0.03
    const centerX = width / 2
    const centerY = height * 0.34
    const logo = this.loader.getImage(HOME_IMAGES.LOGO) || this.loader.getImage(UI_IMAGES.LOGO)

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.scale(pulse, pulse)
    if (logo) {
      const logoWidth = Math.min(width * 0.74, 280)
      const logoHeight = logoWidth * 0.62
      ctx.drawImage(logo, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight)
    } else {
      ctx.fillStyle = COLORS.ACCENT
      ctx.font = FONTS.TITLE
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(GAME_NAME, 0, 0)
    }
    ctx.restore()
  }

  drawProgress(ctx, width, height) {
    const barWidth = Math.min(width * 0.68, 280)
    const barHeight = 12
    const x = (width - barWidth) / 2
    const y = height * 0.58
    const fillWidth = barWidth * (this.progress / 100)

    ctx.save()
    this.roundRect(ctx, x, y, barWidth, barHeight, barHeight / 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
    ctx.fill()

    if (fillWidth > 0) {
      this.roundRect(ctx, x, y, fillWidth, barHeight, barHeight / 2)
      const gradient = ctx.createLinearGradient(x, y, x + barWidth, y)
      gradient.addColorStop(0, COLORS.PRIMARY)
      gradient.addColorStop(1, COLORS.ACCENT)
      ctx.fillStyle = gradient
      ctx.fill()
    }

    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`${this.progress}%`, width / 2, y + 22)
    ctx.restore()
  }

  drawStatus(ctx, width, height) {
    ctx.save()
    ctx.fillStyle = this.errorText ? COLORS.WARNING : COLORS.TEXT_SECONDARY
    ctx.font = FONTS.SMALL
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.errorText || this.statusText, width / 2, height * 0.68)
    ctx.restore()
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

LoadingScene.cloudInitialized = false

export default LoadingScene
