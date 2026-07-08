# 《翻翻对决》微信小游戏开发提示词清单

> 双人记忆翻牌对战微信小游戏完整开发指南
> 
> 难度设置：初级(4x4)、中级(4x6)、高级(6x6)
> 
> 卡片图片支持后期替换

---

## 阶段一：需求分析与设计（3条）

### 提示词 1.1 - 功能需求分析
```
帮我详细分析《翻翻对决》双人记忆翻牌微信小游戏的完整功能需求，包括：
1. 核心玩法规则（翻牌规则、计分机制、回合制）
2. 难度设置：初级4x4（16张卡片）、中级4x6（24张卡片）、高级6x6（36张卡片）
3. 双人对战模式（房间创建、6位数房间号、匹配机制、实时同步）
4. 用户系统（微信登录、战绩、排行榜）
5. 游戏视觉（卡片翻转动画、粒子效果、音效）
6. 微信小游戏特性（转发分享、好友对战）
请以清晰列表输出，明确这是Canvas渲染的微信小游戏。
```

### 提示词 1.2 - 游戏场景与界面设计
```
基于《翻翻对决》需求，设计微信小游戏的场景结构：
1. 场景清单：启动场景、主菜单、房间等待、游戏对战、结算场景
2. 每个场景的Canvas布局和UI元素位置
3. 场景切换流程图
4. 不同难度下的卡片网格布局（4x4、5x5、6x6自适应屏幕）
5. 适配方案（不同屏幕尺寸、安全区域）
请详细描述Canvas渲染要点。
```

### 提示词 1.3 - 技术架构与数据结构
```
为《翻翻对决》设计技术架构：
1. 推荐使用原生Canvas + 微信云开发（无需引入游戏引擎，减小包体积）
2. 数据结构设计：
   - Card（id、pairId、imageUrl、state、position）
   - Player（openid、nickname、avatar、score）
   - Room（roomCode、hostId、guestId、difficulty、gameState、cards）
   - GameState（currentPlayer、flippedCards、matchedCount、timer）
3. 网络方案：微信云开发 + 云数据库watch实时监听
4. 云数据库集合：rooms、users、records、ranks
5. 资源管理：图片路径统一为 /assets/images/cards/，支持后期替换PNG文件
请详细说明数据结构和图片资源组织方式。
```

---

## 阶段二：项目初始化（2条）

### 提示词 2.1 - 创建项目目录
```
为微信小游戏《翻翻对决》创建项目目录结构：
在 /home/claude/flip-battle-game 创建以下目录：
- /js
  - /scenes（场景类）
  - /models（数据模型）
  - /managers（管理器：游戏、场景、输入、网络、用户、音频）
  - /engine（渲染、动画、粒子）
  - /ui（按钮、对话框、Toast）
  - /utils（工具函数、配置常量）
- /assets
  - /images
    - /cards（卡片图片，支持替换：card-1.png ~ card-18.png）
    - /ui（按钮、背景等）
  - /audio（音效和背景音乐）
- /cloudfunctions（云函数）
- game.js、game.json、project.config.json
请使用bash命令创建完整目录结构和空文件。
```

### 提示词 2.2 - 配置基础文件
```
配置《翻翻对决》基础文件：
1. game.json - 配置设备方向（portrait）、云开发环境、分包
2. game.js - Canvas初始化、云开发初始化、启动场景管理器
3. project.config.json - 项目配置
4. js/managers/GameManager.js - 单例模式全局管理器
5. js/managers/SceneManager.js - 场景切换管理
6. js/utils/config.js - 配置常量：
   - DIFFICULTY: { EASY: {rows:4, cols:4}, MEDIUM: {rows:5, cols:5}, HARD: {rows:6, cols:6} }
   - CARD_IMAGES: 卡片图片路径数组（18种图案，支持后期替换）
   - COLORS、FONTS等
生成完整代码并保存到对应文件。
```

---

## 阶段三：核心系统（4条）

### 提示词 3.1 - Canvas渲染引擎
```
开发基础Canvas渲染系统：
1. js/engine/Renderer.js - 渲染器类（单例）
   - 初始化Canvas、获取ctx
   - 封装drawImage、drawText、drawRect、drawCircle、clear
2. js/engine/Sprite.js - 精灵基类
   - 属性：x、y、width、height、rotation、scale、alpha
   - 方法：update()、render(ctx)、hitTest(x,y)
3. js/engine/Animation.js - 动画类
   - 补间动画（位置、缩放、旋转、透明度）
   - 缓动函数（easeInOut等）
使用ES6 Class，代码注释清晰。
```

### 提示词 3.2 - 卡片类与网格
```
开发卡片系统：
1. js/models/Card.js - 卡片类（继承Sprite）
   - 属性：id、pairId、frontImage、backImage、state（HIDDEN/REVEALED/MATCHED）
   - flip() - 3D翻转动画（模拟透视缩放）
   - matched() - 匹配后保持翻开
2. js/models/CardGrid.js - 网格管理
   - 根据difficulty生成配对卡片（从CARD_IMAGES随机选取）
   - 洗牌算法（Fisher-Yates）
   - 计算网格布局（居中、自适应间距）
   - hitTest(x,y) - 检测点击的卡片
生成完整代码，卡片图片路径使用config.CARD_IMAGES。
```

### 提示词 3.3 - 游戏逻辑控制
```
开发游戏逻辑管理器：
1. js/managers/GameLogic.js
   - 回合制逻辑（currentPlayer、switchTurn）
   - 翻牌逻辑（每回合翻2张）
   - 匹配判定（pairId相同则匹配）
   - 计分规则：匹配成功+1分，继续回合；失败则切换
   - 游戏结束判定（所有卡片MATCHED）
   - 回合倒计时（30秒，超时自动切换）
2. js/models/Player.js
   - 属性：id、nickname、avatar、score
   - addScore()、reset()
3. 状态机（WAITING/MY_TURN/OPPONENT_TURN/JUDGING/END）
完整代码，包含详细注释。
```

### 提示词 3.4 - 输入系统
```
开发触摸输入管理：
1. js/managers/InputManager.js（单例）
   - 监听touchstart、touchend
   - 坐标转换（屏幕坐标→Canvas坐标）
   - 节流防止连点（300ms）
2. js/ui/Button.js - 按钮类
   - 矩形/圆角矩形按钮
   - hitTest点击检测
   - onClick回调
   - 按下缩放效果
完整代码。
```

---

## 阶段四：场景开发（5条）

### 提示词 4.1 - 启动场景
```
开发启动加载场景：
1. js/scenes/LoadingScene.js
   - 显示Logo和加载进度条
   - 使用js/utils/ResourceLoader.js预加载：
     * 所有卡片图片（/assets/images/cards/card-*.png）
     * UI图片
     * 音频文件
   - 初始化云开发wx.cloud.init()
   - 加载完成→主菜单
2. js/utils/ResourceLoader.js - 资源加载器
   - loadImages(urls) - 批量加载图片
   - loadAudios(urls) - 批量加载音频
   - 返回进度百分比
完整代码。
```

### 提示词 4.2 - 主菜单场景
```
开发主菜单场景：
1. js/scenes/MenuScene.js
   - 显示游戏Logo、玩家头像昵称（调用UserManager）
   - 三个按钮：创建房间、加入房间、单人练习
   - 显示战绩概览（胜/败/胜率）
   - 排行榜入口
   - 背景粒子效果（漂浮光点）
   - 播放背景音乐
   - 按钮点击→场景跳转
完整代码，包含UI布局。
```

### 提示词 4.3 - 房间场景
```
开发房间等待场景：
1. js/scenes/RoomScene.js
   - 显示6位房间号（可复制）
   - 显示房主和对手信息（头像、昵称、准备状态）
   - 难度选择器（仅房主）：初级4x4、中级5x5、高级6x6
   - 准备/取消按钮
   - 分享房间按钮（wx.shareAppMessage）
   - 退出房间按钮
   - 双方准备后3秒倒计时开始游戏
2. 实时监听房间数据（CloudDB.watch）
   - 对手加入/退出
   - 难度变更
   - 准备状态
完整代码。
```

### 提示词 4.4 - 游戏场景
```
开发游戏对战场景：
1. js/scenes/GameScene.js
   - 顶部：双方玩家信息（头像、昵称、分数）
   - 中间：CardGrid卡片网格（根据难度渲染）
   - 当前回合指示（高亮轮到的玩家）
   - 回合倒计时（30秒）
   - 游戏逻辑：
     * 点击卡片→flip动画
     * 翻2张后判定匹配
     * 成功：+1分，继续；失败：1秒后翻回，切换
     * 所有匹配完→跳转结算
   - 暂停按钮（确认退出）
2. 实时同步：
   - 上传己方操作到云端
   - 监听对手操作并同步显示
3. 音效：翻牌、成功、失败
完整代码，包含游戏主循环。
```

### 提示词 4.5 - 结算场景
```
开发结算场景：
1. js/scenes/ResultScene.js
   - 显示胜负结果（大字）
   - 双方数据对比（分数、翻牌次数、用时）
   - 胜利动画（粒子烟花、金币）
   - 三个按钮：再来一局、返回主菜单、分享战绩
2. 调用云函数保存战绩
3. 更新用户统计数据
完整代码。
```

---

## 阶段五：云开发（3条）

### 提示词 5.1 - 云开发初始化与数据库
```
配置微信云开发：
1. game.js中初始化云开发
2. js/utils/CloudDB.js - 封装云数据库操作
   - add、update、get、watch方法
3. 数据库集合设计：
   - rooms: {_id, roomCode, hostId, guestId, difficulty, status, gameState, createTime}
   - users: {_openid, nickname, avatarUrl, wins, losses, games}
   - records: {_id, players[], scores, winner, duration, difficulty, timestamp}
   - ranks: {_openid, nickname, avatar, wins, winRate}
4. 权限配置说明
完整代码。
```

### 提示词 5.2 - 云函数：房间管理
```
开发房间管理云函数：
1. cloudfunctions/createRoom/index.js
   - 生成唯一6位房间号
   - 创建房间记录
   - 返回房间信息
2. cloudfunctions/joinRoom/index.js
   - 验证房间存在且未满
   - 加入房间
   - 返回房间数据
3. cloudfunctions/leaveRoom/index.js
   - 移除玩家
   - 空房间自动删除
每个云函数包含index.js、config.json、package.json，完整代码。
```

### 提示词 5.3 - 云函数：游戏数据与实时同步
```
开发游戏数据云函数与实时同步：
1. cloudfunctions/saveGameResult/index.js
   - 保存战绩到records
   - 更新users统计
   - 更新ranks排行榜
2. js/managers/NetworkManager.js - 网络管理器
   - 封装房间数据watch监听
   - 封装游戏操作上传（更新gameState）
   - 断线重连、心跳检测
3. 在GameScene集成实时同步：
   - 己方翻牌→上传
   - 监听对手操作→同步显示
   - 节流优化（避免频繁更新）
完整代码。
```

---

## 阶段六：用户与社交（2条）

### 提示词 6.1 - 用户登录与信息
```
实现微信用户系统：
1. js/managers/UserManager.js（单例）
   - wx.login()获取openid
   - wx.getUserInfo()获取昵称、头像
   - 用户不存在则创建到users集合
   - 缓存到本地存储
2. 授权引导界面（用户拒绝时显示）
3. MenuScene显示用户信息
完整代码。
```

### 提示词 6.2 - 分享与排行榜
```
实现分享和排行榜：
1. js/managers/ShareManager.js
   - wx.shareAppMessage封装
   - 分享类型：邀请进房（携带roomCode）、分享战绩
   - Canvas绘制分享图
2. game.js监听wx.onShow解析分享参数
3. js/scenes/RankScene.js - 排行榜场景
   - 查询云数据库ranks（按胜率/胜场排序）
   - 滚动列表显示前50名
   - 高亮当前用户
   - 切换榜单类型
完整代码。
```

---

## 阶段七：美化与音效（2条）

### 提示词 7.1 - 粒子与UI组件
```
开发粒子效果和UI组件：
1. js/engine/ParticleSystem.js - 粒子系统
   - 粒子类（位置、速度、生命、颜色）
   - 发射器（发射率、范围）
   - 效果：星星爆炸、金币掉落、背景光点
2. js/ui/Dialog.js - 对话框组件
   - 模态框、确认框、输入框
   - 弹出动画
3. js/ui/Toast.js - 提示组件
完整代码。
```

### 提示词 7.2 - 音效系统
```
开发音频管理器：
1. js/managers/AudioManager.js（单例）
   - 预加载音效：flip.mp3、match.mp3、fail.mp3、click.mp3、victory.mp3、defeat.mp3
   - 背景音乐：bgm.mp3（循环）
   - 封装play方法（支持音效/音乐开关）
   - 使用wx.createInnerAudioContext
2. 在各场景关键点调用音效
3. 设置中的音效开关（存本地）
音频路径：/assets/audio/，完整代码。
```

---

## 阶段八：工具与优化（2条）

### 提示词 8.1 - 工具函数库
```
开发工具函数：
1. js/utils/helpers.js
   - 生成6位随机房间号
   - Fisher-Yates洗牌算法
   - 深拷贝、防抖、节流
   - 时间格式化（秒→分:秒）
   - 随机数、距离计算
2. js/utils/storage.js - 本地存储封装
   - 存储用户设置、登录信息
完整代码，每个函数带注释。
```

### 提示词 8.2 - 性能优化与适配
```
性能优化与设备适配：
1. 性能优化：
   - 离屏Canvas预渲染
   - 对象池复用粒子
   - requestAnimationFrame优化循环
   - 图片压缩、懒加载
   - 节流高频操作
2. js/utils/Adapter.js - 适配工具
   - 获取设备信息wx.getSystemInfoSync
   - 计算Canvas缩放比例
   - 适配不同屏幕比例、刘海屏
   - 安全区域
3. 所有场景应用适配后的坐标
完整代码。
```

---

## 阶段九：测试与发布（2条）

### 提示词 9.1 - 测试清单与临时资源
```
生成测试清单和临时资源：
1. 功能测试：登录、房间、游戏逻辑、同步、分享、排行榜
2. 异常测试：断网、对手退出、快速点击、边界条件
3. 兼容性测试：不同设备、屏幕、微信版本
4. 性能测试：启动速度、流畅度、内存
5. 创建临时测试资源：
   - 用纯色Canvas绘制18种不同颜色的卡片图（替代真实图片）
   - 简单的按钮图形
   - 说明如何后期替换为真实PNG图片
生成test-plan.md和临时资源生成代码。
```

### 提示词 9.2 - 发布准备文档
```
准备上线材料：
1. 小游戏信息：
   - 名称：翻翻对决
   - 简介（突出双人对战、记忆挑战）
   - 类目：休闲益智
2. 视觉素材要求：
   - 图标1024x1024
   - 5张功能截图
3. 真实卡片图片说明：
   - 需要18种不同图案（建议：动物、水果、表情等主题）
   - 尺寸：256x256 PNG
   - 命名：card-1.png ~ card-18.png
   - 放置路径：/assets/images/cards/
   - 替换后无需修改代码
4. 代码检查：移除console.log、检查云环境ID、域名配置
5. 审核注意事项
6. 版本号：1.0.0
生成release-guide.md。
```

---

## 📋 提示词总结

**共 28 条提示词**，涵盖：

- ✅ 难度选择：4x4初级、5x5中级、6x6高级
- ✅ 卡片图片：18种PNG图片，路径统一，支持后期替换
- ✅ 完整的Canvas游戏架构
- ✅ 微信云开发实时对战
- ✅ 用户系统、分享、排行榜
- ✅ 粒子效果、音效系统
- ✅ 性能优化、设备适配
- ✅ 测试与发布准备

---

## 🎯 使用方式

从**提示词 1.1**开始，按顺序逐条输入即可完成整个项目开发！

每条提示词都经过优化，确保：
- 目标明确，步骤清晰
- 代码规范，注释完整
- 支持后期维护和扩展
- 图片资源可灵活替换
