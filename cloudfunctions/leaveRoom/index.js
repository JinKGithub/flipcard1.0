const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const rooms = db.collection('rooms')

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const roomId = event.roomId || ''
  const roomCode = event.roomCode || ''

  const room = await findRoom(roomId, roomCode)
  if (!room) {
    return {
      success: false,
      code: 'ROOM_NOT_FOUND',
      message: 'Room does not exist.'
    }
  }

  const isHost = room.hostId === openid
  const isGuest = room.guestId === openid

  if (!isHost && !isGuest) {
    return {
      success: false,
      code: 'NOT_IN_ROOM',
      message: 'Current user is not in the room.'
    }
  }

  if (room.status === 'playing') {
    const winner = isHost ? 'guest' : 'host'
    await rooms.doc(room._id).update({
      data: {
        status: 'ended',
        'gameState.winner': winner,
        'gameState.endReason': isHost ? 'host_leave' : 'guest_leave',
        updateTime: Date.now()
      }
    })

    const updated = await rooms.doc(room._id).get()
    return {
      success: true,
      removed: false,
      room: updated.data
    }
  }

  if (isGuest) {
    await rooms.doc(room._id).update({
      data: {
        guestId: '',
        players: {
          ...(room.players || {}),
          host: {
            ...((room.players && room.players.host) || {}),
            ready: false
          },
          guest: {}
        },
        updateTime: Date.now()
      }
    })

    const updated = await rooms.doc(room._id).get()
    return {
      success: true,
      removed: false,
      room: updated.data
    }
  }

  await rooms.doc(room._id).remove()
  return {
    success: true,
    removed: true,
    room: null
  }
}

async function findRoom(roomId, roomCode) {
  if (roomId) {
    try {
      const result = await rooms.doc(roomId).get()
      return result.data
    } catch (error) {
      return null
    }
  }

  if (roomCode) {
    const result = await rooms.where({ roomCode }).limit(1).get()
    return result.data[0] || null
  }

  return null
}
