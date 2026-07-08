const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const rooms = db.collection('rooms')

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const roomCode = String(event.roomCode || '').trim()
  const userInfo = event.userInfo || {}

  if (!/^\d{6}$/.test(roomCode)) {
    return {
      success: false,
      code: 'INVALID_ROOM_CODE',
      message: '请输入6位数字房间号'
    }
  }

  const query = await rooms.where({ roomCode }).limit(1).get()
  if (!query.data.length) {
    return {
      success: false,
      code: 'ROOM_NOT_FOUND',
      message: '房间不存在，请检查房间号'
    }
  }

  const room = query.data[0]

  if (room.hostId === openid || room.guestId === openid) {
    const role = room.hostId === openid ? 'host' : 'guest'
    const players = room.players || {}
    const currentPlayer = players[role] || {}
    const refreshedPlayer = {
      ...currentPlayer,
      openid,
      nickname: userInfo.nickname || currentPlayer.nickname || '玩家',
      avatar: userInfo.avatar || userInfo.avatarUrl || currentPlayer.avatar || currentPlayer.avatarUrl || '',
      avatarUrl: userInfo.avatarUrl || userInfo.avatar || currentPlayer.avatarUrl || currentPlayer.avatar || '',
      online: true
    }

    await rooms.doc(room._id).update({
      data: {
        players: {
          ...players,
          [role]: refreshedPlayer
        },
        updateTime: Date.now()
      }
    })

    const updated = await rooms.doc(room._id).get()
    return {
      success: true,
      room: updated.data
    }
  }

  if (room.status !== 'waiting' && room.status !== 'ready') {
    return {
      success: false,
      code: 'ROOM_ALREADY_STARTED',
      message: '房间已开始，无法加入'
    }
  }

  if (room.guestId && room.guestId !== openid) {
    return {
      success: false,
      code: 'ROOM_FULL',
      message: '房间已满'
    }
  }

  const guest = {
    openid,
    nickname: userInfo.nickname || '玩家',
    avatar: userInfo.avatar || userInfo.avatarUrl || '',
    avatarUrl: userInfo.avatarUrl || userInfo.avatar || '',
    ready: false,
    score: 0,
    online: true
  }

  await rooms.doc(room._id).update({
    data: {
      guestId: openid,
      players: {
        ...(room.players || {}),
        host: (room.players && room.players.host) || {},
        guest
      },
      updateTime: Date.now()
    }
  })

  const updated = await rooms.doc(room._id).get()

  return {
    success: true,
    room: updated.data
  }
}
