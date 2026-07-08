import Animation, { AnimationGroup } from '../engine/Animation.js'
import Button from './Button.js'
import { COLORS, FONTS, LAYOUT } from '../utils/config.js'

const DEFAULT_WIDTH = 375
const DEFAULT_HEIGHT = 667

class Dialog {
  constructor(options = {}) {
    this.screenWidth = options.screenWidth || DEFAULT_WIDTH
    this.screenHeight = options.screenHeight || DEFAULT_HEIGHT
    this.inputManager = null
    this.unregisterFns = []

    this.visible = false
    this.active = false
    this.alpha = 0
    this.scaleX = 0.92
    this.scaleY = 0.92

    this.type = 'alert'
    this.title = ''
    this.message = ''
    this.placeholder = ''
    this.inputValue = ''
    this.maxLength = 24
    this.dismissOnBackdrop = false
    this.onConfirm = null
    this.onCancel = null
    this.onClose = null

    this.panel = { x: 0, y: 0, width: 0, height: 0 }
    this.inputRect = { x: 0, y: 0, width: 0, height: 0 }
    this.buttons = []
    this.animations = new AnimationGroup()

    this.boundKeyboardInput = this.handleKeyboardInput.bind(this)
    this.boundKeyboardConfirm = this.handleKeyboardConfirm.bind(this)
    this.boundKeyboardComplete = this.closeKeyboard.bind(this)
  }

  setScreenSize(width, height) {
    this.screenWidth = width || this.screenWidth
    this.screenHeight = height || this.screenHeight
    this.layout()
    return this
  }

  show(options = {}) {
    this.type = options.type || 'alert'
    this.title = options.title || this.getDefaultTitle()
    this.message = options.message || ''
    this.placeholder = options.placeholder || ''
    this.inputValue = options.defaultValue || ''
    this.maxLength = options.maxLength || 24
    this.dismissOnBackdrop = Boolean(options.dismissOnBackdrop)
    this.onConfirm = options.onConfirm || null
    this.onCancel = options.onCancel || null
    this.onClose = options.onClose || null

    this.visible = true
    this.active = true
    this.alpha = 0
    this.scaleX = 0.92
    this.scaleY = 0.92
    this.layout()
    this.playShowAnimation()

    if (this.type === 'input') {
      this.openKeyboard()
    }

    return this
  }

  alert(message, options = {}) {
    return this.show({
      ...options,
      type: 'alert',
      message
    })
  }

  confirm(message, options = {}) {
    return this.show({
      ...options,
      type: 'confirm',
      message
    })
  }

  input(message, options = {}) {
    return this.show({
      ...options,
      type: 'input',
      message
    })
  }

  hide(trigger = 'close') {
    if (!this.visible) return this

    this.active = false
    this.closeKeyboard()
    this.animations.clear()
    this.animations.add(new Animation({
      target: this,
      to: { alpha: 0, scaleX: 0.94, scaleY: 0.94 },
      duration: 160,
      easing: 'easeIn',
      onComplete: () => {
        this.visible = false
        this.buttons = []
        if (this.onClose) this.onClose(trigger)
      }
    }))

    return this
  }

  register(inputManager) {
    this.unregister()
    this.inputManager = inputManager
    if (!inputManager) return this

    this.unregisterFns.push(inputManager.register(this, { priority: 1000 }))
    this.buttons.forEach((button) => {
      this.unregisterFns.push(inputManager.register(button, { priority: 1001 }))
    })

    return this
  }

  unregister() {
    this.unregisterFns.forEach((dispose) => dispose && dispose())
    this.unregisterFns = []
    return this
  }

  update(deltaTime) {
    this.animations.update(deltaTime)
    this.buttons.forEach((button) => button.update(deltaTime))
  }

  render(ctx) {
    if (!this.visible || !ctx) return

    this.drawBackdrop(ctx)
    this.drawPanel(ctx)
    this.buttons.forEach((button) => button.render(ctx))
  }

  hitTest(x, y) {
    return this.visible && x >= 0 && y >= 0 && x <= this.screenWidth && y <= this.screenHeight
  }

  onClick(point) {
    if (!this.visible || !point) return

    if (this.type === 'input' && this.isInsideRect(point.x, point.y, this.inputRect)) {
      this.openKeyboard()
      return
    }

    if (!this.isInsideRect(point.x, point.y, this.panel) && this.dismissOnBackdrop) {
      this.handleCancel()
    }
  }

  layout() {
    const width = Math.min(this.screenWidth - LAYOUT.PAGE_PADDING * 2, 320)
    const hasInput = this.type === 'input'
    const height = hasInput ? 280 : 236
    const x = (this.screenWidth - width) / 2
    const y = Math.max(72, (this.screenHeight - height) / 2)

    this.panel = { x, y, width, height }
    this.inputRect = {
      x: x + 24,
      y: y + 132,
      width: width - 48,
      height: 48
    }

    this.createButtons()
    if (this.inputManager) {
      this.register(this.inputManager)
    }
  }

  createButtons() {
    const buttonY = this.panel.y + this.panel.height - 44
    const centerX = this.panel.x + this.panel.width / 2
    const buttonHeight = 44

    if (this.type === 'alert') {
      this.buttons = [
        new Button({
          x: centerX - 90,
          y: buttonY - buttonHeight / 2,
          width: 180,
          height: buttonHeight,
          text: '确定',
          fillStyle: COLORS.PRIMARY,
          onClick: () => this.handleConfirm()
        })
      ]
      return
    }

    const buttonWidth = 124
    this.buttons = [
      new Button({
        x: centerX - buttonWidth - 8,
        y: buttonY - buttonHeight / 2,
        width: buttonWidth,
        height: buttonHeight,
        text: '取消',
        fillStyle: 'rgba(255,255,255,0.16)',
        pressedFillStyle: 'rgba(255,255,255,0.24)',
        strokeStyle: 'rgba(255,255,255,0.22)',
        onClick: () => this.handleCancel()
      }),
      new Button({
        x: centerX + 8,
        y: buttonY - buttonHeight / 2,
        width: buttonWidth,
        height: buttonHeight,
        text: '确定',
        fillStyle: COLORS.PRIMARY,
        onClick: () => this.handleConfirm()
      })
    ]
  }

  handleConfirm() {
    const value = this.type === 'input' ? this.inputValue.trim() : undefined
    const shouldClose = this.onConfirm ? this.onConfirm(value, this) !== false : true
    if (shouldClose) this.hide('confirm')
  }

  handleCancel() {
    const shouldClose = this.onCancel ? this.onCancel(this) !== false : true
    if (shouldClose) this.hide('cancel')
  }

  handleKeyboardInput(event) {
    const value = event && event.value ? String(event.value) : ''
    this.inputValue = value.slice(0, this.maxLength)
  }

  handleKeyboardConfirm(event) {
    if (event && typeof event.value === 'string') {
      this.inputValue = event.value.slice(0, this.maxLength)
    }
    this.handleConfirm()
  }

  openKeyboard() {
    if (typeof wx === 'undefined' || !wx.showKeyboard) return

    wx.offKeyboardInput && wx.offKeyboardInput(this.boundKeyboardInput)
    wx.offKeyboardConfirm && wx.offKeyboardConfirm(this.boundKeyboardConfirm)
    wx.offKeyboardComplete && wx.offKeyboardComplete(this.boundKeyboardComplete)
    wx.onKeyboardInput && wx.onKeyboardInput(this.boundKeyboardInput)
    wx.onKeyboardConfirm && wx.onKeyboardConfirm(this.boundKeyboardConfirm)
    wx.onKeyboardComplete && wx.onKeyboardComplete(this.boundKeyboardComplete)
    wx.showKeyboard({
      defaultValue: this.inputValue,
      maxLength: this.maxLength,
      confirmType: 'done'
    })
  }

  closeKeyboard() {
    if (typeof wx === 'undefined') return

    wx.offKeyboardInput && wx.offKeyboardInput(this.boundKeyboardInput)
    wx.offKeyboardConfirm && wx.offKeyboardConfirm(this.boundKeyboardConfirm)
    wx.offKeyboardComplete && wx.offKeyboardComplete(this.boundKeyboardComplete)
    wx.hideKeyboard && wx.hideKeyboard()
  }

  playShowAnimation() {
    this.animations.clear()
    this.animations.add(new Animation({
      target: this,
      to: { alpha: 1, scaleX: 1, scaleY: 1 },
      duration: 220,
      easing: 'easeOutBack'
    }))
  }

  drawBackdrop(ctx) {
    ctx.save()
    ctx.globalAlpha = this.alpha
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)'
    ctx.fillRect(0, 0, this.screenWidth, this.screenHeight)
    ctx.restore()
  }

  drawPanel(ctx) {
    const { x, y, width, height } = this.panel
    const originX = x + width / 2
    const originY = y + height / 2

    ctx.save()
    ctx.globalAlpha *= this.alpha
    ctx.translate(originX, originY)
    ctx.scale(this.scaleX, this.scaleY)
    ctx.translate(-originX, -originY)

    ctx.shadowColor = COLORS.SHADOW
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 10
    ctx.fillStyle = 'rgba(30, 41, 59, 0.96)'
    this.roundRect(ctx, x, y, width, height, LAYOUT.PANEL_RADIUS)
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.stroke()

    this.drawText(ctx)
    if (this.type === 'input') this.drawInput(ctx)

    ctx.restore()
  }

  drawText(ctx) {
    const { x, y, width } = this.panel

    ctx.save()
    ctx.fillStyle = COLORS.TEXT_PRIMARY
    ctx.font = FONTS.SUBTITLE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(this.title, x + width / 2, y + 24)

    ctx.fillStyle = COLORS.TEXT_SECONDARY
    ctx.font = FONTS.BODY
    this.drawWrappedText(ctx, this.message, x + 24, y + 74, width - 48, 26, 3)
    ctx.restore()
  }

  drawInput(ctx) {
    const { x, y, width, height } = this.inputRect

    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    this.roundRect(ctx, x, y, width, height, 8)
    ctx.fill()
    ctx.strokeStyle = COLORS.PRIMARY
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.font = FONTS.BODY
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = this.inputValue ? COLORS.TEXT_PRIMARY : COLORS.TEXT_MUTED
    ctx.fillText(this.inputValue || this.placeholder, x + 14, y + height / 2)
    ctx.restore()
  }

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const chars = String(text || '').split('')
    let line = ''
    let lineCount = 0

    chars.forEach((char) => {
      const testLine = line + char
      if (ctx.measureText(testLine).width > maxWidth && line) {
        if (lineCount < maxLines) ctx.fillText(line, x, y + lineCount * lineHeight)
        line = char
        lineCount += 1
      } else {
        line = testLine
      }
    })

    if (line && lineCount < maxLines) {
      ctx.fillText(line, x, y + lineCount * lineHeight)
    }
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

  isInsideRect(x, y, rect) {
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height
  }

  getDefaultTitle() {
    if (this.type === 'confirm') return '确认'
    if (this.type === 'input') return '输入'
    return '提示'
  }
}

export default Dialog
