import Adapter from '../utils/Adapter.js'

class GameManager {
  static instance = null

  static getInstance() {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager()
    }
    return GameManager.instance
  }

  constructor() {
    if (GameManager.instance) {
      return GameManager.instance
    }

    this.canvas = null
    this.ctx = null
    this.adapter = Adapter.getInstance()
    this.sceneManager = null
    this.running = false
    this.paused = false
    this.lastFrameTime = 0
    this.rafId = null
    this.targetFps = 60
    this.frameInterval = 1000 / this.targetFps
    this.skipRender = false
    this.launchOptions = null

    this.systemInfo = null
    this.screen = {
      width: 0,
      height: 0,
      pixelRatio: 1,
      safeArea: null
    }

    GameManager.instance = this
  }

  init({ canvas, ctx, sceneManager }) {
    this.canvas = canvas
    this.ctx = ctx
    this.sceneManager = sceneManager
    this.adapter.init()
    this.updateSystemInfo()
    this.resizeCanvas()
  }

  updateSystemInfo() {
    this.screen = this.adapter.refresh()
    this.systemInfo = this.adapter.systemInfo
  }

  resizeCanvas() {
    this.adapter.resizeCanvas(this.canvas, this.ctx, this.screen)
  }

  start() {
    if (this.running) return

    this.running = true
    this.paused = false
    this.lastFrameTime = Date.now()
    this.scheduleFrame()
  }

  stop() {
    this.running = false
    if (this.rafId) {
      this.cancelFrame(this.rafId)
      this.rafId = null
    }
  }

  loop() {
    if (!this.running) return
    if (this.paused) return

    const now = Date.now()
    const elapsed = now - this.lastFrameTime

    if (elapsed < this.frameInterval * 0.75) {
      this.scheduleFrame()
      return
    }

    const deltaTime = Math.min(elapsed, 50)
    this.lastFrameTime = now

    this.update(deltaTime)
    this.render()

    this.scheduleFrame()
  }

  scheduleFrame() {
    this.rafId = this.requestFrame(() => this.loop())
  }

  requestFrame(callback) {
    if (typeof requestAnimationFrame !== 'undefined') {
      return requestAnimationFrame(callback)
    }
    return setTimeout(callback, this.frameInterval)
  }

  cancelFrame(frameId) {
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(frameId)
      return
    }
    clearTimeout(frameId)
  }

  update(deltaTime) {
    if (this.sceneManager) {
      this.sceneManager.update(deltaTime)
    }
  }

  render() {
    if (!this.ctx || !this.sceneManager) return

    this.sceneManager.render(this.ctx)
  }

  handleShow(options) {
    this.launchOptions = options
    this.paused = false
    this.updateSystemInfo()
    this.resizeCanvas()

    if (this.sceneManager) {
      this.sceneManager.handleResize(this.screen)
      this.sceneManager.handleShow(options)
    }

    if (this.running && !this.rafId) {
      this.lastFrameTime = Date.now()
      this.scheduleFrame()
    }
  }

  handleHide() {
    this.paused = true
    if (this.rafId) {
      this.cancelFrame(this.rafId)
      this.rafId = null
    }

    if (this.sceneManager) {
      this.sceneManager.handleHide()
    }
  }
}

export default GameManager
