import { GAME_NAME, SHARE_IMAGES, SHARE_MATERIALS } from '../utils/config.js'

const SHARE_TYPE = {
  INVITE: 'INVITE',
  VICTORY: 'VICTORY',
  CHALLENGE: 'CHALLENGE'
}

class ShareManager {
  static instance = null

  static getInstance() {
    if (!ShareManager.instance) {
      ShareManager.instance = new ShareManager()
    }
    return ShareManager.instance
  }

  constructor() {
    if (ShareManager.instance) return ShareManager.instance

    ShareManager.instance = this
  }

  shareRoom(roomCode) {
    return this.share(this.buildRoomPayload(roomCode))
  }

  shareResult(result = {}) {
    return this.share(this.buildResultPayload(result))
  }

  shareChallenge() {
    return this.share(this.buildChallengePayload())
  }

  buildRoomPayload(roomCode) {
    return this.buildPayload(SHARE_TYPE.INVITE, {
      title: `来和我一起玩${GAME_NAME}，房间号：${roomCode}`,
      query: `roomCode=${roomCode}`
    })
  }

  buildResultPayload(result = {}) {
    const scores = result.scores || {}
    const type = result.outcome === 'win' ? SHARE_TYPE.VICTORY : SHARE_TYPE.CHALLENGE
    const title = result.outcome === 'win'
      ? `我在${GAME_NAME}中获胜了：${scores.host || 0}:${scores.guest || 0}`
      : `${GAME_NAME}战绩：${scores.host || 0}:${scores.guest || 0}`

    return this.buildPayload(type, {
      title,
      query: 'challenge=true'
    })
  }

  buildChallengePayload() {
    return this.buildPayload(SHARE_TYPE.CHALLENGE, {
      title: `${GAME_NAME}好友记忆翻牌对战，来挑战我！`,
      query: 'challenge=true'
    })
  }

  buildPayload(type, options = {}) {
    return {
      title: options.title || GAME_NAME,
      query: options.query || '',
      ...this.buildImagePayload(type)
    }
  }

  buildImagePayload(type) {
    const material = SHARE_MATERIALS[type] || {}
    const fallbackImage = SHARE_IMAGES[type] || SHARE_IMAGES.CHALLENGE || SHARE_IMAGES.INVITE
    const imageUrl = material.imageUrl || fallbackImage
    const payload = { imageUrl }

    if (material.imageUrlId && material.imageUrl) {
      payload.imageUrlId = material.imageUrlId
    }

    return payload
  }

  share(payload) {
    if (typeof wx !== 'undefined' && wx.shareAppMessage) {
      return wx.shareAppMessage(payload)
    }

    return payload
  }
}

export default ShareManager
