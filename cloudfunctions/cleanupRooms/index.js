const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const ROOM_EXPIRE_MS = 30 * 60 * 1000

exports.main = async () => {
  const now = Date.now()
  const expireTime = now - ROOM_EXPIRE_MS

  const result = await db.collection('rooms')
    .where({
      status: _.in(['waiting', 'ready']),
      createTime: _.lt(expireTime)
    })
    .remove()

  return {
    success: true,
    removed: result.stats ? result.stats.removed : 0,
    expireTime,
    now
  }
}
