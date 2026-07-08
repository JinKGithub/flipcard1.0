import Adapter from '../utils/Adapter.js'

class Renderer {
  static instance = null

  static getInstance() {
    if (!Renderer.instance) {
      Renderer.instance = new Renderer()
    }
    return Renderer.instance
  }

  constructor() {
    if (Renderer.instance) {
      return Renderer.instance
    }

    this.canvas = null
    this.ctx = null
    this.width = 0
    this.height = 0
    this.pixelRatio = 1
    this.adapter = Adapter.getInstance()
    this.offscreenCache = new Map()

    Renderer.instance = this
  }

  init(canvas, options = {}) {
    if (!canvas) {
      throw new Error('Renderer.init requires a canvas.')
    }

    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    const screen = this.adapter.refresh()

    this.width = options.width || screen.width || canvas.width
    this.height = options.height || screen.height || canvas.height
    this.pixelRatio = options.pixelRatio || screen.pixelRatio || 1

    this.resize(this.width, this.height, this.pixelRatio)
    return this
  }

  createOffscreen(key, width, height, painter, options = {}) {
    if (!key) {
      throw new Error('Renderer.createOffscreen requires a cache key.')
    }

    const pixelRatio = options.pixelRatio || this.pixelRatio
    const cached = this.offscreenCache.get(key)
    if (cached && cached.width === width && cached.height === height && cached.pixelRatio === pixelRatio) {
      return cached
    }

    const target = this.adapter.createOffscreenCanvas(width, height, pixelRatio)
    if (!target) return null

    if (typeof painter === 'function') {
      painter(target.ctx, target)
    }

    this.offscreenCache.set(key, target)
    return target
  }

  drawOffscreen(key, x, y, options = {}) {
    const cached = this.offscreenCache.get(key)
    if (!cached) return false

    this.drawImage(cached.canvas, x, y, options.width || cached.width, options.height || cached.height, {
      anchorX: options.anchorX || 0,
      anchorY: options.anchorY || 0,
      alpha: typeof options.alpha === 'number' ? options.alpha : 1
    })
    return true
  }

  clearOffscreen(key = null) {
    if (key) {
      this.offscreenCache.delete(key)
    } else {
      this.offscreenCache.clear()
    }
  }

  resize(width, height, pixelRatio = this.pixelRatio) {
    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio || 1

    if (!this.canvas || !this.ctx) return

    this.canvas.width = Math.floor(width * this.pixelRatio)
    this.canvas.height = Math.floor(height * this.pixelRatio)

    this.canvas.style = this.canvas.style || {}
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`

    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
  }

  clear(color = null) {
    this.ensureReady()

    this.ctx.clearRect(0, 0, this.width, this.height)

    if (color) {
      this.ctx.save()
      this.ctx.fillStyle = color
      this.ctx.fillRect(0, 0, this.width, this.height)
      this.ctx.restore()
    }
  }

  drawImage(image, x, y, width, height, options = {}) {
    this.ensureReady()
    if (!image) return

    const {
      sx,
      sy,
      sWidth,
      sHeight,
      rotation = 0,
      scaleX = 1,
      scaleY = 1,
      alpha = 1,
      anchorX = 0.5,
      anchorY = 0.5
    } = options

    this.ctx.save()
    this.ctx.globalAlpha = alpha

    const originX = x + width * anchorX
    const originY = y + height * anchorY

    this.ctx.translate(originX, originY)
    this.ctx.rotate(rotation)
    this.ctx.scale(scaleX, scaleY)

    const drawX = -width * anchorX
    const drawY = -height * anchorY

    if (typeof sx === 'number' && typeof sy === 'number' && sWidth && sHeight) {
      this.ctx.drawImage(image, sx, sy, sWidth, sHeight, drawX, drawY, width, height)
    } else {
      this.ctx.drawImage(image, drawX, drawY, width, height)
    }

    this.ctx.restore()
  }

  drawText(text, x, y, options = {}) {
    this.ensureReady()

    const {
      font = '20px sans-serif',
      color = '#FFFFFF',
      align = 'left',
      baseline = 'top',
      alpha = 1,
      maxWidth,
      strokeColor = '',
      strokeWidth = 0
    } = options

    this.ctx.save()
    this.ctx.globalAlpha = alpha
    this.ctx.font = font
    this.ctx.fillStyle = color
    this.ctx.textAlign = align
    this.ctx.textBaseline = baseline

    if (strokeColor && strokeWidth > 0) {
      this.ctx.strokeStyle = strokeColor
      this.ctx.lineWidth = strokeWidth
      if (maxWidth) {
        this.ctx.strokeText(String(text), x, y, maxWidth)
      } else {
        this.ctx.strokeText(String(text), x, y)
      }
    }

    if (maxWidth) {
      this.ctx.fillText(String(text), x, y, maxWidth)
    } else {
      this.ctx.fillText(String(text), x, y)
    }

    this.ctx.restore()
  }

  drawRect(x, y, width, height, options = {}) {
    this.ensureReady()

    const {
      fillStyle = '#FFFFFF',
      strokeStyle = '',
      lineWidth = 1,
      radius = 0,
      alpha = 1
    } = options

    this.ctx.save()
    this.ctx.globalAlpha = alpha

    if (radius > 0) {
      this.createRoundRectPath(x, y, width, height, radius)
    } else {
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
    }

    if (fillStyle) {
      this.ctx.fillStyle = fillStyle
      this.ctx.fill()
    }

    if (strokeStyle) {
      this.ctx.strokeStyle = strokeStyle
      this.ctx.lineWidth = lineWidth
      this.ctx.stroke()
    }

    this.ctx.restore()
  }

  drawCircle(x, y, radius, options = {}) {
    this.ensureReady()

    const {
      fillStyle = '#FFFFFF',
      strokeStyle = '',
      lineWidth = 1,
      alpha = 1,
      startAngle = 0,
      endAngle = Math.PI * 2,
      counterclockwise = false
    } = options

    this.ctx.save()
    this.ctx.globalAlpha = alpha
    this.ctx.beginPath()
    this.ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise)

    if (fillStyle) {
      this.ctx.fillStyle = fillStyle
      this.ctx.fill()
    }

    if (strokeStyle) {
      this.ctx.strokeStyle = strokeStyle
      this.ctx.lineWidth = lineWidth
      this.ctx.stroke()
    }

    this.ctx.restore()
  }

  createLinearGradient(x0, y0, x1, y1, colorStops) {
    this.ensureReady()

    const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1)
    colorStops.forEach((stop) => {
      gradient.addColorStop(stop.offset, stop.color)
    })
    return gradient
  }

  createRoundRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2)

    this.ctx.beginPath()
    this.ctx.moveTo(x + r, y)
    this.ctx.arcTo(x + width, y, x + width, y + height, r)
    this.ctx.arcTo(x + width, y + height, x, y + height, r)
    this.ctx.arcTo(x, y + height, x, y, r)
    this.ctx.arcTo(x, y, x + width, y, r)
    this.ctx.closePath()
  }

  ensureReady() {
    if (!this.canvas || !this.ctx) {
      throw new Error('Renderer has not been initialized.')
    }
  }
}

export default Renderer
