import Sprite from '../engine/Sprite.js'
import Animation, { AnimationGroup } from '../engine/Animation.js'
import AudioManager from '../managers/AudioManager.js'
import { COLORS, FONTS, LAYOUT } from '../utils/config.js'

class Button extends Sprite {
  constructor(options = {}) {
    super({
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || LAYOUT.BUTTON_WIDTH,
      height: options.height || LAYOUT.BUTTON_HEIGHT,
      anchorX: typeof options.anchorX === 'number' ? options.anchorX : 0.5,
      anchorY: typeof options.anchorY === 'number' ? options.anchorY : 0.5,
      visible: options.visible !== false,
      active: options.active !== false
    })

    this.text = options.text || ''
    this.icon = options.icon || null
    this.disabled = Boolean(options.disabled)
    this.pressed = false
    this.radius = typeof options.radius === 'number' ? options.radius : LAYOUT.BUTTON_RADIUS
    this.clickSound = options.clickSound !== false
    this.clickHandler = options.onClick || null
    this.customRender = options.customRender || null
    this.onClick = (point, target) => {
      if (this.disabled) return
      if (this.clickSound) {
        AudioManager.getInstance().play('CLICK')
      }
      if (this.clickHandler) {
        this.clickHandler(point, target || this)
      }
    }

    this.fillStyle = options.fillStyle || COLORS.PRIMARY
    this.pressedFillStyle = options.pressedFillStyle || COLORS.PRIMARY_DARK
    this.disabledFillStyle = options.disabledFillStyle || 'rgba(255, 255, 255, 0.18)'
    this.strokeStyle = options.strokeStyle || ''
    this.textColor = options.textColor || COLORS.TEXT_PRIMARY
    this.disabledTextColor = options.disabledTextColor || COLORS.TEXT_MUTED
    this.font = options.font || FONTS.BUTTON
    this.shadowColor = options.shadowColor || COLORS.SHADOW
    this.shadowBlur = typeof options.shadowBlur === 'number' ? options.shadowBlur : 10
    this.shadowOffsetY = typeof options.shadowOffsetY === 'number' ? options.shadowOffsetY : 4

    this.animations = new AnimationGroup()
  }

  update(deltaTime) {
    this.animations.update(deltaTime)
  }

  render(ctx) {
    if (!this.visible || !ctx) return

    const originX = this.x + this.width * this.anchorX
    const originY = this.y + this.height * this.anchorY
    const drawX = -this.width * this.anchorX
    const drawY = -this.height * this.anchorY

    ctx.save()
    ctx.globalAlpha *= this.alpha
    ctx.translate(originX, originY)
    ctx.rotate(this.rotation)
    ctx.scale(this.scaleX, this.scaleY)

    if (this.customRender) {
      this.customRender(ctx, this)
    } else {
      this.drawBackground(ctx, drawX, drawY)
      this.drawContent(ctx, drawX, drawY)
    }

    ctx.restore()
  }

  onPressStart() {
    if (this.disabled) return

    this.pressed = true
    this.animateScale(0.95)
  }

  onPressEnd() {
    if (this.disabled) return

    this.pressed = false
    this.animateScale(1)
  }

  setDisabled(disabled) {
    this.disabled = Boolean(disabled)
    this.active = !this.disabled
    return this
  }

  setText(text) {
    this.text = text
    return this
  }

  animateScale(scale) {
    this.animations.clear()
    this.animations.add(new Animation({
      target: this,
      to: {
        scaleX: scale,
        scaleY: scale
      },
      duration: 90,
      easing: 'easeOut'
    }))
  }

  drawBackground(ctx, x, y) {
    ctx.save()

    if (!this.disabled) {
      ctx.shadowColor = this.shadowColor
      ctx.shadowBlur = this.shadowBlur
      ctx.shadowOffsetY = this.shadowOffsetY
    }

    ctx.fillStyle = this.getFillStyle()
    this.roundRect(ctx, x, y, this.width, this.height, this.radius)
    ctx.fill()

    if (this.strokeStyle) {
      ctx.strokeStyle = this.strokeStyle
      ctx.lineWidth = 1
      ctx.stroke()
    }

    ctx.restore()
  }

  drawContent(ctx, x, y) {
    ctx.save()
    ctx.fillStyle = this.disabled ? this.disabledTextColor : this.textColor
    ctx.font = this.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const centerX = x + this.width / 2
    const centerY = y + this.height / 2

    if (this.icon) {
      const iconSize = Math.min(24, this.height * 0.46)
      const textWidth = this.text ? ctx.measureText(this.text).width : 0
      const gap = this.text ? 8 : 0
      const totalWidth = iconSize + gap + textWidth
      const iconX = centerX - totalWidth / 2
      const iconY = centerY - iconSize / 2

      ctx.drawImage(this.icon, iconX, iconY, iconSize, iconSize)

      if (this.text) {
        ctx.textAlign = 'left'
        ctx.fillText(this.text, iconX + iconSize + gap, centerY)
      }
    } else {
      ctx.fillText(this.text, centerX, centerY)
    }

    ctx.restore()
  }

  getFillStyle() {
    if (this.disabled) return this.disabledFillStyle
    if (this.pressed) return this.pressedFillStyle
    return this.fillStyle
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

export default Button
