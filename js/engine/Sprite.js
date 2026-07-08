class Sprite {
  constructor(options = {}) {
    this.x = options.x || 0
    this.y = options.y || 0
    this.width = options.width || 0
    this.height = options.height || 0
    this.rotation = options.rotation || 0
    this.scale = options.scale || 1
    this.scaleX = options.scaleX || this.scale
    this.scaleY = options.scaleY || this.scale
    this.alpha = typeof options.alpha === 'number' ? options.alpha : 1

    this.visible = options.visible !== false
    this.active = options.active !== false
    this.anchorX = typeof options.anchorX === 'number' ? options.anchorX : 0.5
    this.anchorY = typeof options.anchorY === 'number' ? options.anchorY : 0.5
    this.image = options.image || null
    this.name = options.name || ''
  }

  update() {}

  render(ctx) {
    if (!this.visible || !ctx) return

    ctx.save()
    ctx.globalAlpha *= this.alpha

    const originX = this.x + this.width * this.anchorX
    const originY = this.y + this.height * this.anchorY

    ctx.translate(originX, originY)
    ctx.rotate(this.rotation)
    ctx.scale(this.scaleX, this.scaleY)

    const drawX = -this.width * this.anchorX
    const drawY = -this.height * this.anchorY

    if (this.image) {
      ctx.drawImage(this.image, drawX, drawY, this.width, this.height)
    }

    ctx.restore()
  }

  hitTest(pointX, pointY) {
    if (!this.visible || !this.active) return false

    const centerX = this.x + this.width * this.anchorX
    const centerY = this.y + this.height * this.anchorY
    const local = this.toLocalPoint(pointX, pointY, centerX, centerY)

    const left = -this.width * this.anchorX
    const top = -this.height * this.anchorY
    const right = left + this.width
    const bottom = top + this.height

    return local.x >= left
      && local.x <= right
      && local.y >= top
      && local.y <= bottom
  }

  setPosition(x, y) {
    this.x = x
    this.y = y
    return this
  }

  setSize(width, height) {
    this.width = width
    this.height = height
    return this
  }

  setScale(scaleX, scaleY = scaleX) {
    this.scale = scaleX
    this.scaleX = scaleX
    this.scaleY = scaleY
    return this
  }

  setAlpha(alpha) {
    this.alpha = Math.max(0, Math.min(1, alpha))
    return this
  }

  getBounds() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      left: this.x,
      top: this.y,
      right: this.x + this.width,
      bottom: this.y + this.height
    }
  }

  toLocalPoint(pointX, pointY, centerX, centerY) {
    const dx = pointX - centerX
    const dy = pointY - centerY
    const cos = Math.cos(-this.rotation)
    const sin = Math.sin(-this.rotation)
    const rotatedX = dx * cos - dy * sin
    const rotatedY = dx * sin + dy * cos

    return {
      x: rotatedX / (this.scaleX || 1),
      y: rotatedY / (this.scaleY || 1)
    }
  }
}

export default Sprite
