const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const now = Date.now()
  const roomId = event.roomId || ''
  const players = event.players || []
  const scores = event.scores || deriveScores(players)
  const winner = event.winner || deriveWinner(scores)
  const difficulty = event.difficulty || 'EASY'
  const duration = event.duration || 0
  const flipCount = event.flipCount || 0

  if (roomId) {
    const existingRecord = await db.collection('records').where({ roomId }).limit(1).get()
    if (existingRecord.data.length) {
      return {
        success: true,
        duplicate: true,
        recordId: existingRecord.data[0]._id
      }
    }
  }

  const recordData = {
    roomId,
    roomCode: event.roomCode || '',
    players,
    scores,
    winner,
    duration,
    flipCount,
    difficulty,
    timestamp: now,
    createTime: now
  }

  const recordResult = await db.collection('records').add({
    data: recordData
  })

  await Promise.all(players.map((player) => {
    const outcome = getOutcome(player.role, winner)
    return updateUserStats(player, outcome, now)
  }))

  await Promise.all(players.map((player) => updateRank(player, now)))

  return {
    success: true,
    recordId: recordResult._id
  }
}

function deriveScores(players) {
  const host = players.find((player) => player.role === 'host')
  const guest = players.find((player) => player.role === 'guest')
  return {
    host: host ? host.score || 0 : 0,
    guest: guest ? guest.score || 0 : 0
  }
}

function deriveWinner(scores) {
  if (scores.host > scores.guest) return 'host'
  if (scores.guest > scores.host) return 'guest'
  return null
}

function getOutcome(role, winner) {
  if (!winner) return 'draw'
  return role === winner ? 'win' : 'loss'
}

async function updateUserStats(player, outcome, now) {
  if (!player.openid) return

  const users = db.collection('users')
  const existing = await users.where({ _openid: player.openid }).limit(1).get()
  const incData = {
    games: _.inc(1),
    updateTime: now
  }

  if (outcome === 'win') incData.wins = _.inc(1)
  if (outcome === 'loss') incData.losses = _.inc(1)
  if (outcome === 'draw') incData.draws = _.inc(1)

  if (!existing.data.length) {
    await users.add({
      data: {
        _openid: player.openid,
        nickname: player.nickname || 'Player',
        avatarUrl: player.avatar || player.avatarUrl || '',
        wins: outcome === 'win' ? 1 : 0,
        losses: outcome === 'loss' ? 1 : 0,
        draws: outcome === 'draw' ? 1 : 0,
        games: 1,
        winRate: outcome === 'win' ? 100 : 0,
        createTime: now,
        updateTime: now
      }
    })
    return
  }

  const user = existing.data[0]
  await users.doc(user._id).update({ data: incData })

  const nextWins = (user.wins || 0) + (outcome === 'win' ? 1 : 0)
  const nextGames = (user.games || 0) + 1
  await users.doc(user._id).update({
    data: {
      winRate: Math.round((nextWins / nextGames) * 100),
      nickname: player.nickname || user.nickname,
      avatarUrl: player.avatar || player.avatarUrl || user.avatarUrl,
      updateTime: now
    }
  })
}

async function updateRank(player, now) {
  if (!player.openid) return

  const users = await db.collection('users').where({ _openid: player.openid }).limit(1).get()
  const user = users.data[0]
  if (!user) return

  const ranks = db.collection('ranks')
  const existing = await ranks.where({ _openid: player.openid }).limit(1).get()
  const rankData = {
    _openid: player.openid,
    nickname: user.nickname || player.nickname || 'Player',
    avatar: user.avatarUrl || player.avatar || '',
    wins: user.wins || 0,
    games: user.games || 0,
    winRate: user.winRate || 0,
    updateTime: now
  }

  if (existing.data.length) {
    await ranks.doc(existing.data[0]._id).update({ data: rankData })
  } else {
    await ranks.add({ data: rankData })
  }
}
