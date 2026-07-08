# 《翻翻对决》微信小游戏完整开发指南

> 双人记忆翻牌对战微信小游戏，基于 Canvas 2D 渲染、原生微信小游戏 API 和微信云开发实现。  
> 难度：初级 4x4、中级 4x6、高级 6x6。卡片图片统一放在资源目录，后期可直接替换。

---

## 1. 产品目标

《翻翻对决》是一款 2 人实时回合制记忆翻牌小游戏。玩家通过房间号邀请好友加入，对战中轮流翻开 2 张卡片，匹配成功得分并继续回合，匹配失败则翻回并切换给对手。所有卡片匹配完成后按分数结算胜负。

核心体验关键词：

- 上手简单：每回合只翻 2 张牌，计分规则直观。
- 对战明确：当前回合、倒计时、分数和匹配状态实时同步。
- 易扩展：卡片图片、难度配置、音效和云函数按模块拆分。
- 适合微信传播：房间号邀请、分享战绩、好友排行榜。

---

## 2. 技术选型

### 2.1 客户端

- 渲染：微信小游戏 Canvas 2D API
- 语言：JavaScript ES6+
- 架构：场景管理 + 管理器单例 + 数据模型
- 输入：`touchstart` / `touchend`
- 音频：`wx.createInnerAudioContext()`
- 本地缓存：`wx.setStorageSync()` / `wx.getStorageSync()`

### 2.2 云端

- 微信云开发
- 云数据库集合：`rooms`、`users`、`records`、`ranks`
- 云函数：`login`、`createRoom`、`joinRoom`、`leaveRoom`、`saveGameResult`、`cleanupRooms`
- 实时同步：云数据库 `watch`

### 2.3 推荐目录结构

```text
flip-battle-game/
  game.js
  game.json
  project.config.json
  js/
    engine/
      Renderer.js
      Sprite.js
      Animation.js
      ParticleSystem.js
    managers/
      GameManager.js
      SceneManager.js
      InputManager.js
      NetworkManager.js
      UserManager.js
      AudioManager.js
      ShareManager.js
    models/
      Card.js
      CardGrid.js
      Player.js
    scenes/
      LoadingScene.js
      MenuScene.js
      RoomScene.js
      GameScene.js
      ResultScene.js
      RankScene.js
    ui/
      Button.js
      Dialog.js
      Toast.js
    utils/
      config.js
      helpers.js
      storage.js
      Adapter.js
      CloudDB.js
      ResourceLoader.js
  assets/
    images/
      cards/
        card-1.png
        ...
        card-18.png
        back.png
      ui/
      share/
    audio/
      flip.mp3
      match.mp3
      fail.mp3
      click.mp3
      victory.mp3
      defeat.mp3
      bgm.mp3
  cloudfunctions/
    login/
    createRoom/
    joinRoom/
    leaveRoom/
    saveGameResult/
    cleanupRooms/
```

---

## 3. 难度配置

统一在 `js/utils/config.js` 中维护，游戏逻辑和布局都从配置读取。

```javascript
export const DIFFICULTY = {
  EASY: {
    key: 'EASY',
    name: '初级',
    rows: 4,
    cols: 4,
    pairs: 8,
    estimatedTime: '2-3分钟'
  },
  MEDIUM: {
    key: 'MEDIUM',
    name: '中级',
    rows: 4,
    cols: 6,
    pairs: 12,
    estimatedTime: '4-5分钟'
  },
  HARD: {
    key: 'HARD',
    name: '高级',
    rows: 6,
    cols: 6,
    pairs: 18,
    estimatedTime: '6-8分钟'
  }
}

export const TURN_SECONDS = 30

export const CARD_IMAGES = Array.from({ length: 18 }, (_, i) => (
  `assets/images/cards/card-${i + 1}.png`
))

export const CARD_BACK_IMAGE = 'assets/images/cards/back.png'
```

注意：中级需求为 `4x6`，不要误写成 `5x5`，否则总卡片数会变成奇数，无法完整配对。

---

## 4. 核心数据结构

### 4.1 Card

```javascript
{
  id: 'card_1',
  pairId: 'pair_3',
  frontImage: 'assets/images/cards/card-3.png',
  backImage: 'assets/images/cards/back.png',
  state: 'HIDDEN', // HIDDEN | REVEALED | MATCHED
  x: 0,
  y: 0,
  width: 80,
  height: 100,
  flipProgress: 0,
  locked: false
}
```

### 4.2 Player

```javascript
{
  openid: 'openid',
  role: 'host', // host | guest
  nickname: '玩家',
  avatarUrl: '',
  score: 0,
  ready: false,
  online: true
}
```

### 4.3 Room

```javascript
{
  _id: 'room_doc_id',
  roomCode: '123456',
  hostId: 'openid_a',
  guestId: 'openid_b',
  difficulty: 'EASY',
  status: 'waiting', // waiting | ready | countdown | playing | ended
  players: {
    host: {},
    guest: {}
  },
  gameState: {},
  createTime: Date,
  updateTime: Date,
  expireAt: Date
}
```

### 4.4 GameState

```javascript
{
  seed: 123456,
  currentPlayer: 'host',
  cards: [
    { id: 'card_1', pairId: 'pair_1', imageIndex: 1, state: 'HIDDEN' }
  ],
  flippedCards: ['card_1', 'card_8'],
  matchedPairs: ['pair_1'],
  scores: {
    host: 0,
    guest: 0
  },
  turnStartTime: 1710000000000,
  turnSeq: 1,
  lastAction: {
    type: 'FLIP_CARD',
    actor: 'host',
    cardId: 'card_1',
    actionId: 'host_1710000000000'
  },
  gameStatus: 'playing',
  winner: null,
  endReason: null
}
```

`turnSeq` 和 `actionId` 用于降低重复提交和乱序同步风险。

---

## 5. 游戏规则状态机

### 5.1 回合状态

```text
WAITING_INPUT
  -> FIRST_CARD_REVEALED
  -> JUDGING
    -> MATCH_SUCCESS -> WAITING_INPUT
    -> MATCH_FAIL -> SWITCH_TURN -> WAITING_INPUT
  -> ENDED
```

### 5.2 翻牌约束

点击卡片前必须同时满足：

- 房间状态为 `playing`
- 当前玩家是自己
- 当前不在 `JUDGING` 或动画锁定状态
- 该卡片未匹配、未翻开
- 不是本回合已翻的第一张卡
- 本回合已翻卡片数小于 2

### 5.3 判定逻辑

```javascript
function judgeTurn(cardA, cardB, state) {
  if (cardA.pairId === cardB.pairId) {
    cardA.state = 'MATCHED'
    cardB.state = 'MATCHED'
    state.matchedPairs.push(cardA.pairId)
    state.scores[state.currentPlayer] += 1
    state.flippedCards = []
    state.turnStartTime = Date.now()
    return 'MATCH_SUCCESS'
  }

  cardA.state = 'HIDDEN'
  cardB.state = 'HIDDEN'
  state.flippedCards = []
  state.currentPlayer = state.currentPlayer === 'host' ? 'guest' : 'host'
  state.turnSeq += 1
  state.turnStartTime = Date.now()
  return 'MATCH_FAIL'
}
```

### 5.4 超时处理

客户端每帧显示倒计时，但真正判定要以云端或房间状态中的 `turnStartTime` 为准。

超时后：

- 当前已翻未匹配卡片恢复为 `HIDDEN`
- `flippedCards` 清空
- 切换 `currentPlayer`
- `turnSeq + 1`
- 写入云端

建议只允许当前回合玩家提交超时切换；对手端发现超时只显示等待或尝试一次兜底同步，避免双方同时写入。

---

## 6. Canvas 渲染设计

### 6.1 渲染分层

```text
背景层：渐变背景、背景粒子
游戏层：卡片网格、翻转动画、匹配动画
UI层：玩家信息、分数、倒计时、按钮、Toast
```

微信小游戏通常只有一个主 Canvas，可以在代码中用模块化渲染顺序模拟分层。静态背景可使用离屏 Canvas 缓存。

### 6.2 主循环

```javascript
function loop(timestamp) {
  const delta = timestamp - lastTime
  lastTime = timestamp

  sceneManager.currentScene.update(delta)
  renderer.clear()
  sceneManager.currentScene.render(renderer.ctx)

  requestAnimationFrame(loop)
}
```

### 6.3 卡片布局

布局输入：

- 屏幕宽高
- 安全区
- 顶部玩家栏高度
- 底部按钮区高度
- `rows` / `cols`

布局算法：

1. 计算可用区域。
2. 根据行列数计算最大卡片宽高。
3. 限制卡片宽高比例，例如 `cardHeight = cardWidth * 1.25`。
4. 网格整体居中。
5. 高级 `6x6` 确保最小点击区域不小于 44px。

### 6.4 翻转动画

使用水平缩放模拟 3D 翻牌：

```text
0.0 - 0.5：scaleX 从 1 到 0，显示背面
0.5：切换为正面
0.5 - 1.0：scaleX 从 0 到 1，显示正面
```

匹配成功：

- 两张牌轻微放大
- 星星粒子从中心散开
- 保持正面

匹配失败：

- 两张牌轻微抖动
- 延迟 1 秒
- 执行反向翻转回背面

---

## 7. 场景设计

### 7.1 LoadingScene

职责：

- 初始化 Canvas、适配器、资源加载器
- 预加载卡片图、背面图、UI 图、音频
- 初始化 `wx.cloud.init`
- 读取本地用户设置
- 跳转主菜单

### 7.2 MenuScene

UI：

- 游戏标题《翻翻对决》
- 玩家头像、昵称、胜率概览
- 创建房间
- 加入房间
- 单人练习，可作为调试和离线体验
- 排行榜
- 设置入口

### 7.3 RoomScene

UI：

- 6 位房间号
- 复制房间号
- 邀请好友
- 房主与对手信息
- 难度选择器，仅房主可操作
- 准备 / 取消准备
- 退出房间
- 双方准备后 3 秒倒计时

同步：

- 监听房间文档
- 对手加入或退出
- 难度变化
- 准备状态变化
- 状态进入 `playing` 后跳转游戏场景

### 7.4 GameScene

UI：

- 顶部双方头像、昵称、分数
- 当前回合高亮
- 30 秒倒计时
- 中央卡片网格
- 退出按钮

逻辑：

- 只允许当前玩家点击
- 本地乐观翻牌
- 同步 `gameState`
- 监听对手操作
- 全部匹配后进入结算

### 7.5 ResultScene

UI：

- 胜利 / 失败 / 平局
- 双方分数
- 难度、用时、匹配对数
- 再来一局
- 返回主菜单
- 分享战绩
- 查看排行

职责：

- 调用 `saveGameResult`
- 更新用户统计
- 播放胜负音效和胜利粒子

---

## 8. 房间与实时同步

### 8.1 创建房间

云函数 `createRoom`：

1. 获取调用者 openid。
2. 生成 6 位数字房间号。
3. 查询 `rooms` 确认未被占用。
4. 创建房间，设置调用者为房主。
5. 返回房间数据。

房间号规则：

- 范围：`100000` 到 `999999`
- 排除 `000000`、`111111`、`123456` 等弱号码
- 数据库建立唯一索引

### 8.2 加入房间

云函数 `joinRoom`：

1. 校验房间号格式。
2. 查询房间是否存在。
3. 校验状态为 `waiting` 或 `ready`。
4. 校验未满员。
5. 写入 `guestId` 和玩家信息。

### 8.3 游戏同步策略

客户端写入场景：

- 翻第一张牌
- 翻第二张牌
- 判定匹配结果
- 回合切换
- 超时切换
- 游戏结束

推荐将一回合内的关键状态合并写入，避免每帧或动画中写库。

`NetworkManager` 负责：

- `watchRoom(roomId, onChange)`
- `updateGameState(roomId, partialState)`
- `syncReady(roomId, ready)`
- `syncDifficulty(roomId, difficulty)`
- `leaveRoom(roomId)`

冲突处理：

- 本地操作先检查 `turnSeq`
- 云端状态变化后以云端为准
- 如果本地乐观状态与云端不一致，回滚到云端状态
- 每次操作带 `actionId`，重复事件直接忽略

---

## 9. 云数据库设计

### 9.1 rooms

索引：

- `roomCode` 唯一索引
- `status`
- `expireAt`

权限：

- 创建、加入、离开、结算优先通过云函数
- 客户端可读自己所在房间
- 客户端可 watch 自己所在房间

### 9.2 users

```javascript
{
  _openid: 'openid',
  nickname: '玩家',
  avatarUrl: '',
  totalGames: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0,
  maxScore: 0,
  totalScore: 0,
  createTime: Date,
  updateTime: Date
}
```

### 9.3 records

```javascript
{
  players: [
    { openid: 'a', role: 'host', score: 8 },
    { openid: 'b', role: 'guest', score: 6 }
  ],
  winner: 'a',
  result: 'host_win',
  difficulty: 'EASY',
  duration: 180,
  matchedPairs: 8,
  createTime: Date
}
```

### 9.4 ranks

每日或每局后更新：

```javascript
{
  _openid: 'openid',
  nickname: '玩家',
  avatarUrl: '',
  wins: 150,
  totalGames: 200,
  winRate: 75,
  score: 7500,
  updateTime: Date
}
```

全服排行建议设置最低场次要求：`totalGames >= 10`。

---

## 10. 用户系统

登录流程：

```text
启动游戏
  -> wx.login()
  -> 调用 login 云函数获取 openid
  -> 查询或创建 users 记录
  -> 尝试获取昵称头像
  -> 本地缓存用户信息
  -> 进入主菜单
```

授权策略：

- 用户授权则使用微信头像昵称。
- 用户拒绝则使用默认昵称“玩家”和默认头像。
- 不请求手机号等敏感信息。
- 游客模式可以玩，但不保存完整战绩。

---

## 11. 分享与排行榜

### 11.1 邀请好友进房

```javascript
wx.shareAppMessage({
  title: '来和我一起玩《翻翻对决》！房间号：123456',
  imageUrl: 'assets/images/share/invite.png',
  query: 'roomCode=123456'
})
```

`game.js` 在 `wx.onShow` 中解析 `query.roomCode`，直接进入加入房间流程。

### 11.2 分享战绩

使用 Canvas 动态绘制分享图：

- 胜负结果
- 双方分数
- 难度
- 用时
- 挑战文案

### 11.3 排行榜

优先实现全服排行榜：

- 查询 `ranks`
- 按 `winRate`、`wins` 排序
- 显示前 50 名

好友排行榜作为后续增强：

- 使用开放数据域
- 主域通过 `postMessage` 请求渲染
- 开放数据域绘制好友排名 Canvas

---

## 12. 音效系统

音频清单：

| 文件 | 触发 |
| --- | --- |
| `flip.mp3` | 翻牌 |
| `match.mp3` | 匹配成功 |
| `fail.mp3` | 匹配失败 |
| `click.mp3` | 按钮点击 |
| `victory.mp3` | 胜利 |
| `defeat.mp3` | 失败 |
| `bgm.mp3` | 背景音乐循环 |

实现建议：

- `AudioManager` 单例集中管理。
- 音效实例预加载并复用。
- 背景音乐单独实例，设置 `loop = true`。
- 设置页提供音乐和音效独立开关。
- 本地缓存用户音频设置。

---

## 13. 资源替换规范

卡片图片统一放在：

```text
assets/images/cards/
```

命名规则：

```text
card-1.png
card-2.png
...
card-18.png
back.png
```

推荐规格：

- PNG
- 透明或纯色背景均可
- 建议尺寸：`256x256`
- 文件大小尽量小于 `100KB`
- 18 张正面图案必须差异明显

替换方式：

1. 保持文件名不变。
2. 直接替换对应 PNG。
3. 无需修改代码。
4. 重新上传小游戏代码或资源包。

---

## 14. 性能优化

必做：

- 资源进入游戏前预加载。
- 静态背景使用离屏 Canvas 缓存。
- 粒子对象池复用。
- 高级难度降低粒子数量。
- 动画期间锁定输入。
- 云数据库写入节流，避免连续频繁 update。
- 图片压缩后再入包。

低端机降级：

- 背景粒子从 30 个降到 10 个。
- 胜利粒子减少。
- 关闭复杂阴影。
- 保持游戏逻辑优先于视觉效果。

---

## 15. 异常处理

必须覆盖的异常：

- 房间不存在
- 房间已满
- 房间已开始
- 对手退出
- 自己退出
- 网络断开
- watch 监听失败
- 云函数调用失败
- 连点卡片
- 当前不是自己回合
- 30 秒超时
- 游戏中切后台

建议处理：

- `wx.onHide`：暂停音乐，记录当前状态。
- `wx.onShow`：重新拉取房间数据，恢复 watch。
- 对手中途退出：判定当前玩家胜利，进入结算。
- 自己主动退出：视为认输，调用离房或结算云函数。

---

## 16. 测试清单

功能测试：

- 创建房间成功。
- 输入 6 位房间号加入成功。
- 房主可修改难度，对手实时看到。
- 双方准备后倒计时进入游戏。
- 当前回合玩家可翻牌，对手不可翻牌。
- 匹配成功得分并继续回合。
- 匹配失败 1 秒后翻回并切换回合。
- 30 秒超时自动切换。
- 全部匹配后结算。
- 分享房间链接能带入房间号。

异常测试：

- 快速连点同一张卡。
- 快速点击多张卡。
- 对手退出。
- 断网后恢复。
- 游戏切后台再回来。
- 云函数失败提示。
- 房间 30 分钟未开始自动过期。

兼容测试：

- iPhone 小屏。
- Android 小屏。
- 刘海屏和全面屏。
- 低性能设备。
- 微信开发者工具和真机。

性能测试：

- 初级、中级、高级均保持流畅。
- 高级 36 张卡片点击区域可用。
- 长时间等待房间不会明显卡顿。
- 粒子效果不会造成掉帧。

---

## 17. 开发里程碑

### 阶段 1：项目骨架

- 创建目录结构。
- 配置 `game.js`、`game.json`、`project.config.json`。
- 完成 Canvas 初始化、场景管理和主循环。

### 阶段 2：单机核心玩法

- 实现 Card、CardGrid、GameLogic。
- 实现三档难度。
- 实现翻牌、匹配、计分、胜负结算。
- 完成基础 GameScene。

### 阶段 3：房间与云同步

- 创建云数据库集合。
- 实现登录、创建房间、加入房间、离开房间云函数。
- 接入房间 watch。
- 完成双人实时回合同步。

### 阶段 4：完整场景

- LoadingScene。
- MenuScene。
- RoomScene。
- ResultScene。
- RankScene。

### 阶段 5：表现层

- 翻牌动画。
- 匹配成功和失败动画。
- 粒子系统。
- 音效和背景音乐。
- 分享图绘制。

### 阶段 6：测试与发布

- 真机联调。
- 异常流程测试。
- 性能优化。
- 准备图标、截图和审核材料。
- 上线 1.0.0。

---

## 18. 发布准备

小游戏信息：

- 名称：翻翻对决
- 类目：休闲益智
- 简介：双人实时记忆翻牌对战，创建房间邀请好友，比拼记忆力和策略。
- 版本号：`1.0.0`

素材：

- 图标：`1024x1024`
- 分享图：建议 `5:4` 比例
- 功能截图：至少 5 张
- 卡片图：18 张 `256x256 PNG`

发布前检查：

- 云环境 ID 已替换为正式环境。
- 数据库权限已配置。
- 云函数已上传并测试。
- 删除调试用 `console.log`。
- 真机测试创建房间、加入房间、分享和结算。
- 图片和音频资源路径大小写一致。

---

## 19. 推荐实现顺序

最稳妥的开发顺序：

1. 先做单机翻牌核心逻辑。
2. 再接 Canvas 动画。
3. 再做房间和 watch 同步。
4. 再补用户系统、战绩和排行。
5. 最后做粒子、音效、分享图和发布优化。

这样可以保证最难的实时对战问题建立在已经稳定的本地游戏规则之上，调试成本最低。

