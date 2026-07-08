# 《翻翻对决》技术架构设计

> 技术定位：原生 Canvas + 微信小游戏 API + 微信云开发。  
> 目标：不引入大型游戏引擎，降低包体积和复杂度，同时保证双人实时对战、资源可替换、后续可维护。

---

## 1. 总体架构

### 1.1 技术栈

```text
客户端渲染：Canvas 2D API
客户端逻辑：JavaScript ES6+
输入系统：微信小游戏 touch 事件
音频系统：wx.createInnerAudioContext
网络同步：微信云开发 + 云数据库 watch
云端逻辑：云函数
数据存储：云数据库
本地缓存：wx storage
```

### 1.2 为什么使用原生 Canvas

推荐使用原生 Canvas + 微信云开发，而不是引入 Phaser、Cocos 等游戏引擎。

原因：

- 游戏类型较轻，核心是 2D 卡片、按钮、粒子和简单动画。
- 原生 Canvas 足够实现翻牌、抖动、粒子和 UI。
- 包体积更小，首屏加载更快。
- 微信小游戏 API 适配更直接。
- 项目结构更容易控制，适合初版快速上线。

### 1.3 模块分层

```text
GameManager
  ├─ SceneManager
  │   ├─ LoadingScene
  │   ├─ MenuScene
  │   ├─ RoomScene
  │   ├─ GameScene
  │   └─ ResultScene
  ├─ Renderer
  ├─ InputManager
  ├─ NetworkManager
  ├─ UserManager
  ├─ AudioManager
  └─ ResourceLoader

Cloud Functions
  ├─ login
  ├─ createRoom
  ├─ joinRoom
  ├─ leaveRoom
  └─ saveGameResult

Cloud Database
  ├─ rooms
  ├─ users
  ├─ records
  └─ ranks
```

---

## 2. 核心数据结构

### 2.1 Card

卡片是游戏的最小交互单位。它既有同步到云端的逻辑字段，也有仅用于本地渲染的表现字段。

#### 云端同步字段

```javascript
{
  id: 'card_001',
  pairId: 'pair_001',
  imageUrl: '/assets/images/cards/card-1.png',
  state: 'hidden',
  position: {
    row: 0,
    col: 0
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 卡片唯一 ID，一局内唯一 |
| `pairId` | string | 配对 ID，相同 `pairId` 的两张牌为一对 |
| `imageUrl` | string | 正面图片路径 |
| `state` | string | `hidden`、`revealed`、`matched` |
| `position.row` | number | 网格行索引 |
| `position.col` | number | 网格列索引 |

#### 本地渲染扩展字段

这些字段不需要写入云数据库：

```javascript
{
  x: 0,
  y: 0,
  width: 64,
  height: 80,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  alpha: 1,
  flipProgress: 0,
  shakeOffsetX: 0,
  locked: false
}
```

说明：

- `x`、`y`、`width`、`height` 由 `CardGrid` 根据屏幕尺寸计算。
- `flipProgress` 用于翻牌动画。
- `locked` 用于动画期间禁止重复点击。
- 云端只关心卡片是否隐藏、翻开或已匹配，不关心动画进度。

#### 状态枚举

```javascript
export const CARD_STATE = {
  HIDDEN: 'hidden',
  REVEALED: 'revealed',
  MATCHED: 'matched'
}
```

---

### 2.2 Player

玩家数据用于显示头像、昵称、分数，以及判断当前用户身份。

```javascript
{
  openid: 'o_xxx',
  nickname: '玩家A',
  avatar: 'https://example.com/avatar.png',
  score: 0,
  role: 'host',
  ready: false,
  online: true
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `openid` | string | 微信用户唯一标识 |
| `nickname` | string | 玩家昵称，未授权时使用默认“玩家” |
| `avatar` | string | 头像 URL，未授权时使用默认头像 |
| `score` | number | 当前局分数 |
| `role` | string | `host` 或 `guest` |
| `ready` | boolean | 房间等待页准备状态 |
| `online` | boolean | 是否在线，可用于断线提示 |

最小需求只要求 `openid`、`nickname`、`avatar`、`score`，但建议增加 `role`、`ready`、`online`，便于房间等待和同步逻辑处理。

---

### 2.3 GameState

`GameState` 是实时同步的核心。客户端通过监听房间文档中的 `gameState` 来更新对局画面。

```javascript
{
  currentPlayer: 'host',
  flippedCards: ['card_001', 'card_008'],
  matchedCount: 2,
  timer: 30,
  turnStartTime: 1710000000000,
  scores: {
    host: 1,
    guest: 0
  },
  status: 'playing',
  turnSeq: 3,
  lastAction: {
    actionId: 'host_1710000000000_card_001',
    type: 'flip',
    actor: 'host',
    cardId: 'card_001',
    timestamp: 1710000000000
  },
  winner: null,
  endReason: null
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `currentPlayer` | string | 当前回合玩家，`host` 或 `guest` |
| `flippedCards` | string[] | 当前回合已翻开的卡片 ID，最多 2 张 |
| `matchedCount` | number | 已完成匹配的对数 |
| `timer` | number | 显示用倒计时秒数，可由 `turnStartTime` 推导 |
| `turnStartTime` | number | 当前回合开始时间戳 |
| `scores.host` | number | 房主分数 |
| `scores.guest` | number | 对手分数 |
| `status` | string | `playing`、`judging`、`ended` |
| `turnSeq` | number | 回合序号，用于处理重复提交和乱序状态 |
| `lastAction` | object | 最近一次动作，用于动画和去重 |
| `winner` | string/null | 胜者角色或 openid，平局为 `null` |
| `endReason` | string/null | `completed`、`host_leave`、`guest_leave`、`timeout` |

#### 关于 timer

`timer` 可以保留在结构中，方便 UI 显示，但不建议每秒写入云端。

推荐做法：

- 云端只保存 `turnStartTime`。
- 客户端本地每帧或每秒计算剩余时间。
- 只有超时发生时才写入云端切换回合。

计算方式：

```javascript
const elapsed = Math.floor((Date.now() - gameState.turnStartTime) / 1000)
const remaining = Math.max(0, 30 - elapsed)
```

这样可以避免每秒更新数据库导致同步压力过大。

---

### 2.4 Room

房间是云数据库 `rooms` 集合中的主文档，也是实时监听的核心对象。

```javascript
{
  _id: 'room_doc_id',
  roomCode: '123456',
  hostId: 'openid_host',
  guestId: 'openid_guest',
  difficulty: 'easy',
  status: 'waiting',
  players: {
    host: {
      openid: 'openid_host',
      nickname: '玩家A',
      avatar: '/assets/images/ui/default-avatar.png',
      score: 0,
      ready: false,
      online: true
    },
    guest: {
      openid: 'openid_guest',
      nickname: '玩家B',
      avatar: '/assets/images/ui/default-avatar.png',
      score: 0,
      ready: false,
      online: true
    }
  },
  gameState: {
    currentPlayer: 'host',
    flippedCards: [],
    matchedCount: 0,
    timer: 30
  },
  cards: [],
  createTime: 1710000000000,
  updateTime: 1710000000000,
  expireAt: 1710001800000
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 数据库文档 ID |
| `roomCode` | string | 6 位数字房间号 |
| `hostId` | string | 房主 openid |
| `guestId` | string/null | 对手 openid |
| `difficulty` | string | `easy`、`medium`、`hard` |
| `status` | string | `waiting`、`ready`、`countdown`、`playing`、`ended` |
| `players` | object | 双方玩家快照 |
| `gameState` | object | 当前对局实时状态 |
| `cards` | Card[] | 本局卡片列表 |
| `createTime` | number | 创建时间 |
| `updateTime` | number | 更新时间 |
| `expireAt` | number | 过期时间，未开始 30 分钟后可清理 |

#### 房间状态枚举

```javascript
export const ROOM_STATUS = {
  WAITING: 'waiting',
  READY: 'ready',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  ENDED: 'ended'
}
```

---

## 3. 难度与卡片生成

### 3.1 难度配置

```javascript
export const DIFFICULTY = {
  easy: {
    label: '初级',
    rows: 4,
    cols: 4,
    totalCards: 16,
    pairCount: 8
  },
  medium: {
    label: '中级',
    rows: 4,
    cols: 6,
    totalCards: 24,
    pairCount: 12
  },
  hard: {
    label: '高级',
    rows: 6,
    cols: 6,
    totalCards: 36,
    pairCount: 18
  }
}
```

### 3.2 卡片生成流程

```text
读取 difficulty
  -> 获取 pairCount
  -> 从 CARD_IMAGES 中取前 pairCount 张或随机取 pairCount 张
  -> 每个图案生成两张 Card
  -> Fisher-Yates 洗牌
  -> 根据 rows / cols 写入 position
  -> 保存到 room.cards
```

### 3.3 生成示例

```javascript
function createCards(difficultyConfig, imagePaths) {
  const selectedImages = imagePaths.slice(0, difficultyConfig.pairCount)
  const cards = []

  selectedImages.forEach((imageUrl, index) => {
    const pairId = `pair_${index + 1}`

    cards.push({
      id: `card_${index + 1}_a`,
      pairId,
      imageUrl,
      state: 'hidden',
      position: null
    })

    cards.push({
      id: `card_${index + 1}_b`,
      pairId,
      imageUrl,
      state: 'hidden',
      position: null
    })
  })

  shuffle(cards)

  cards.forEach((card, index) => {
    card.position = {
      row: Math.floor(index / difficultyConfig.cols),
      col: index % difficultyConfig.cols
    }
  })

  return cards
}
```

---

## 4. 网络方案

### 4.1 方案概览

使用微信云开发 + 云数据库 `watch` 实时监听。

```text
玩家 A 操作
  -> 本地乐观更新
  -> update rooms.gameState / rooms.cards
  -> 云数据库变更
  -> 玩家 B watch 收到变化
  -> 玩家 B 更新本地画面
```

### 4.2 监听对象

每个客户端只监听当前房间文档：

```javascript
db.collection('rooms')
  .where({
    _id: roomId
  })
  .watch({
    onChange(snapshot) {
      const room = snapshot.docs[0]
      handleRoomUpdate(room)
    },
    onError(error) {
      handleWatchError(error)
    }
  })
```

### 4.3 同步字段

需要实时同步：

- `status`
- `difficulty`
- `players`
- `players.host.ready`
- `players.guest.ready`
- `gameState`
- `cards`

不需要实时同步：

- 粒子位置
- 翻牌动画进度
- 按钮按下状态
- 本地 Toast
- 背景粒子
- 音频播放进度

### 4.4 写入策略

推荐云端写入粒度：

| 场景 | 写入字段 |
| --- | --- |
| 房主修改难度 | `difficulty` |
| 玩家准备 | `players.{role}.ready` |
| 开始游戏 | `status`、`cards`、`gameState` |
| 翻第一张牌 | `cards[n].state`、`gameState.flippedCards`、`lastAction` |
| 翻第二张牌 | `cards[n].state`、`gameState.flippedCards`、`gameState.status` |
| 匹配成功 | `cards`、`scores`、`matchedCount`、`flippedCards` |
| 匹配失败 | `cards`、`currentPlayer`、`turnStartTime`、`turnSeq` |
| 游戏结束 | `status`、`gameState.status`、`winner`、`endReason` |

### 4.5 冲突处理

基本原则：

- 只有当前回合玩家可以提交翻牌操作。
- 操作前校验 `currentPlayer` 和 `turnSeq`。
- 本地显示可以乐观更新，但云端返回后以云端状态为准。
- 每次操作带 `actionId`，同一动作只处理一次动画。

示例：

```javascript
function canFlipCard(room, myRole, card) {
  return room.status === 'playing'
    && room.gameState.currentPlayer === myRole
    && room.gameState.status !== 'judging'
    && card.state === 'hidden'
    && room.gameState.flippedCards.length < 2
}
```

---

## 5. 云数据库集合设计

### 5.1 rooms

用途：

- 存储房间和当前游戏状态。
- 支持 watch 实时监听。

建议索引：

- `roomCode` 唯一索引
- `status`
- `hostId`
- `guestId`
- `expireAt`

建议权限：

- 创建、加入、离开和结算通过云函数。
- 客户端只读自己所在房间。
- 客户端可在严格校验后更新房间状态，或全部写操作走云函数。

### 5.2 users

用途：

- 存储用户基础资料和统计。

```javascript
{
  _openid: 'openid',
  nickname: '玩家',
  avatar: '/assets/images/ui/default-avatar.png',
  totalGames: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0,
  maxScore: 0,
  totalScore: 0,
  createTime: 1710000000000,
  updateTime: 1710000000000
}
```

建议索引：

- `_openid`
- `winRate`
- `wins`

### 5.3 records

用途：

- 保存每局详细战绩。

```javascript
{
  roomCode: '123456',
  difficulty: 'easy',
  players: [
    {
      openid: 'openid_host',
      role: 'host',
      nickname: '玩家A',
      score: 8
    },
    {
      openid: 'openid_guest',
      role: 'guest',
      nickname: '玩家B',
      score: 6
    }
  ],
  winner: 'openid_host',
  result: 'host_win',
  duration: 180,
  matchedCount: 8,
  createTime: 1710000000000
}
```

建议索引：

- `players.openid`
- `winner`
- `createTime`
- `difficulty`

### 5.4 ranks

用途：

- 存储排行榜预计算结果，减少实时聚合压力。

```javascript
{
  _openid: 'openid',
  nickname: '玩家',
  avatar: '/assets/images/ui/default-avatar.png',
  totalGames: 100,
  wins: 65,
  winRate: 65,
  totalScore: 850,
  rankScore: 650100,
  updateTime: 1710000000000
}
```

排序建议：

```text
winRate DESC
wins DESC
totalScore DESC
```

为了避免少量场次刷榜，全服排行榜建议要求：

```text
totalGames >= 10
```

---

## 6. 云函数职责

### 6.1 login

职责：

- 获取 openid。
- 查询或创建 `users` 记录。
- 返回用户资料。

### 6.2 createRoom

职责：

- 生成唯一 6 位房间号。
- 创建 `rooms` 文档。
- 写入房主信息。
- 返回房间数据。

### 6.3 joinRoom

职责：

- 校验房间号。
- 校验房间未满且未开始。
- 写入对手信息。
- 返回房间数据。

### 6.4 leaveRoom

职责：

- 等待阶段离开：移除玩家或删除空房间。
- 游戏阶段离开：判定离开方认输。
- 更新房间状态。

### 6.5 saveGameResult

职责：

- 写入 `records`。
- 更新双方 `users` 统计。
- 更新或重算 `ranks`。
- 标记房间 `ended`。

---

## 7. 图片资源组织方式

### 7.1 目录规范

所有卡片图片统一放在：

```text
/assets/images/cards/
```

完整建议：

```text
assets/
  images/
    cards/
      back.png
      card-1.png
      card-2.png
      card-3.png
      card-4.png
      card-5.png
      card-6.png
      card-7.png
      card-8.png
      card-9.png
      card-10.png
      card-11.png
      card-12.png
      card-13.png
      card-14.png
      card-15.png
      card-16.png
      card-17.png
      card-18.png
    ui/
      default-avatar.png
      logo.png
    share/
      invite.png
      result-bg.png
```

### 7.2 命名规则

卡片正面：

```text
card-1.png
card-2.png
...
card-18.png
```

卡片背面：

```text
back.png
```

命名要求：

- 使用小写英文和数字。
- 使用连字符 `-`。
- 不使用中文文件名。
- 不使用空格。
- 不随主题变更而改名。

这样后期替换 PNG 时不需要改代码。

### 7.3 图片规格

推荐规格：

| 类型 | 尺寸 | 格式 | 说明 |
| --- | --- | --- | --- |
| 卡片正面 | `256x256` | PNG | 透明或纯色背景均可 |
| 卡片背面 | `256x256` | PNG | 所有未翻开卡片统一使用 |
| 默认头像 | `128x128` | PNG | 用户拒绝授权时使用 |
| Logo | `512x256` | PNG | 启动和主菜单使用 |
| 分享图 | `500x400` 或按微信推荐尺寸 | PNG/JPG | 分享卡片使用 |

压缩建议：

- 单张卡片尽量小于 `100KB`。
- 18 张卡片总大小建议控制在 `1.5MB` 以内。
- 透明 PNG 如果过大，可改为不透明 PNG。

### 7.4 配置方式

在 `js/utils/config.js` 中统一配置：

```javascript
export const CARD_ASSET_BASE = '/assets/images/cards/'

export const CARD_BACK_IMAGE = `${CARD_ASSET_BASE}back.png`

export const CARD_IMAGES = [
  `${CARD_ASSET_BASE}card-1.png`,
  `${CARD_ASSET_BASE}card-2.png`,
  `${CARD_ASSET_BASE}card-3.png`,
  `${CARD_ASSET_BASE}card-4.png`,
  `${CARD_ASSET_BASE}card-5.png`,
  `${CARD_ASSET_BASE}card-6.png`,
  `${CARD_ASSET_BASE}card-7.png`,
  `${CARD_ASSET_BASE}card-8.png`,
  `${CARD_ASSET_BASE}card-9.png`,
  `${CARD_ASSET_BASE}card-10.png`,
  `${CARD_ASSET_BASE}card-11.png`,
  `${CARD_ASSET_BASE}card-12.png`,
  `${CARD_ASSET_BASE}card-13.png`,
  `${CARD_ASSET_BASE}card-14.png`,
  `${CARD_ASSET_BASE}card-15.png`,
  `${CARD_ASSET_BASE}card-16.png`,
  `${CARD_ASSET_BASE}card-17.png`,
  `${CARD_ASSET_BASE}card-18.png`
]
```

如果微信小游戏运行环境对绝对路径处理不符合预期，可改为相对路径：

```javascript
export const CARD_ASSET_BASE = 'assets/images/cards/'
```

项目内保持一个配置入口即可，避免各处硬编码。

### 7.5 替换图片流程

后期替换卡片主题时：

1. 准备 18 张新的 PNG 卡片图片。
2. 分别命名为 `card-1.png` 到 `card-18.png`。
3. 替换 `/assets/images/cards/` 下的同名文件。
4. 如需替换背面，替换 `back.png`。
5. 不修改 `Card`、`CardGrid`、`GameScene` 代码。
6. 在微信开发者工具中重新预览，确认资源路径和大小写正确。

### 7.6 资源加载策略

LoadingScene 中预加载：

```javascript
const imagesToLoad = [
  CARD_BACK_IMAGE,
  ...CARD_IMAGES
]

await ResourceLoader.loadImages(imagesToLoad)
```

ResourceLoader 缓存结构：

```javascript
{
  '/assets/images/cards/back.png': Image,
  '/assets/images/cards/card-1.png': Image
}
```

卡片渲染时：

```javascript
const image = ResourceLoader.get(card.state === 'hidden'
  ? CARD_BACK_IMAGE
  : card.imageUrl
)

ctx.drawImage(image, card.x, card.y, card.width, card.height)
```

### 7.7 图片缺失兜底

如果某张图片加载失败：

- 控制台记录错误。
- 使用纯色占位图。
- 在卡片中心绘制序号。
- 不阻塞游戏启动。

这样可以避免单张资源缺失导致整个游戏白屏。

---

## 8. 客户端文件职责建议

```text
js/models/Card.js
  定义卡片模型、状态变更、动画状态

js/models/CardGrid.js
  生成卡片、洗牌、计算布局、命中检测

js/models/Player.js
  玩家模型、分数更新、准备状态

js/managers/NetworkManager.js
  房间 watch、状态上传、断线重连

js/managers/UserManager.js
  登录、用户资料、本地缓存

js/utils/config.js
  难度、资源路径、颜色、字体、时间常量

js/utils/ResourceLoader.js
  图片和音频预加载、缓存、失败兜底
```

---

## 9. 关键设计原则

- 云端同步游戏事实，本地表现负责动画。
- 卡片路径只在配置文件中集中维护。
- 房间文档是实时对战的唯一数据源。
- 不每秒写倒计时，倒计时由 `turnStartTime` 推导。
- 只监听当前房间，避免全局 watch。
- 图片替换不影响代码，代码只依赖固定命名。
- 初版先保证房间对战稳定，再扩展好友排行榜和随机匹配。

