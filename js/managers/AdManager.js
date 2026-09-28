import { AD_UNITS } from '../utils/config.js'

const HOME_AD_MAX_WIDTH = 350
const HOME_AD_MIN_HEIGHT = 96

class AdManager {
  static instance = null

  static getInstance() {
    if (!AdManager.instance) AdManager.instance = new AdManager()
    return AdManager.instance
  }

  constructor() {
    if (AdManager.instance) return AdManager.instance

    this.homeAd = null
    this.homePlacement = null
    this.homeVisible = false
    this.homeSuppressed = false
    this.lastError = ''

    AdManager.instance = this
  }

  showHomeAd(slot = {}) {
    if (!this.isCustomAdSupported()) return false

    const placement = this.normalizeHomePlacement(slot)
    if (!placement || placement.maxBottom - placement.top < HOME_AD_MIN_HEIGHT) {
      this.hideHomeAd()
      this.homeSuppressed = true
      return false
    }

    this.homePlacement = placement
    this.homeSuppressed = false

    if (!this.homeAd) this.createHomeAd(placement)
    if (!this.homeAd) return false

    this.applyHomePlacement()
    if (!this.homeAdFitsPlacement()) {
      this.homeSuppressed = true
      this.hideHomeAd()
      return false
    }

    this.homeVisible = true
    this.callAdMethod(this.homeAd, 'show')
    return true
  }

  hideHomeAd() {
    this.homeVisible = false
    if (this.homeAd) this.callAdMethod(this.homeAd, 'hide')
  }

  destroyHomeAd() {
    this.homeVisible = false
    this.homePlacement = null
    if (this.homeAd) this.callAdMethod(this.homeAd, 'destroy')
    this.homeAd = null
  }

  isCustomAdSupported() {
    return typeof wx !== 'undefined' && typeof wx.createCustomAd === 'function'
  }

  normalizeHomePlacement(slot) {
    const screenWidth = Number(slot.screenWidth || 0)
    const safeLeft = Math.max(0, Number(slot.safeLeft || 0))
    const safeRight = Math.min(screenWidth, Number(slot.safeRight || screenWidth))
    const availableWidth = safeRight - safeLeft
    const width = Math.floor(Math.min(HOME_AD_MAX_WIDTH, availableWidth - 16))
    const top = Math.ceil(Number(slot.top || 0))
    const maxBottom = Math.floor(Number(slot.maxBottom || 0))

    if (!screenWidth || width <= 0 || maxBottom <= top) return null

    return {
      left: Math.floor(safeLeft + (availableWidth - width) / 2),
      top,
      width,
      maxBottom
    }
  }

  createHomeAd(placement) {
    try {
      const ad = wx.createCustomAd({
        adUnitId: AD_UNITS.HOME_CUSTOM,
        style: {
          left: placement.left,
          top: placement.top,
          width: placement.width
        }
      })

      if (!ad) return

      this.homeAd = ad
      if (typeof ad.onLoad === 'function') {
        ad.onLoad(() => this.handleHomeAdLoad(ad))
      }
      if (typeof ad.onError === 'function') {
        ad.onError((error) => this.handleHomeAdError(ad, error))
      }
      if (typeof ad.onClose === 'function') {
        ad.onClose(() => {
          if (this.homeAd === ad) this.homeVisible = false
        })
      }
    } catch (error) {
      this.lastError = this.getErrorMessage(error)
      this.homeAd = null
    }
  }

  handleHomeAdLoad(ad) {
    if (this.homeAd !== ad || !this.homePlacement) return

    this.applyHomePlacement()
    if (!this.homeAdFitsPlacement()) {
      this.homeSuppressed = true
      this.hideHomeAd()
      return
    }

    if (this.homeVisible) this.callAdMethod(ad, 'show')
  }

  handleHomeAdError(ad, error) {
    if (this.homeAd !== ad) return
    this.lastError = this.getErrorMessage(error)
    this.homeVisible = false
  }

  applyHomePlacement() {
    const ad = this.homeAd
    const placement = this.homePlacement
    if (!ad || !ad.style || !placement) return

    ad.style.left = placement.left
    ad.style.top = placement.top
    ad.style.width = placement.width
  }

  homeAdFitsPlacement() {
    if (!this.homeAd || !this.homePlacement) return false

    const realHeight = Number(this.homeAd.style && this.homeAd.style.realHeight)
    return !realHeight || this.homePlacement.top + realHeight <= this.homePlacement.maxBottom
  }

  callAdMethod(ad, method) {
    if (!ad || typeof ad[method] !== 'function') return

    try {
      const result = ad[method]()
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          this.lastError = this.getErrorMessage(error)
        })
      }
    } catch (error) {
      this.lastError = this.getErrorMessage(error)
    }
  }

  getErrorMessage(error) {
    return String((error && (error.errMsg || error.message)) || error || '')
  }
}

export default AdManager
