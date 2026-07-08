class InputManager {
  static instance = null

  static getInstance() {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager()
    }
    return InputManager.instance
  }

  constructor() {
    if (InputManager.instance) {
      return InputManager.instance
    }

    this.canvas = null
    this.pixelRatio = 1
    this.enabled = true
    this.throttleMs = 300
    this.lastTapTime = 0
    this.touchStartPoint = null
    this.touchStartTarget = null

    this.interactives = []
    this.listeners = {
      touchstart: [],
      touchend: [],
      tap: []
    }

    this.boundTouchStart = this.handleTouchStart.bind(this)
    this.boundTouchEnd = this.handleTouchEnd.bind(this)

    InputManager.instance = this
  }

  init({ canvas, pixelRatio = 1, throttleMs = 300 } = {}) {
    this.canvas = canvas || this.canvas
    this.pixelRatio = pixelRatio || 1
    this.throttleMs = throttleMs

    if (typeof wx !== 'undefined') {
      wx.offTouchStart && wx.offTouchStart(this.boundTouchStart)
      wx.offTouchEnd && wx.offTouchEnd(this.boundTouchEnd)
      wx.onTouchStart(this.boundTouchStart)
      wx.onTouchEnd(this.boundTouchEnd)
    }

    return this
  }

  destroy() {
    if (typeof wx !== 'undefined') {
      wx.offTouchStart && wx.offTouchStart(this.boundTouchStart)
      wx.offTouchEnd && wx.offTouchEnd(this.boundTouchEnd)
    }

    this.clear()
    this.touchStartPoint = null
    this.touchStartTarget = null
  }

  register(target, options = {}) {
    if (!target || typeof target.hitTest !== 'function') {
      throw new Error('InputManager.register requires a target with hitTest(x, y).')
    }

    const item = {
      target,
      priority: options.priority || 0,
      enabled: options.enabled !== false
    }

    this.interactives.push(item)
    this.sortInteractives()

    return () => this.unregister(target)
  }

  unregister(target) {
    this.interactives = this.interactives.filter((item) => item.target !== target)
  }

  clear() {
    this.interactives = []
    this.listeners = {
      touchstart: [],
      touchend: [],
      tap: []
    }
  }

  on(eventName, handler) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = []
    }

    this.listeners[eventName].push(handler)
    return () => this.off(eventName, handler)
  }

  off(eventName, handler) {
    if (!this.listeners[eventName]) return

    this.listeners[eventName] = this.listeners[eventName].filter((listener) => listener !== handler)
  }

  handleTouchStart(event) {
    if (!this.enabled) return

    const point = this.getTouchPoint(event)
    if (!point) return

    this.touchStartPoint = point
    this.touchStartTarget = this.findTarget(point.x, point.y)

    if (this.touchStartTarget && typeof this.touchStartTarget.onPressStart === 'function') {
      this.touchStartTarget.onPressStart(point)
    }

    this.emit('touchstart', {
      ...point,
      target: this.touchStartTarget,
      originalEvent: event
    })
  }

  handleTouchEnd(event) {
    if (!this.enabled) return

    const point = this.getTouchPoint(event, true)
    if (!point) return

    const now = Date.now()
    const target = this.findTarget(point.x, point.y)
    const startTarget = this.touchStartTarget
    const isSameTarget = target && startTarget && target === startTarget
    const throttled = now - this.lastTapTime < this.throttleMs

    if (startTarget && typeof startTarget.onPressEnd === 'function') {
      startTarget.onPressEnd(point)
    }

    this.emit('touchend', {
      ...point,
      target,
      originalEvent: event
    })

    if (isSameTarget && !throttled) {
      this.lastTapTime = now
      this.dispatchTap(target, point, event)
    }

    this.touchStartPoint = null
    this.touchStartTarget = null
  }

  dispatchTap(target, point, originalEvent) {
    if (typeof target.onClick === 'function') {
      target.onClick(point, target)
    }

    this.emit('tap', {
      ...point,
      target,
      originalEvent
    })
  }

  findTarget(x, y) {
    for (const item of this.interactives) {
      if (!item.enabled) continue

      const target = item.target
      if (target.disabled || target.visible === false || target.active === false) continue

      if (target.hitTest(x, y)) {
        return target
      }
    }

    return null
  }

  getTouchPoint(event, preferChangedTouches = false) {
    const touches = preferChangedTouches && event.changedTouches && event.changedTouches.length
      ? event.changedTouches
      : event.touches

    if (!touches || !touches.length) return null

    return this.screenToCanvas(touches[0].clientX, touches[0].clientY)
  }

  screenToCanvas(screenX, screenY) {
    if (!this.canvas) {
      return { x: screenX, y: screenY, screenX, screenY }
    }

    const rect = this.getCanvasRect()
    const scaleX = rect.width ? this.canvas.width / this.pixelRatio / rect.width : 1
    const scaleY = rect.height ? this.canvas.height / this.pixelRatio / rect.height : 1

    return {
      x: (screenX - rect.left) * scaleX,
      y: (screenY - rect.top) * scaleY,
      screenX,
      screenY
    }
  }

  getCanvasRect() {
    if (this.canvas && typeof this.canvas.getBoundingClientRect === 'function') {
      return this.canvas.getBoundingClientRect()
    }

    return {
      left: 0,
      top: 0,
      width: this.canvas ? this.canvas.width / this.pixelRatio : 0,
      height: this.canvas ? this.canvas.height / this.pixelRatio : 0
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled)
  }

  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio || 1
  }

  setThrottle(ms) {
    this.throttleMs = Math.max(0, ms)
  }

  sortInteractives() {
    this.interactives.sort((a, b) => b.priority - a.priority)
  }

  emit(eventName, payload) {
    const eventListeners = this.listeners[eventName] || []
    eventListeners.forEach((listener) => listener(payload))
  }
}

export default InputManager
