export const Easing = {
  linear(t) {
    return t
  },

  easeIn(t) {
    return t * t
  },

  easeOut(t) {
    return 1 - Math.pow(1 - t, 2)
  },

  easeInOut(t) {
    return t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2
  },

  easeOutBack(t) {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }
}

class Animation {
  constructor(options = {}) {
    this.target = options.target || null
    this.to = options.to || {}
    this.from = options.from || null
    this.duration = Math.max(0, options.duration || 300)
    this.delay = Math.max(0, options.delay || 0)
    this.easing = this.resolveEasing(options.easing || 'easeInOut')
    this.onStart = options.onStart || null
    this.onUpdate = options.onUpdate || null
    this.onComplete = options.onComplete || null

    this.elapsed = 0
    this.started = false
    this.finished = false
    this.startValues = {}
    this.endValues = {}
  }

  start() {
    if (!this.target) {
      throw new Error('Animation requires a target.')
    }

    this.started = true
    this.finished = false
    this.elapsed = 0
    this.captureValues()

    if (this.onStart) {
      this.onStart(this)
    }

    if (this.duration === 0 && this.delay === 0) {
      this.applyValues(1)
      this.complete()
    }

    return this
  }

  update(deltaTime) {
    if (this.finished) return true
    if (!this.started) this.start()

    this.elapsed += deltaTime

    if (this.elapsed < this.delay) {
      return false
    }

    const activeElapsed = this.elapsed - this.delay
    const progress = this.duration === 0
      ? 1
      : Math.min(activeElapsed / this.duration, 1)
    const easedProgress = this.easing(progress)

    this.applyValues(easedProgress)

    if (this.onUpdate) {
      this.onUpdate(easedProgress, this)
    }

    if (progress >= 1) {
      this.complete()
      return true
    }

    return false
  }

  stop(applyEndValues = false) {
    if (applyEndValues) {
      this.applyValues(1)
    }

    this.finished = true
    return this
  }

  complete() {
    if (this.finished) return

    this.finished = true
    this.applyValues(1)

    if (this.onComplete) {
      this.onComplete(this)
    }
  }

  captureValues() {
    Object.keys(this.to).forEach((key) => {
      const start = this.from && typeof this.from[key] === 'number'
        ? this.from[key]
        : Number(this.target[key]) || 0

      this.startValues[key] = start
      this.endValues[key] = Number(this.to[key])
      this.target[key] = start
    })
  }

  applyValues(progress) {
    Object.keys(this.endValues).forEach((key) => {
      const start = this.startValues[key]
      const end = this.endValues[key]
      this.target[key] = start + (end - start) * progress
    })
  }

  resolveEasing(easing) {
    if (typeof easing === 'function') {
      return easing
    }

    return Easing[easing] || Easing.linear
  }

  static tween(target, to, options = {}) {
    return new Animation({
      ...options,
      target,
      to
    })
  }
}

export class AnimationGroup {
  constructor() {
    this.animations = []
  }

  add(animation) {
    this.animations.push(animation)
    return animation
  }

  tween(target, to, options = {}) {
    const animation = Animation.tween(target, to, options)
    this.add(animation)
    return animation
  }

  update(deltaTime) {
    const currentAnimations = this.animations
    this.animations = []

    currentAnimations.forEach((animation) => {
      const finished = animation.update(deltaTime)
      if (!finished) {
        this.animations.push(animation)
      }
    })
  }

  clear(applyEndValues = false) {
    this.animations.forEach((animation) => animation.stop(applyEndValues))
    this.animations = []
  }
}

export default Animation
