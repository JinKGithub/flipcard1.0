# 《翻翻对决》WebSocket 迁移设计文档

## 1. 当前同步链路梳理

当前项目已经跑通的链路是：

1. 登录与用户资料：`UserManager` 调用 `login` 云函数，用户资料保存在 `users` 集合和本地缓存。
2. 创建房间：`RoomScene.createCloudRoom()` 调用 `createRoom` 云函数，写入 `rooms` 集合。
3. 加入房间：`RoomScene.joinCloudRoom()` 调用 `joinRoom` 云函数，更新 `rooms.guestId` 和 `rooms.players.guest`。
4. 房间等待页同步：`RoomScene` 当前主要靠 `startPolling()` 每 1.5 秒拉取房间状态，`startWatch()` 目前没有实际开启数据库 watch。
5. 开始游戏：`RoomScene.startGame()` 调用 `updateRoom` 云函数的 `startGame` action，云函数生成初始牌堆、先手、倒计时字段。
6. 游戏对战同步：`GameScene` 通过 `NetworkManager.watchRoom()` 监听 `rooms` 文档，并在每次翻牌、判定、超时、结束时调用 `updateRoom` 云函数写入整份 `cards`、`players`、`gameState`。
7. 结算保存：`ResultScene` / `GameScene` 调用 `saveGameResult` 云函数，写入 `records`，更新 `users` 和 `ranks`。
8. 退出房间：`leaveRoom` 云函数负责删除未开始房间、移除等待页 guest，或在 playing 状态下判定另一方胜利。

## 2. 现有方案的主要问题

### 2.1 调用次数偏高

当前游戏中每一次翻牌都会调用 `updateRoom` 云函数，且通常会写入完整牌堆数组。一个 6x4 对局如果双方反复翻牌，云函数调用和数据库写入会明显放大。

### 2.2 快速连续翻牌容易漏同步

当前 `NetworkManager.uploadGameState()` 已经做了队列和节流优化，但本质上仍是“把当前快照写到云端，再由对手监听云端变化”。当玩家快速翻两张牌时，两个状态可能非常接近：

- 第一张牌翻开状态
- 第二张牌翻开并进入判定状态

如果中间状态被合并、延迟或被 stale 过滤挡掉，对手就可能只看到后一个状态，表现为“第一下没看到”或“两边状态像不在同一局”。

### 2.3 数据库 watch 并不适合作为高频实时战斗通道

数据库 watch 更适合低频状态变更，比如房间成员变化、准备状态、结算状态。翻牌这种强实时动作更适合走长连接消息广播。

### 2.4 回退链路必须保留

当前版本已经可以完成核心玩法，所以迁移不能把现有云同步直接删掉。WebSocket 必须作为可开关能力接入：

- 默认保持 `cloud` 同步模式。
- WebSocket 失败时能回退到 `cloud`。
- 每个阶段都能单独验证。

## 3. 迁移后的职责划分

### 3.1 云函数继续负责

云函数保留这些低频、权威、需要持久化的职责：

1. `login`
   - 获取 openid。
   - 创建或更新 `users`。
2. `createRoom`
   - 生成唯一 6 位房间号。
   - 创建 `rooms` 初始记录。
   - 写入 host 信息、difficulty、seed、expireAt。
3. `joinRoom`
   - 校验房间是否存在、是否满员、是否已开始。
   - 写入 guest 信息。
   - 支持玩家重连时刷新头像昵称和在线状态。
4. `leaveRoom`
   - 未开始房间：移除 guest 或删除空房间。
   - 对战中：标记 `status=ended`，写入 winner 和 endReason。
5. `saveGameResult`
   - 写入 `records`。
   - 更新 `users` 统计。
   - 更新 `ranks`。
6. `updateRoom`
   - 第一阶段保留原能力，作为 WebSocket 回退方案。
   - WebSocket 稳定后只保留低频写入：准备、难度、开始、快照、结束。

### 3.2 WebSocket 负责

WebSocket 负责高频、低延迟、房间内即时广播：

1. 等待页实时状态：
   - 对手进入。
   - 准备/取消准备。
   - 房主切换难度。
   - 倒计时开始。
   - 玩家离开。
2. 对战页实时操作：
   - 单张翻牌。
   - 两张牌判定结果。
   - 回合切换。
   - 15 秒倒计时重置。
   - 对手断线/重连提示。
3. 心跳和连接状态：
   - 客户端定时 ping。
   - 服务端清理僵尸连接。
   - 断线重连后推送当前房间快照。

### 3.3 云数据库继续保存

`rooms` 集合继续保存可恢复的关键状态，但不再保存每一次翻牌动作：

1. 房间基础信息：
   - `_id`
   - `roomCode`
   - `hostId`
   - `guestId`
   - `difficulty`
   - `seed`
   - `status`
   - `players`
   - `createTime`
   - `updateTime`
   - `expireAt`
2. 游戏开始快照：
   - `cards`
   - `gameState.currentPlayer`
   - `gameState.startTime`
   - `gameState.turnStartTime`
   - `gameState.turnDeadline`
   - `gameState.turnVersion`
3. 低频容灾快照：
   - 每 30 秒最多保存一次。
   - 或在断线重连、玩家切后台时保存一次。
4. 结束状态：
   - `status=ended`
   - `winner`
   - `endReason`
   - `scores`
   - `duration`
   - `flipCount`

## 4. 服务端房间内存结构设计

WebSocket 服务端建议先使用单实例内存房间。云托管服务先保持最小实例数 1、最大实例数 1，避免同一房间的两名玩家被分配到不同实例。

```js
RoomSession = {
  roomId: 'cloud room _id',
  roomCode: '123456',
  status: 'waiting' | 'countdown' | 'playing' | 'ended',
  difficulty: 'EASY' | 'MEDIUM' | 'HARD',
  seed: 123456789,
  players: {
    host: {
      openid: '',
      nickname: '',
      avatar: '',
      ready: false,
      score: 0,
      online: true,
      socketId: ''
    },
    guest: {
      openid: '',
      nickname: '',
      avatar: '',
      ready: false,
      score: 0,
      online: true,
      socketId: ''
    }
  },
  cards: [],
  gameState: {
    currentPlayer: 'host',
    flippedCards: [],
    matchedCount: 0,
    scores: { host: 0, guest: 0 },
    timer: 15,
    turnStartTime: 0,
    turnDeadline: 0,
    turnVersion: 0,
    flipCount: 0,
    actionSeq: 0
  },
  clients: Map,
  lastActiveAt: 0,
  createdAt: 0,
  updatedAt: 0
}
```

### 4.1 单实例约束

第一期 WebSocket 迁移只支持单实例内存房间：

- 优点：实现快，延迟低，不需要 Redis。
- 风险：服务重启会丢失内存房间，需要从 `rooms` 集合恢复最近快照。
- 运营建议：正式切 WebSocket 前，云托管先固定 1 个实例。

### 4.2 后续扩展

如果后续流量增长，需要多实例：

- 引入 Redis / TencentDB 作为共享房间状态。
- WebSocket 服务只做连接层和广播层。
- actionSeq、房间状态和玩家连接路由需要跨实例共享。

## 5. 消息协议设计

### 5.1 通用消息格式

客户端发给服务端、服务端发给客户端都使用统一格式：

```json
{
  "type": "flipCard",
  "requestId": "client-generated-id",
  "roomId": "room-doc-id",
  "roomCode": "123456",
  "role": "host",
  "openid": "user-openid",
  "clientTime": 1783000000000,
  "payload": {}
}
```

服务端广播时追加：

```json
{
  "type": "flipCard",
  "requestId": "client-generated-id",
  "roomId": "room-doc-id",
  "serverTime": 1783000000123,
  "actionSeq": 12,
  "from": {
    "role": "host",
    "openid": "user-openid"
  },
  "payload": {}
}
```

### 5.2 hello

连接建立后的握手消息。

客户端发送：

```json
{
  "type": "hello",
  "payload": {
    "clientVersion": "1.0.0",
    "platform": "wechat-minigame"
  }
}
```

服务端返回：

```json
{
  "type": "helloAck",
  "payload": {
    "socketId": "generated-socket-id",
    "heartbeatInterval": 10000
  }
}
```

### 5.3 joinRoom

进入等待页或对战页时加入 WebSocket 房间。

客户端发送：

```json
{
  "type": "joinRoom",
  "roomId": "room-doc-id",
  "roomCode": "123456",
  "role": "host",
  "payload": {
    "player": {
      "openid": "",
      "nickname": "",
      "avatar": ""
    }
  }
}
```

服务端处理：

1. 校验 `roomId` 或 `roomCode`。
2. 必要时从云数据库加载房间快照。
3. 绑定 socketId 到 host/guest。
4. 向当前连接返回 `roomSnapshot`。
5. 向房间内其他玩家广播 `playerJoined`。

服务端返回：

```json
{
  "type": "roomSnapshot",
  "roomId": "room-doc-id",
  "payload": {
    "room": "RoomSession stripped for client"
  }
}
```

### 5.4 playerReady

等待页准备/取消准备。

```json
{
  "type": "playerReady",
  "roomId": "room-doc-id",
  "role": "guest",
  "payload": {
    "ready": true
  }
}
```

服务端广播：

```json
{
  "type": "roomState",
  "roomId": "room-doc-id",
  "payload": {
    "players": {},
    "status": "waiting"
  }
}
```

当双方 ready 且 guest 存在时，服务端把状态改为 `countdown` 并广播 `countdownStart`。

### 5.5 difficultyChange

仅 host 可以发送。

```json
{
  "type": "difficultyChange",
  "roomId": "room-doc-id",
  "role": "host",
  "payload": {
    "difficulty": "MEDIUM"
  }
}
```

服务端校验：

- 发送方必须是 host。
- 房间不能是 `countdown`、`playing`、`ended`。
- 难度必须是 `EASY`、`MEDIUM`、`HARD`。

服务端广播 `roomState`，包含最新 difficulty。

### 5.6 gameStart

倒计时结束后由 host 或服务端触发。推荐服务端在 `countdownStart` 后维护开始时间，倒计时结束时广播 `gameStart`。

```json
{
  "type": "gameStart",
  "roomId": "room-doc-id",
  "payload": {
    "cards": [],
    "gameState": {
      "currentPlayer": "host",
      "turnStartTime": 1783000000000,
      "turnDeadline": 1783000015000,
      "turnVersion": 1,
      "flipCount": 0
    }
  }
}
```

迁移初期可以继续让 `updateRoom.startGame` 生成牌堆，WebSocket 服务只读取并广播该结果。后续再把牌堆生成放到 WebSocket 服务端。

### 5.7 flipCard

翻牌必须“一张牌一条消息”，不能把两张牌合并。

客户端发送：

```json
{
  "type": "flipCard",
  "roomId": "room-doc-id",
  "role": "host",
  "payload": {
    "cardId": "card_1_a",
    "localActionSeq": 5
  }
}
```

服务端处理：

1. 校验房间是 `playing`。
2. 校验发送方是 `currentPlayer`。
3. 校验该牌是 hidden 且本回合没有翻过。
4. 服务端递增 `actionSeq`。
5. 更新内存中的 `cards` 和 `gameState.flippedCards`。
6. 广播 `flipCard`。

服务端广播：

```json
{
  "type": "flipCard",
  "roomId": "room-doc-id",
  "actionSeq": 12,
  "from": { "role": "host" },
  "payload": {
    "cardId": "card_1_a",
    "state": "revealed",
    "flippedCards": ["card_1_a"]
  }
}
```

客户端规则：

- 收到自己的回声消息时，只用于确认 actionSeq，不重复播放翻牌。
- 收到对手消息时，应用翻牌动画。
- 如果发现 actionSeq 跳号，主动请求 `roomSnapshot`。

### 5.8 turnResult

两张牌翻开后，判定结果广播。第一阶段可以由当前操作方本地判定后发给服务端；更稳的版本应由服务端根据 pairId 判定。

推荐服务端判定：

```json
{
  "type": "turnResult",
  "roomId": "room-doc-id",
  "actionSeq": 13,
  "payload": {
    "matched": true,
    "cards": ["card_1_a", "card_1_b"],
    "scores": { "host": 1, "guest": 0 },
    "currentPlayer": "host",
    "matchedCount": 1,
    "turnStartTime": 1783000001000,
    "turnDeadline": 1783000016000,
    "turnVersion": 2
  }
}
```

匹配成功：

- 两张牌状态改为 `matched`。
- 当前玩家分数 +1。
- 当前玩家继续回合。
- 倒计时重置到 15 秒。

匹配失败：

- 服务端广播 `turnResult` 后，客户端延迟 1 秒翻回。
- 当前玩家切换为另一方。
- 倒计时重置到 15 秒。

### 5.9 playerLeave

等待页离开：

```json
{
  "type": "playerLeave",
  "roomId": "room-doc-id",
  "role": "guest"
}
```

对战中离开：

- 服务端广播 `playerLeave`。
- 调用或提示客户端调用 `leaveRoom` 云函数。
- 另一方弹窗提示“对方已退出，本局判定你获胜”。

### 5.10 heartbeat

客户端每 10 秒发送：

```json
{
  "type": "ping",
  "payload": {
    "time": 1783000000000
  }
}
```

服务端返回：

```json
{
  "type": "pong",
  "payload": {
    "time": 1783000000123
  }
}
```

服务端如果 30 秒没有收到某客户端心跳：

- 标记玩家 `online=false`。
- 广播 `playerOffline`。
- 保留房间一段时间，等待重连。

### 5.11 error

统一错误格式：

```json
{
  "type": "error",
  "requestId": "client-generated-id",
  "payload": {
    "code": "NOT_YOUR_TURN",
    "message": "还没轮到你操作"
  }
}
```

建议错误码：

- `ROOM_NOT_FOUND`
- `ROOM_FULL`
- `ROOM_ALREADY_STARTED`
- `NOT_IN_ROOM`
- `ONLY_HOST`
- `NOT_YOUR_TURN`
- `CARD_NOT_FLIPPABLE`
- `INVALID_ACTION`
- `STALE_ACTION`
- `SERVER_BUSY`

## 6. 客户端重连策略

### 6.1 SocketManager 状态机

客户端新增 `SocketManager`，建议状态如下：

```js
SOCKET_STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  OPEN: 'open',
  RECONNECTING: 'reconnecting',
  FALLBACK: 'fallback',
  CLOSED: 'closed'
}
```

### 6.2 连接流程

1. `RoomScene` 或 `GameScene` 进入时，如果 `SYNC_MODE === 'websocket'`，调用 `SocketManager.connect()`。
2. 连接成功后发送 `hello`。
3. 发送 `joinRoom`。
4. 收到 `roomSnapshot` 后更新本地 UI。
5. 开始心跳。

### 6.3 断线处理

短断线：

1. 设置状态为 `RECONNECTING`。
2. 暂停本地点击。
3. 使用指数退避重连：1s、2s、4s，最多 3 次。
4. 重连成功后发送 `joinRoom`，拉取 `roomSnapshot`。
5. 如果 actionSeq 有缺口，以 snapshot 为准。

重连失败：

1. 设置状态为 `FALLBACK`。
2. 关闭 WebSocket。
3. 切回现有 `NetworkManager.watchRoom()` 和云函数 `updateRoom`。
4. 拉取最新 `rooms` 文档并恢复对局。
5. 显示中文提示：“连接不稳定，已切回云同步”。

### 6.4 消息队列

客户端本地发送消息时：

- 如果 socket 已打开，立即发送。
- 如果正在重连，排队等待。
- 排队只允许低风险消息，例如 `ping` 不排队、`flipCard` 最多排队 2 条。
- 超过 3 秒未发送的操作直接丢弃，并拉取 snapshot。

## 7. 迁移分阶段计划

### 阶段 0：安全准备

已完成：

- `main` 保留稳定版本。
- 创建 `websocket-migration` 分支。
- 创建 `stable-before-websocket` tag。

### 阶段 1：只新增文档

本阶段只新增 `websocket-migration.md`，不改业务代码。

验收标准：

- `git diff` 只出现文档文件。
- 小游戏现有编译和运行不受影响。

### 阶段 2：新增 WebSocket 服务端骨架

新增 `server/websocket/`：

- Node.js + Express + ws。
- `GET /health`。
- `/ws` WebSocket 入口。
- hello、ping/pong、joinRoom、leaveRoom、broadcast。
- 内存 rooms Map。
- 心跳清理。
- README。

同时修改 `project.config.json`：

- 把 `server/` 加入 `packOptions.ignore`，避免小游戏包体超 4MB。

验收标准：

- 本地 `npm install` 和启动服务正常。
- `GET /health` 返回 `{ ok: true }`。
- 这一步不接入小游戏对战。

### 阶段 3：新增 SocketManager，但默认关闭

新增 `js/managers/SocketManager.js`：

- 单例模式。
- connect/disconnect/send/on/off。
- heartbeat。
- reconnect。
- message queue。
- selfTest。

新增配置：

```js
export const SYNC_MODE = 'cloud'
export const ENABLE_WS_DEBUG = false
export const WS_CONFIG = {
  env: 'prod-d9g87ibuu6e4a9bb1',
  service: 'express-zt59',
  path: '/ws',
  heartbeatInterval: 10000,
  reconnectMaxAttempts: 3
}
```

验收标准：

- 默认 `SYNC_MODE='cloud'`，现有玩法完全不变。
- `SocketManager` 不被 `GameScene` 自动调用。

### 阶段 4：独立连通测试

只测试连接，不接入游戏同步：

- 调用 `SocketManager.selfTest()`。
- 连接 `/ws`。
- 发送 ping。
- 收到 pong。
- 输出调试日志。

验收标准：

- 真机上能看到连接成功。
- 测完关闭 `ENABLE_WS_DEBUG`。

### 阶段 5：只迁移等待页 RoomScene

当 `SYNC_MODE === 'websocket'` 时，等待页改走 WebSocket：

- 对手加入。
- 准备/取消准备。
- 房主切难度。
- 倒计时开始。
- 玩家退出。

保留云同步回退：

- WebSocket 连接失败则使用现有 polling / 云函数。

验收标准：

- 房主切难度，guest 立即看到。
- 双方准备后正常倒计时。
- 一方退出，另一方能看到状态变化。
- `SYNC_MODE='cloud'` 时现有逻辑不变。

### 阶段 6：迁移对战页 GameScene

翻牌同步走 WebSocket：

- `flipCard` 一张牌一条消息。
- 服务端分配 `actionSeq`。
- 客户端按顺序应用。
- 两张牌判定后广播 `turnResult`。
- 匹配成功/失败都重置 15 秒倒计时。
- 断线时暂停输入并重连。

保留云同步回退：

- WebSocket 失败时切回 `NetworkManager`。
- 拉取 `rooms` 最新快照。

验收标准：

- 主场第一下翻牌客场能看到。
- 快速连续翻两张不会漏。
- 匹配成功继续本方回合。
- 匹配失败双方 1 秒后翻回并切换回合。
- 双方倒计时一致。

### 阶段 7：降低云调用次数

WebSocket 稳定后再优化云调用：

- 翻牌不再调用 `updateRoom`。
- 每局只在创建、加入、开始、低频快照、结束时写云。
- 每 30 秒最多保存一次容灾快照。

验收标准：

- 一局对战的云函数调用次数明显下降。
- 结算、战绩、退出判胜仍正常。

### 阶段 8：测试、提交、合并

测试模式：

- `SYNC_MODE='cloud'`
- `SYNC_MODE='websocket'`
- WebSocket 失败自动回退 cloud

通过后：

- 提交 `websocket-migration` 分支。
- 推送到 GitHub。
- 等确认后再合并回 `main`。

## 8. 回滚方案

### 8.1 配置级回滚

最优先使用配置回滚：

```js
export const SYNC_MODE = 'cloud'
export const ENABLE_WS_DEBUG = false
```

这样游戏会继续走现有云函数 + 数据库同步。

### 8.2 Git 分支回滚

如果迁移分支出现问题：

```bash
git switch main
```

或者回到稳定 tag：

```bash
git switch -c rollback-from-websocket stable-before-websocket
```

### 8.3 云托管回滚

云托管服务端如果出问题：

1. 停止把客户端配置切到 `websocket`。
2. 云托管可以回退到上一个发布版本。
3. 如果服务端完全不可用，客户端应自动 fallback 到 cloud。

### 8.4 数据回滚

迁移初期不改变 `rooms`、`records`、`users`、`ranks` 的核心结构，所以不需要数据库迁移脚本。

如果后续新增字段，必须满足：

- 新字段可选。
- 旧客户端忽略后不崩。
- 云函数读取时有默认值。

## 9. 第一版 WebSocket 不做的事

为降低风险，第一版不做：

1. 多实例房间共享。
2. Redis 状态中心。
3. 服务端完全权威判定所有游戏规则。
4. 观战。
5. 断线后跨设备恢复完整动画。
6. 删除现有 `NetworkManager`。

第一版目标只有一个：把房间内高频翻牌消息从云数据库写入改成 WebSocket 广播，同时保留随时回退到当前稳定版本的能力。

## 10. 后续实现优先级

推荐优先级：

1. `server/websocket/` 服务端骨架。
2. `SocketManager` 客户端骨架。
3. WebSocket selfTest。
4. 等待页同步。
5. 翻牌同步。
6. 云调用次数优化。
7. 多实例与共享状态。

## 11. 当前分支实现状态

当前 `websocket-migration` 分支已经完成：

1. 新增 `server/websocket/` 云托管服务端骨架。
   - `GET /health`
   - `/ws`
   - `hello`
   - `ping` / `pong`
   - `joinRoom`
   - `leaveRoom`
   - `playerReady`
   - `difficultyChange`
   - `gameStart`
   - `flipCard`
   - `turnResult`
   - `gameStateUpdate`
   - `requestSnapshot`
2. 新增 `js/managers/SocketManager.js`。
   - `connect`
   - `disconnect`
   - `send`
   - `on`
   - `off`
   - `heartbeat`
   - `reconnect`
   - `selfTest`
3. 新增配置：

```js
export const SYNC_MODE = 'cloud'
export const ENABLE_WS_DEBUG = false
export const WS_CONFIG = {
  env: 'prod-d9g87ibuu6e4a9bb1',
  service: 'express-zt59',
  path: '/ws'
}
```

4. `game.js` 加入 WebSocket selfTest 入口，但默认关闭。
5. `RoomScene` 加入 WebSocket 等待页广播能力，但只有 `SYNC_MODE === 'websocket'` 时启用。
6. `GameScene` 加入 WebSocket 翻牌与快照同步能力，但只有 `SYNC_MODE === 'websocket'` 时启用。
7. `project.config.json` 已忽略 `server/`，避免小游戏主包超过 4MB。

当前默认配置仍是 `SYNC_MODE = 'cloud'`，所以微信开发者工具编译后应继续走原来的云函数和数据库同步。

## 12. 本地检查结果

已完成以下本地检查：

```bash
cd server/websocket
npm install
npm run check
node --check src/room-store.js
```

服务端本地健康检查通过：

```text
GET http://127.0.0.1:31873/health
=> {"ok":true,"service":"flip-battle-websocket","uptime":3,"rooms":0,"clients":0}
```

服务端本地 WebSocket ping/pong 通过：

```text
ws://127.0.0.1:31874/ws
=> pong
```

小游戏侧语法检查通过：

```bash
node --check game.js
node --check js/managers/SocketManager.js
node --check js/scenes/RoomScene.js
node --check js/scenes/GameScene.js
```

`project.config.json` JSON 解析通过。

## 13. 明天测试步骤

### 13.1 稳定模式测试

保持：

```js
export const SYNC_MODE = 'cloud'
export const ENABLE_WS_DEBUG = false
```

测试：

1. 微信开发者工具编译。
2. 创建房间。
3. 加入房间。
4. 房主切难度。
5. 双方准备进入游戏。
6. 快速翻两张。
7. 匹配成功继续回合。
8. 匹配失败切换回合。
9. 结算保存。

预期：表现应该和迁移前一致。

### 13.2 WebSocket 连通测试

先把 `server/websocket/` 部署到微信云托管服务。

确认 `WS_CONFIG`：

```js
export const WS_CONFIG = {
  env: 'prod-d9g87ibuu6e4a9bb1',
  service: 'express-zt59',
  path: '/ws',
  ...
}
```

再临时打开：

```js
export const ENABLE_WS_DEBUG = true
```

测试：

1. 重新编译。
2. 进入小游戏首页。
3. 如果连接成功，会 toast：`WebSocket连接成功`。
4. 如果失败，会 toast 对应错误。

测试完再关掉：

```js
export const ENABLE_WS_DEBUG = false
```

### 13.3 WebSocket 同步测试

只有连通测试成功后，再改：

```js
export const SYNC_MODE = 'websocket'
```

测试顺序：

1. 创建房间。
2. 加入房间。
3. 房主切难度，确认 guest 是否实时看到。
4. 双方准备，确认倒计时同步。
5. 进入游戏。
6. 房主第一张翻牌，确认 guest 能看到。
7. 快速连续翻两张，确认 guest 不漏。
8. guest 快速连续翻两张，确认 host 不漏。
9. 匹配成功后，确认倒计时重置为 15 秒。
10. 匹配失败后，确认双方 1 秒后翻回并切换回合。
11. 中途退出，确认对方收到提示。

如果任一步异常，立即切回：

```js
export const SYNC_MODE = 'cloud'
```
