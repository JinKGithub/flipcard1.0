import Sprite from '../engine/Sprite.js'
import Animation, { AnimationGroup } from '../engine/Animation.js'
import { CARD_BACK_IMAGE, CARD_STATE, COLORS, LAYOUT } from '../utils/config.js'

class Card extends Sprite {
  constructor(options = {}) {
    super({
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 0,
      height: options.height || 0,
      anchorX: 0.5,
      anchorY: 0.5,
      visible: options.visible !== false,
      active: options.active !== false
    })

    this.id = options.id || ''
    this.pairId = options.pairId || ''
    this.frontImage = options.frontImage || options.imageUrl || ''
    this.backImage = options.backImage || CARD_BACK_IMAGE
    this.state = options.state || CARD_STATE.HIDDEN
    this.position = options.position || { row: 0, col: 0 }

    this.frontTexture = options.frontTexture || null
    this.backTexture = options.backTexture || null
    this.flipProgress = 0
    this.locked = false
    this.isMatchedAnimating = false
    this.animations = new AnimationGroup()
  }

  update(deltaTime) {
    this.animations.update(deltaTime)
  }

  render(ctx) {
    if (!this.visible || !ctx) return

    const progressScale = this.getFlipScaleX()
    const drawScaleX = this.scaleX * progressScale
    const image = this.getCurrentTexture()

    ctx.save()
    ctx.globalAlpha *= this.alpha

    const originX = this.x + this.width * this.anchorX
    const originY = this.y + this.height * this.anchorY
    const drawX = -this.width * this.anchorX
    const drawY = -this.height * this.anchorY

    ctx.translate(originX, originY)
    ctx.rotate(this.rotation)
    ctx.scale(drawScaleX, this.scaleY)

    this.drawCardShadow(ctx, drawX, drawY)
    this.drawCardBackground(ctx, drawX, drawY)

    if (image) {
      ctx.drawImage(image, drawX, drawY, this.width, this.height)
    } else {
      this.drawPlaceholder(ctx, drawX, drawY)
    }

    ctx.restore()
  }

  flip(targetState = null) {
    if (!this.canFlip()) return null

    const nextState = targetState || (
      this.state === CARD_STATE.HIDDEN ? CARD_STATE.REVEALED : CARD_STATE.HIDDEN
    )

    if (nextState === this.state) return null

    this.locked = true
    this.state = nextState
    this.flipProgress = 0

    return this.animations.add(new Animation({
      target: this,
      from: { flipProgress: 0 },
      to: { flipProgress: 1 },
      duration: 600,
      easing: 'easeInOut',
      onComplete: () => {
        this.state = nextState
        this.flipProgress = 0
        this.locked = false
      }
    }))
  }

  matched() {
    this.state = CARD_STATE.MATCHED
    this.locked = true
    this.isMatchedAnimating = true

    this.animations.tween(this, {
      scaleX: 1.08,
      scaleY: 1.08,
      rotation: 0.05
    }, {
      duration: 160,
      easing: 'easeOut',
      onComplete: () => {
        this.animations.tween(this, {
          scaleX: 1,
          scaleY: 1,
          rotation: 0
        }, {
          duration: 180,
          easing: 'easeOutBack',
          onComplete: () => {
            this.locked = false
            this.isMatchedAnimating = false
          }
        })
      }
    })
  }

  hide() {
    if (this.state === CARD_STATE.HIDDEN) return null
    return this.flip(CARD_STATE.HIDDEN)
  }

  reveal() {
    if (this.state !== CARD_STATE.HIDDEN) return null
    return this.flip(CARD_STATE.REVEALED)
  }

  canFlip() {
    return this.active
      && this.visible
      && !this.locked
      && this.state !== CARD_STATE.MATCHED
  }

  isRevealed() {
    return this.state === CARD_STATE.REVEALED || this.state === CARD_STATE.MATCHED
  }

  isHidden() {
    return this.state === CARD_STATE.HIDDEN
  }

  isMatched() {
    return this.state === CARD_STATE.MATCHED
  }

  setTextures(frontTexture, backTexture) {
    this.frontTexture = frontTexture || this.frontTexture
    this.backTexture = backTexture || this.backTexture
  }

  setGridPosition(row, col) {
    this.position = { row, col }
    return this
  }

  toJSON() {
    return {
      id: this.id,
      pairId: this.pairId,
      imageUrl: this.frontImage,
      state: this.state,
      position: this.position
    }
  }

  getCurrentTexture() {
    return this.isRevealed() ? this.frontTexture : this.backTexture
  }

  getFlipScaleX() {
    if (this.flipProgress <= 0) return 1

    const scale = Math.abs(1 - this.flipProgress * 2)
    return Math.max(0.04, scale)
  }

  drawCardShadow(ctx, x, y) {
    ctx.save()
    ctx.fillStyle = COLORS.SHADOW
    this.roundRect(ctx, x + 2, y + 5, this.width, this.height, LAYOUT.CARD_RADIUS)
    ctx.fill()
    ctx.restore()
  }

  drawCardBackground(ctx, x, y) {
    ctx.save()
    ctx.fillStyle = this.isRevealed() ? COLORS.CARD_FACE : COLORS.CARD_BACK
    this.roundRect(ctx, x, y, this.width, this.height, LAYOUT.CARD_RADIUS)
    ctx.fill()
    ctx.restore()
  }

  drawPlaceholder(ctx, x, y) {
    ctx.save()
    ctx.fillStyle = this.isRevealed() ? COLORS.PRIMARY : COLORS.PRIMARY_DARK
    this.roundRect(ctx, x + 8, y + 8, this.width - 16, this.height - 16, 6)
    ctx.fill()

    if (this.isRevealed()) {
      ctx.fillStyle = COLORS.TEXT_PRIMARY
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(this.pairId.replace('pair_', ''), x + this.width / 2, y + this.height / 2)
    }

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

export default Card
