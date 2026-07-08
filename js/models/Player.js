import { UI_IMAGES } from '../utils/config.js'

class Player {
  constructor(options = {}) {
    // id 兼容本地模型，openid 对接微信云开发用户身份。
    this.id = options.id || options.openid || ''
    this.openid = options.openid || this.id
    this.nickname = options.nickname || '玩家'
    this.avatar = options.avatar || options.avatarUrl || UI_IMAGES.DEFAULT_AVATAR
    this.score = options.score || 0
    this.role = options.role || ''
    this.ready = Boolean(options.ready)
    this.online = options.online !== false
  }

  addScore(amount = 1) {
    // 每匹配成功一对默认加 1 分。
    this.score += amount
    return this.score
  }

  reset() {
    // 新一局开始时重置局内分数和准备状态。
    this.score = 0
    this.ready = false
    return this
  }

  setReady(ready) {
    this.ready = Boolean(ready)
    return this
  }

  setOnline(online) {
    this.online = Boolean(online)
    return this
  }

  updateProfile({ nickname, avatar, avatarUrl } = {}) {
    if (nickname) this.nickname = nickname
    if (avatar || avatarUrl) this.avatar = avatar || avatarUrl
    return this
  }

  toJSON() {
    return {
      id: this.id,
      openid: this.openid,
      nickname: this.nickname,
      avatar: this.avatar,
      score: this.score,
      role: this.role,
      ready: this.ready,
      online: this.online
    }
  }
}

export default Player
