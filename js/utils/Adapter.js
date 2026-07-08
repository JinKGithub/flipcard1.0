const DEFAULT_WIDTH = 375
const DEFAULT_HEIGHT = 667
const MAX_PIXEL_RATIO = 3

class Adapter {
  static instance = null

  static getInstance(options = {}) {
    if (!Adapter.instance) {
      Adapter.instance = new Adapter(options)
    }
    return Adapter.instance
  }

  constructor(options = {}) {
    if (Adapter.instance) return Adapter.instance

    this.designWidth = options.designWidth || DEFAULT_WIDTH
    this.designHeight = options.designHeight || DEFAULT_HEIGHT
    this.maxPixelRatio = options.maxPixelRatio || MAX_PIXEL_RATIO
    this.systemInfo = null
    this.screen = this.createFallbackScreen()

    Adapter.instance = this
  }

  /**
   * Read device information from WeChat and compute the screen model.
   */
  init(options = {}) {
    this.designWidth = options.designWidth || this.designWidth
    this.designHeight = options.designHeight || this.designHeight
    this.maxPixelRatio = options.maxPixelRatio || this.maxPixelRatio
    this.refresh()
    return this
  }

  /**
   * Refresh system info. Call this after orientation/window changes.
   */
  refresh() {
    this.systemInfo = this.getSystemInfo()
    this.screen = this.createScreenInfo(this.systemInfo)
    return this.screen
  }

  /**
   * Safe wrapper around wx.getSystemInfoSync.
   */
  getSystemInfo() {
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        return wx.getSystemInfoSync()
      } catch (error) {}
    }

    return {
      windowWidth: this.designWidth,
      windowHeight: this.designHeight,
      screenWidth: this.designWidth,
      screenHeight: this.designHeight,
      pixelRatio: 1,
      platform: 'devtools',
      model: 'unknown',
      system: 'unknown'
    }
  }

  /**
   * Build all dimensions used by scenes from raw system info.
   */
  createScreenInfo(info) {
    const width = Number(info.windowWidth || info.screenWidth || this.designWidth)
    const height = Number(info.windowHeight || info.screenHeight || this.designHeight)
    const rawPixelRatio = Number(info.pixelRatio || 1)
    const pixelRatio = Math.max(1, Math.min(rawPixelRatio, this.maxPixelRatio))
    const safeArea = this.normalizeSafeArea(info.safeArea, width, height)
    const safeInsets = this.getSafeInsets(safeArea, width, height)
    const scaleX = width / this.designWidth
    const scaleY = height / this.designHeight
    const fitScale = Math.min(scaleX, scaleY)
    const fillScale = Math.max(scaleX, scaleY)
    const aspectRatio = height / width

    return {
      width,
      height,
      pixelRatio,
      rawPixelRatio,
      designWidth: this.designWidth,
      designHeight: this.designHeight,
      scaleX,
      scaleY,
      fitScale,
      fillScale,
      aspectRatio,
      safeArea,
      safeInsets,
      contentWidth: safeArea.width,
      contentHeight: safeArea.height,
      isSmallScreen: width <= 360 || height <= 640,
      isTallScreen: aspectRatio >= 2,
      isWideScreen: width / height >= 0.62,
      isLowEnd: this.isLowEndDevice(info)
    }
  }

  /**
   * Normalize safe area. Devices without notches use the full window.
   */
  normalizeSafeArea(safeArea, width, height) {
    if (!safeArea) {
      return {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height
      }
    }

    return {
      left: Number(safeArea.left || 0),
      top: Number(safeArea.top || 0),
      right: Number(safeArea.right || width),
      bottom: Number(safeArea.bottom || height),
      width: Number(safeArea.width || width),
      height: Number(safeArea.height || height)
    }
  }

  /**
   * Convert safe area to edge insets for easier layout math.
   */
  getSafeInsets(safeArea, width, height) {
    return {
      top: Math.max(0, safeArea.top),
      right: Math.max(0, width - safeArea.right),
      bottom: Math.max(0, height - safeArea.bottom),
      left: Math.max(0, safeArea.left)
    }
  }

  /**
   * Resize canvas for high-DPI rendering while keeping logical coordinates.
   */
  resizeCanvas(canvas, ctx, screen = this.screen) {
    if (!canvas || !ctx) return

    const width = Math.floor(screen.width * screen.pixelRatio)
    const height = Math.floor(screen.height * screen.pixelRatio)

    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    canvas.style = canvas.style || {}
    canvas.style.width = `${screen.width}px`
    canvas.style.height = `${screen.height}px`
    ctx.setTransform(screen.pixelRatio, 0, 0, screen.pixelRatio, 0, 0)
    ctx.imageSmoothingEnabled = true
  }

  /**
   * Create an offscreen canvas for prerendering static UI or card backs.
   */
  createOffscreenCanvas(width, height, pixelRatio = this.screen.pixelRatio) {
    let canvas = null
    if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
      canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: Math.ceil(width * pixelRatio),
        height: Math.ceil(height * pixelRatio)
      })
    } else if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(Math.ceil(width * pixelRatio), Math.ceil(height * pixelRatio))
    } else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas')
      canvas.width = Math.ceil(width * pixelRatio)
      canvas.height = Math.ceil(height * pixelRatio)
    }

    if (!canvas) return null

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      ctx.imageSmoothingEnabled = true
    }

    return {
      canvas,
      ctx,
      width,
      height,
      pixelRatio
    }
  }

  /**
   * Scale a design-space x coordinate into device space.
   */
  x(value) {
    return value * this.screen.scaleX
  }

  /**
   * Scale a design-space y coordinate into device space.
   */
  y(value) {
    return value * this.screen.scaleY
  }

  /**
   * Scale a size using fitScale to keep touch targets balanced.
   */
  size(value) {
    return value * this.screen.fitScale
  }

  /**
   * Apply safe-area top inset to a y coordinate.
   */
  safeTop(value = 0) {
    return this.screen.safeInsets.top + value
  }

  /**
   * Apply safe-area bottom inset to a y coordinate measured from bottom.
   */
  safeBottom(value = 0) {
    return this.screen.height - this.screen.safeInsets.bottom - value
  }

  /**
   * Keep a rectangle inside the screen safe area.
   */
  clampRectToSafeArea(rect) {
    const area = this.screen.safeArea
    const x = Math.max(area.left, Math.min(rect.x, area.right - rect.width))
    const y = Math.max(area.top, Math.min(rect.y, area.bottom - rect.height))
    return {
      ...rect,
      x,
      y
    }
  }

  /**
   * Pick a smaller effect budget on low-end devices.
   */
  getParticleBudget(defaultCount = 30) {
    if (this.screen.isLowEnd) return Math.max(8, Math.floor(defaultCount * 0.45))
    if (this.screen.isSmallScreen) return Math.max(12, Math.floor(defaultCount * 0.65))
    return defaultCount
  }

  /**
   * Determine whether the device should use conservative visuals.
   */
  isLowEndDevice(info) {
    const benchmark = Number(info.benchmarkLevel || 0)
    if (benchmark > 0 && benchmark < 15) return true
    const model = String(info.model || '').toLowerCase()
    return model.includes('iphone 6') || model.includes('iphone 5')
  }

  createFallbackScreen() {
    return this.createScreenInfo({
      windowWidth: this.designWidth,
      windowHeight: this.designHeight,
      pixelRatio: 1
    })
  }
}

export default Adapter
