const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const users = db.collection('users')

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const now = Date.now()
  const userInfo = event.userInfo || {}

  const existing = await users.where({ _openid: openid }).limit(1).get()

  if (!existing.data.length) {
    const user = {
      _openid: openid,
      nickname: userInfo.nickname || userInfo.nickName || 'Player',
      avatarUrl: userInfo.avatarUrl || '',
      wins: 0,
      losses: 0,
      draws: 0,
      games: 0,
      winRate: 0,
      createTime: now,
      updateTime: now
    }

    const result = await users.add({ data: user })
    return {
      success: true,
      openid,
      user: {
        _id: result._id,
        ...user
      }
    }
  }

  const user = existing.data[0]
  const updateData = {
    updateTime: now
  }

  if (userInfo.nickname || userInfo.nickName) {
    updateData.nickname = userInfo.nickname || userInfo.nickName
  }

  if (userInfo.avatarUrl) {
    updateData.avatarUrl = userInfo.avatarUrl
  }

  if (Object.keys(updateData).length > 1) {
    await users.doc(user._id).update({ data: updateData })
  }

  return {
    success: true,
    openid,
    user: {
      ...user,
      ...updateData
    }
  }
}
