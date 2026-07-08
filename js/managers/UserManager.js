import CloudDB from '../utils/CloudDB.js'
import { STORAGE_KEYS, UI_IMAGES } from '../utils/config.js'

class UserManager {
  static instance = null
  static privacyHandlerRegistered = false

  static getInstance() {
    if (!UserManager.instance) {
      UserManager.instance = new UserManager()
    }
    return UserManager.instance
  }

  constructor() {
    if (UserManager.instance) return UserManager.instance

    this.cloudDB = CloudDB.getInstance()
    this.user = this.createDefaultUser()
    this.loaded = false
    this.loading = false
    this.authDenied = false
    this.lastAuthError = ''
    this.registerPrivacyAuthorizationHandler()

    UserManager.instance = this
  }

  async init() {
    if (this.loading) return this.user
    if (this.loaded) return this.user

    this.loading = true
    this.loadFromStorage()

    try {
      const loginResult = await this.login()
      if (loginResult && loginResult.openid) {
        this.user = this.mergeUser(this.user, {
          ...(loginResult.user || {}),
          openid: loginResult.openid,
          isGuest: false
        })
        this.saveToStorage()
      }
    } catch (error) {
      this.user = {
        ...this.user,
        isGuest: true
      }
    }

    this.loaded = true
    this.loading = false
    return this.user
  }

  async login() {
    const code = await this.wxLogin()
    const result = await this.cloudDB.callFunction('login', {
      code,
      userInfo: {
        nickname: this.user.nickname,
        avatarUrl: this.user.avatar
      }
    })

    return result && result.result ? result.result : result
  }

  wxLogin() {
    if (typeof wx === 'undefined' || !wx.login) {
      return Promise.resolve('')
    }

    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => resolve(res.code || ''),
        fail: reject
      })
    })
  }

  async requestUserProfile() {
    try {
      await this.ensurePrivacyAuthorized()
      const profile = await this.getUserProfile()
      return this.applyUserProfile(profile)
    } catch (error) {
      this.lastAuthError = this.formatError(error)
      this.authDenied = true
      this.updateUser({
        authorized: false,
        authDenied: true,
        authError: this.lastAuthError
      })
      return this.user
    }
  }

  async applyUserProfile(profile = {}) {
    const userInfo = profile.userInfo || profile || {}
    const nickname = userInfo.nickName || userInfo.nickname || this.user.nickname
    const avatarUrl = userInfo.avatarUrl || userInfo.avatar || this.user.avatar

    const nextUser = this.updateUser({
      nickname,
      avatar: avatarUrl,
      avatarUrl,
      authorized: Boolean(nickname || avatarUrl),
      authDenied: false,
      authError: ''
    })

    this.authDenied = false

    try {
      await this.syncUserToCloud(nextUser)
    } catch (error) {
      this.lastAuthError = `云端同步失败：${this.formatError(error)}`
    }

    return nextUser
  }

  ensurePrivacyAuthorized() {
    if (typeof wx === 'undefined') return Promise.resolve()

    this.registerPrivacyAuthorizationHandler()

    if (!wx.requirePrivacyAuthorize) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      wx.requirePrivacyAuthorize({
        success: resolve,
        fail: reject
      })
    })
  }

  openPrivacyContract() {
    if (typeof wx === 'undefined' || !wx.openPrivacyContract) {
      return Promise.reject(new Error('当前微信版本不支持打开隐私保护指引'))
    }

    return new Promise((resolve, reject) => {
      wx.openPrivacyContract({
        success: resolve,
        fail: reject
      })
    })
  }

  registerPrivacyAuthorizationHandler() {
    if (UserManager.privacyHandlerRegistered) return
    if (typeof wx === 'undefined' || !wx.onNeedPrivacyAuthorization) return

    wx.onNeedPrivacyAuthorization((resolve) => {
      const agree = () => resolve({ event: 'agree', buttonId: 'privacy-agree' })
      const disagree = () => resolve({ event: 'disagree' })

      if (!wx.showModal) {
        disagree()
        return
      }

      const confirmAgreement = () => {
        wx.showModal({
          title: '隐私保护确认',
          content: '请确认你已阅读《翻翻对决小游戏隐私保护指引》，并同意按照指引处理相关个人信息。',
          confirmText: '同意',
          cancelText: '拒绝',
          success: (res) => {
            if (res.confirm) agree()
            else disagree()
          },
          fail: disagree
        })
      }

      wx.showModal({
        title: '隐私保护提示',
        content: '为了展示头像昵称、房间对战、排行榜和战绩，需要处理相关个人信息。请先查看《翻翻对决小游戏隐私保护指引》。',
        confirmText: '查看指引',
        cancelText: '拒绝',
        success: async (res) => {
          if (!res.confirm) {
            disagree()
            return
          }

          try {
            await this.openPrivacyContract()
            confirmAgreement()
          } catch (error) {
            wx.showModal({
              title: '无法打开隐私指引',
              content: '请确认微信公众平台已发布用户隐私保护指引，并升级微信后重试。',
              showCancel: false,
              confirmText: '知道了',
              complete: disagree
            })
          }
        },
        fail: disagree
      })
    })

    UserManager.privacyHandlerRegistered = true
  }

  getUserProfile() {
    if (typeof wx === 'undefined') {
      return Promise.reject(new Error('wx is unavailable.'))
    }

    if (wx.getUserProfile) {
      return new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '展示用户信息',
          success: resolve,
          fail: reject
        })
      })
    }

    if (wx.getUserInfo) {
      return new Promise((resolve, reject) => {
        wx.getUserInfo({
          success: resolve,
          fail: reject
        })
      })
    }

    return Promise.reject(new Error('No profile API is available.'))
  }

  async syncUserToCloud(user = this.user) {
    if (!user.openid) return null

    return this.cloudDB.callFunction('login', {
      userInfo: {
        nickname: user.nickname,
        avatarUrl: user.avatar || user.avatarUrl
      }
    })
  }

  getCurrentUser() {
    if (!this.loaded) {
      this.loadFromStorage()
    }
    return this.user
  }

  updateUser(data = {}) {
    this.user = this.mergeUser(this.user, data)
    this.saveToStorage()
    return this.user
  }

  updateStats(result = {}) {
    const stats = { ...this.user.stats }
    stats.totalGames = (stats.totalGames || 0) + 1

    if (result.outcome === 'win') {
      stats.wins = (stats.wins || 0) + 1
    } else if (result.outcome === 'loss') {
      stats.losses = (stats.losses || 0) + 1
    } else {
      stats.draws = (stats.draws || 0) + 1
    }

    stats.winRate = stats.totalGames > 0
      ? Math.round(((stats.wins || 0) / stats.totalGames) * 100)
      : 0

    return this.updateUser({ stats })
  }

  loadFromStorage() {
    try {
      if (typeof wx === 'undefined') return this.user
      const cached = wx.getStorageSync(STORAGE_KEYS.USER_INFO)
      if (cached) {
        this.user = this.mergeUser(this.createDefaultUser(), cached)
      }
    } catch (error) {
      this.user = this.createDefaultUser()
    }

    return this.user
  }

  saveToStorage() {
    try {
      if (typeof wx !== 'undefined') {
        wx.setStorageSync(STORAGE_KEYS.USER_INFO, this.user)
      }
    } catch (error) {}
  }

  mergeUser(base, data = {}) {
    const baseAuthorized = Boolean(base.authorized)
    const dataAuthorized = Boolean(data.authorized)
    const avatar = data.avatar || data.avatarUrl || base.avatar || UI_IMAGES.DEFAULT_AVATAR
    const avatarUrl = data.avatarUrl || data.avatar || base.avatarUrl || base.avatar || UI_IMAGES.DEFAULT_AVATAR

    return {
      ...base,
      ...data,
      authorized: baseAuthorized || dataAuthorized,
      authDenied: data.authDenied || false,
      authError: data.authError || '',
      avatar,
      avatarUrl,
      stats: {
        ...(base.stats || this.createDefaultStats()),
        ...(data.stats || {})
      }
    }
  }

  createDefaultUser() {
    return {
      openid: '',
      nickname: '玩家',
      avatar: UI_IMAGES.DEFAULT_AVATAR,
      avatarUrl: UI_IMAGES.DEFAULT_AVATAR,
      authorized: false,
      authDenied: false,
      authError: '',
      isGuest: true,
      stats: this.createDefaultStats()
    }
  }

  createDefaultStats() {
    return {
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      winRate: 0
    }
  }

  formatError(error) {
    if (!error) return '未知错误'
    return error.errMsg || error.message || String(error)
  }
}

export default UserManager
