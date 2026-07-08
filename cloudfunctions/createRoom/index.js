const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const rooms = db.collection('rooms')

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const now = Date.now()
  const difficulty = event.difficulty || 'EASY'
  const userInfo = event.userInfo || {}
  const roomCode = await generateUniqueRoomCode()
  const seed = now + Math.floor(Math.random() * 100000)

  const host = {
    openid,
    nickname: userInfo.nickname || '玩家',
    avatar: userInfo.avatar || userInfo.avatarUrl || '',
    avatarUrl: userInfo.avatarUrl || userInfo.avatar || '',
    ready: false,
    score: 0,
    online: true
  }

  const roomData = {
    roomCode,
    hostId: openid,
    guestId: '',
    difficulty,
    status: 'waiting',
    players: {
      host,
      guest: {}
    },
    gameState: {
      currentPlayer: '',
      flippedCards: [],
      matchedCount: 0,
      timer: 15,
      scores: {
        host: 0,
        guest: 0
      }
    },
    cards: [],
    seed,
    createTime: now,
    updateTime: now,
    expireAt: now + 30 * 60 * 1000
  }

  const result = await rooms.add({
    data: roomData
  })

  return {
    success: true,
    room: {
      _id: result._id,
      ...roomData
    }
  }
}

async function generateUniqueRoomCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    if (isWeakCode(code)) continue

    const existing = await rooms.where({ roomCode: code }).limit(1).get()
    if (!existing.data.length) return code
  }

  throw new Error('ROOM_CODE_GENERATE_FAILED')
}

function isWeakCode(code) {
  if (/^(\d)\1{5}$/.test(code)) return true
  return ['123456', '654321', '100000', '999999'].includes(code)
}
