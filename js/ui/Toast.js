import Animation, { AnimationGroup } from '../engine/Animation.js'
import { COLORS, FONTS, LAYOUT } from '../utils/config.js'

const STYLE_MAP = {
  info: {
    fill: 'rgba(15, 23, 42, 0.92)',
    stroke: 'rgba(255,255,255,0.12)',
    text: COLORS.TEXT_PRIMARY
  },
  success: {
    fill: 'rgba(22, 101, 52, 0.94)',
    stroke: 'rgba(134, 239, 172, 0.32)',
    text: '#FFFFFF'
  },
  error: {
    fill: 'rgba(127, 29, 29, 0.94)',
    stroke: 'rgba(252, 165, 165, 0.32)',
    text: '#FFFFFF'
  },
  warning: {
    fill: 'rgba(154, 83, 12, 0.94)',
    stroke: 'rgba(253, 186, 116, 0.32)',
    text: '#FFFFFF'
  }
}

class Toast {
  static instance = null

  static getInstance(options = {}) {
    if (!Toast.instance) {
      Toast.instance = new Toast(options)
    } else if (options.screenWidth || options.screenHeight) {
      Toast.instance.setScreenSize(options.screenWidth, options.screenHeight)
    }
    return Toast.instance
  }

  constructor(options = {}) {
    this.screenWidth = options.screenWidth || 375
    this.screenHeight = options.screenHeight || 667
    this.visible = false
    this.active = false
    this.text = ''
    this.type = 'info'
    this.duration = 1800
    this.elapsed = 0
    this.alpha = 0
    this.offsetY = -10
    this.width = 0
    this.height = 44
    this.animations = new AnimationGroup()
  }

  setScreenSize(width, height) {
    this.screenWidth = width || this.screenWidth
    this.screenHeight = height || this.screenHeight
    return this
  }

  show(text, options = {}) {
    this.text = String(text || '')
    this.type = options.type || 'info'
    this.duration = typeof options.duration === 'number' ? options.duration : 1800
    this.elapsed = 0
    this.visible = true
    this.active = true
    this.alpha = 0
    this.offsetY = -10
    this.width = Math.min(this.screenWidth - LAYOUT.PAGE_PADDING * 2, options.width || 280)
    this.height = options.height || 44

    this.animations.clear()
    this.animations.add(new Animation({
      target: this,
      to: { alpha: 1, offsetY: 0 },
      duration: 180,
      easing: 'easeOut'
    }))

    return this
  }

  success(text, options = {}) {
    return this.show(text, { ...options, type: 'success' })
  }

  error(text, options = {}) {
    return this.show(text, { ...options, type: 'error' })
  }

  warning(text, options = {}) {
    return this.show(text, { ...options, type: 'warning' })
  }

  info(text, options = {}) {
    return this.show(text, { ...options, type: 'info' })
  }

  hide() {
    if (!this.visible || !this.active) return this

    this.active = false
    this.animations.clear()
    this.animations.add(new Animation({
      target: this,
      to: { alpha: 0, offsetY: -10 },
      duration: 180,
      easing: 'easeIn',
      onComplete: () => {
        this.visible = false
      }
    }))

    return this
  }

  update(deltaTime) {
    if (!this.visible) return

    this.animations.update(deltaTime)
    if (!this.active) return

    this.elapsed += deltaTime
    if (this.elapsed >= this.duration) {
      this.hide()
    }
  }

  render(ctx) {
    if (!this.visible || !ctx || !this.text) return

    const style = STYLE_MAP[this.type] || STYLE_MAP.info
    const x = (this.screenWidth - this.width) / 2
    const y = Math.max(24, this.screenHeight * 0.12) + this.offsetY

    ctx.save()
    ctx.globalAlpha *= this.alpha
    ctx.shadowColor = COLORS.SHADOW
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 8
    ctx.fillStyle = style.fill
    this.roundRect(ctx, x, y, this.width, this.height, LAYOUT.BUTTON_RADIUS)
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = style.text
    ctx.font = FONTS.BODY
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.drawFittedText(ctx, this.text, x + this.width / 2, y + this.height / 2, this.width - 28)
    ctx.restore()
  }

  drawFittedText(ctx, text, x, y, maxWidth) {
    let value = String(text)
    while (value.length > 1 && ctx.measureText(value).width > maxWidth) {
      value = `${value.slice(0, -2)}...`
    }
    ctx.fillText(value, x, y)
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

export default Toast
