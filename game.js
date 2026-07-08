import GameManager from './js/managers/GameManager.js'
import InputManager from './js/managers/InputManager.js'
import SceneManager from './js/managers/SceneManager.js'
import AudioManager from './js/managers/AudioManager.js'
import ShareManager from './js/managers/ShareManager.js'
import SocketManager from './js/managers/SocketManager.js'
import GameScene from './js/scenes/GameScene.js'
import LoadingScene from './js/scenes/LoadingScene.js'
import MenuScene from './js/scenes/MenuScene.js'
import RankScene from './js/scenes/RankScene.js'
import ResultScene from './js/scenes/ResultScene.js'
import RoomScene from './js/scenes/RoomScene.js'
import { CLOUD_ENV_ID, COLORS, ENABLE_WS_DEBUG, FONTS, GAME_NAME, SCENE_KEYS } from './js/utils/config.js'

function initCloud() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    console.warn('wx.cloud is unavailable. Cloud features will be disabled.')
    return
  }

  wx.cloud.init({
    env: CLOUD_ENV_ID,
    traceUser: true
  })
}

function initGame() {
  initCloud()

  const canvas = wx.createCanvas()
  const ctx = canvas.getContext('2d')

  const gameManager = GameManager.getInstance()
  const inputManager = InputManager.getInstance()
  const sceneManager = SceneManager.getInstance()
  const audioManager = AudioManager.getInstance()

  gameManager.init({
    canvas,
    ctx,
    sceneManager
  })

  inputManager.init({
    canvas,
    pixelRatio: gameManager.screen.pixelRatio,
    throttleMs: 300
  })

  sceneManager.register(SCENE_KEYS.LOADING, new LoadingScene({
    gameManager,
    sceneManager,
    audioManager
  }))

  sceneManager.register(SCENE_KEYS.MENU, new MenuScene({
    gameManager,
    sceneManager,
    inputManager,
    audioManager
  }))

  sceneManager.register(SCENE_KEYS.ROOM, new RoomScene({
    gameManager,
    sceneManager,
    inputManager,
    audioManager
  }))

  sceneManager.register(SCENE_KEYS.GAME, new GameScene({
    gameManager,
    sceneManager,
    inputManager,
    audioManager
  }))

  sceneManager.register(SCENE_KEYS.RESULT, new ResultScene({
    gameManager,
    sceneManager,
    inputManager,
    audioManager
  }))

  sceneManager.register(SCENE_KEYS.RANK, new RankScene({
    gameManager,
    sceneManager,
    inputManager,
    audioManager
  }))

  if (wx.getLaunchOptionsSync) {
    gameManager.launchOptions = wx.getLaunchOptionsSync()
  }

  sceneManager.switchTo(SCENE_KEYS.LOADING)
  gameManager.start()
  initShareMenu()
  initWebSocketSelfTest()
}

function initShareMenu() {
  if (typeof wx === 'undefined') return

  if (wx.showShareMenu) {
    wx.showShareMenu({
      withShareTicket: false
    })
  }

  if (wx.onShareAppMessage) {
    wx.onShareAppMessage(() => {
      return ShareManager.getInstance().buildChallengePayload()
    })
  }
}

function initWebSocketSelfTest() {
  if (!ENABLE_WS_DEBUG) return

  SocketManager.getInstance().selfTest()
    .then(() => {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: 'WebSocket连接成功', icon: 'none' })
      }
    })
    .catch((error) => {
      const message = error && error.message ? error.message : String(error || 'WebSocket连接失败')
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: message, icon: 'none' })
      }
    })
}

function registerPlaceholderScene(sceneManager, gameManager, key, title) {
  sceneManager.register(key, {
    enter() {},
    update() {},
    render(renderCtx) {
      const { width, height } = gameManager.screen
      const gradient = renderCtx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, COLORS.BG_TOP)
      gradient.addColorStop(1, COLORS.BG_BOTTOM)

      renderCtx.fillStyle = gradient
      renderCtx.fillRect(0, 0, width, height)
      renderCtx.fillStyle = COLORS.TEXT_PRIMARY
      renderCtx.font = FONTS.TITLE
      renderCtx.textAlign = 'center'
      renderCtx.textBaseline = 'middle'
      renderCtx.fillText(title, width / 2, height / 2 - 22)
      renderCtx.font = FONTS.SMALL
      renderCtx.fillStyle = COLORS.TEXT_SECONDARY
      renderCtx.fillText(`${GAME_NAME} ${title} scene coming soon`, width / 2, height / 2 + 28)
    },
    exit() {}
  })
}

wx.onError && wx.onError((message) => {
  drawFatalError(message)
})

wx.onUnhandledRejection && wx.onUnhandledRejection((event) => {
  const reason = event && event.reason
  drawFatalError(reason && reason.message ? reason.message : String(reason || 'Unhandled promise rejection'))
})

wx.onShow((options) => {
  const gameManager = GameManager.getInstance()
  AudioManager.getInstance().resumeBgm()
  gameManager.handleShow(options)
  handleShareOptions(options)
})

wx.onHide(() => {
  const gameManager = GameManager.getInstance()
  AudioManager.getInstance().pauseBgm()
  gameManager.handleHide()
})

try {
  initGame()
} catch (error) {
  drawFatalError(error && error.message ? error.message : String(error))
}

function handleShareOptions(options = {}) {
  const roomCode = options.query && options.query.roomCode
  if (!roomCode) return

  const sceneManager = SceneManager.getInstance()
  try {
    sceneManager.switchTo(SCENE_KEYS.ROOM, {
      mode: 'join',
      roomCode
    })
  } catch (error) {}
}

function drawFatalError(message) {
  try {
    const canvas = GameManager.getInstance().canvas || wx.createCanvas()
    const ctx = canvas.getContext('2d')
    const width = canvas.width || 375
    const height = canvas.height || 667

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#050816'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('启动失败', width / 2, height / 2 - 40)
    ctx.font = '14px sans-serif'
    wrapText(ctx, String(message || '未知错误'), width / 2, height / 2, Math.min(width - 48, 320), 22)
    ctx.restore()
  } catch (error) {}
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = text.split('')
  let line = ''
  let lineIndex = 0

  chars.forEach((char) => {
    const nextLine = line + char
    if (ctx.measureText(nextLine).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineIndex * lineHeight)
      line = char
      lineIndex += 1
      return
    }
    line = nextLine
  })

  if (line) {
    ctx.fillText(line, x, y + lineIndex * lineHeight)
  }
}
