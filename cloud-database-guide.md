# 《翻翻对决》微信云开发数据库配置说明

## 1. 云开发初始化

入口文件 [game.js](E:\myworkspace\wechatflipchard\game.js) 已调用：

```javascript
wx.cloud.init({
  env: CLOUD_ENV_ID,
  traceUser: true
})
```

`CLOUD_ENV_ID` 在 [config.js](E:\myworkspace\wechatflipchard\js\utils\config.js) 中配置：

```javascript
export const CLOUD_ENV_ID = 'your-cloud-env-id'
```

上线前需要替换成微信开发者工具中的真实云环境 ID。

---

## 2. 集合设计

### rooms

用途：房间信息和实时对战状态。

```javascript
{
  _id: 'room_doc_id',
  roomCode: '123456',
  hostId: 'openid_host',
  guestId: 'openid_guest',
  difficulty: 'EASY',
  status: 'waiting',
  players: {
    host: {
      openid: 'openid_host',
      nickname: '玩家A',
      avatar: 'avatar_url',
      ready: false,
      score: 0
    },
    guest: {
      openid: 'openid_guest',
      nickname: '玩家B',
      avatar: 'avatar_url',
      ready: false,
      score: 0
    }
  },
  gameState: {
    currentPlayer: 'host',
    flippedCards: [],
    matchedCount: 0,
    timer: 30,
    scores: {
      host: 0,
      guest: 0
    },
    flipCount: 0,
    duration: 0,
    winner: null
  },
  cards: [],
  createTime: 1710000000000,
  updateTime: 1710000000000
}
```

建议索引：

- `roomCode` 唯一索引
- `hostId`
- `guestId`
- `status`
- `createTime`

### users

用途：用户资料和战绩统计。

```javascript
{
  _openid: 'openid',
  nickname: '玩家',
  avatarUrl: 'avatar_url',
  wins: 0,
  losses: 0,
  draws: 0,
  games: 0,
  winRate: 0,
  createTime: 1710000000000,
  updateTime: 1710000000000
}
```

建议索引：

- `_openid`
- `winRate`
- `wins`

### records

用途：每局游戏记录。

```javascript
{
  _id: 'record_doc_id',
  players: [
    {
      role: 'host',
      openid: 'openid_host',
      nickname: '玩家A',
      score: 8
    },
    {
      role: 'guest',
      openid: 'openid_guest',
      nickname: '玩家B',
      score: 6
    }
  ],
  scores: {
    host: 8,
    guest: 6
  },
  winner: 'host',
  duration: 180,
  difficulty: 'EASY',
  timestamp: 1710000000000
}
```

建议索引：

- `winner`
- `difficulty`
- `timestamp`
- `players.openid`

### ranks

用途：排行榜预计算结果。

```javascript
{
  _openid: 'openid',
  nickname: '玩家',
  avatar: 'avatar_url',
  wins: 65,
  games: 100,
  winRate: 65,
  updateTime: 1710000000000
}
```

建议索引：

- `winRate`
- `wins`
- `games`

排行榜查询建议：

```text
games >= 10
ORDER BY winRate DESC, wins DESC
LIMIT 50
```

---

## 3. 权限配置建议

为了避免客户端伪造胜负和篡改对手数据，生产环境建议采用“客户端读，关键写入走云函数”的策略。

### rooms

开发期可用：

```json
{
  "read": true,
  "write": "auth.openid != null"
}
```

生产期建议：

```json
{
  "read": "auth.openid == doc.hostId || auth.openid == doc.guestId",
  "write": false
}
```

写入通过云函数：

- `createRoom`
- `joinRoom`
- `leaveRoom`
- `updateGameState`

### users

```json
{
  "read": "auth.openid == doc._openid",
  "write": "auth.openid == doc._openid"
}
```

如果用户统计只允许结算云函数更新，生产期可改为：

```json
{
  "read": "auth.openid == doc._openid",
  "write": false
}
```

### records

```json
{
  "read": "auth.openid != null",
  "write": false
}
```

只允许 `saveGameResult` 云函数写入。

### ranks

```json
{
  "read": true,
  "write": false
}
```

只允许云函数或定时任务更新排行榜。

---

## 4. CloudDB 封装

[CloudDB.js](E:\myworkspace\wechatflipchard\js\utils\CloudDB.js) 已提供：

- `add(collectionName, data)`
- `update(collectionName, docId, data)`
- `get(collectionName, docId)`
- `query(collectionName, where, options)`
- `watch(collectionName, options, onChange, onError)`
- `watchDoc(collectionName, docId, onChange, onError)`
- `watchRoom(roomId, onChange, onError)`
- `callFunction(name, data)`
- `closeWatcher(key)`
- `closeAllWatchers()`

房间实时同步推荐只监听当前房间文档：

```javascript
CloudDB.getInstance().watchRoom(roomId, (room) => {
  // 根据云端 room 更新本地 UI 和 gameState
})
```

