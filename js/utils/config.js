export const CLOUD_ENV_ID = 'cloud1-d6g9k3wjr8cb10ec3'

export const GAME_NAME = '翻翻对决'

export const SCENE_KEYS = {
  LOADING: 'loading',
  MENU: 'menu',
  ROOM: 'room',
  GAME: 'game',
  RESULT: 'result',
  RANK: 'rank'
}

export const ROOM_STATUS = {
  WAITING: 'waiting',
  READY: 'ready',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  ENDED: 'ended'
}

export const CARD_STATE = {
  HIDDEN: 'hidden',
  REVEALED: 'revealed',
  MATCHED: 'matched'
}

export const PLAYER_ROLE = {
  HOST: 'host',
  GUEST: 'guest'
}

export const DIFFICULTY = {
  EASY: {
    key: 'EASY',
    name: '初级',
    rows: 4,
    cols: 4,
    totalCards: 16,
    pairCount: 8,
    estimatedTime: '2-3分钟'
  },
  MEDIUM: {
    key: 'MEDIUM',
    name: '中级',
    rows: 6,
    cols: 4,
    totalCards: 24,
    pairCount: 12,
    estimatedTime: '4-5分钟'
  },
  HARD: {
    key: 'HARD',
    name: '高级',
    rows: 6,
    cols: 6,
    totalCards: 36,
    pairCount: 18,
    estimatedTime: '6-8分钟'
  }
}

export const TURN_SECONDS = 15
export const MATCH_FAIL_DELAY = 1000
export const ROOM_CODE_LENGTH = 6
export const ROOM_EXPIRE_MINUTES = 30

export const ASSET_BASE = 'assets/'
export const CARD_ASSET_BASE = `${ASSET_BASE}images/cards/`
export const UI_ASSET_BASE = `${ASSET_BASE}images/ui/`
export const SHARE_ASSET_BASE = `${ASSET_BASE}images/share/`
export const AUDIO_ASSET_BASE = '/assets/audio/'

export const CARD_BACK_IMAGE = `${CARD_ASSET_BASE}back.png`

export const CARD_IMAGES = Array.from({ length: 18 }, (_, index) => {
  return `${CARD_ASSET_BASE}card-${index + 1}.png`
})

export const UI_IMAGES = {
  LOGO: `${UI_ASSET_BASE}home/logo-clean.png`,
  DEFAULT_AVATAR: `${UI_ASSET_BASE}default-avatar.png`
}

export const HOME_IMAGES = {
  LOGO: `${UI_ASSET_BASE}home/logo-clean.png`,
  AVATAR_PLACEHOLDER: `${UI_ASSET_BASE}home/avatar_placeholder.png`,
  ICON_CREATE: `${UI_ASSET_BASE}home/icon_create.png`,
  ICON_JOIN: `${UI_ASSET_BASE}home/icon_join.png`,
  ICON_PRACTICE: `${UI_ASSET_BASE}home/icon_practice.png`,
  MEDAL_1: `${UI_ASSET_BASE}home/medal_1.png`,
  MEDAL_2: `${UI_ASSET_BASE}home/medal_2.png`,
  MEDAL_3: `${UI_ASSET_BASE}home/medal_3.png`
}

export const SHARE_IMAGES = {
  INVITE: `${SHARE_ASSET_BASE}share-invite.jpg`,
  VICTORY: `${SHARE_ASSET_BASE}share-victory.jpg`,
  CHALLENGE: `${SHARE_ASSET_BASE}share-challenge.jpg`,
  RESULT_BG: `${SHARE_ASSET_BASE}share-victory.jpg`
}

// Fill these after the three share images pass WeChat's material review.
// When imageUrlId and imageUrl are both present, ShareManager will use them.
export const SHARE_MATERIALS = {
  INVITE: {
    imageUrlId: 'aWaJLQ7HT6CnDZl/ZCFSlw==',
    imageUrl: 'https://mmocgame.qpic.cn/wechatgame/Dibq2tGAktGKm1IRSkp3fxw8LfbfavqJ1ialPdWtvraG97EbvIKpgU656fJcgRFFJK/0'
  },
  VICTORY: {
    imageUrlId: '+QKdqS1iRTSlLU3n7TMS5Q==',
    imageUrl: 'https://mmocgame.qpic.cn/wechatgame/OydLib3sqw6ekrA1zGWichuEkicC2bEXUCicXDFbHDZBtsic5CKEY32FvjRBult8aEI9C/0'
  },
  CHALLENGE: {
    imageUrlId: 'BshLfqo5TeSz2ds1VRHSAA==',
    imageUrl: 'https://mmocgame.qpic.cn/wechatgame/EH7JAx0Kff8FxNzpbZIF98MxkfklXu3YgPR2goJql6Pia4piado6LYskvl2OF8kBRT/0'
  }
}

export const AUDIO = {
  FLIP: `${AUDIO_ASSET_BASE}flip.mp3`,
  MATCH: `${AUDIO_ASSET_BASE}match.mp3`,
  FAIL: `${AUDIO_ASSET_BASE}fail.mp3`,
  CLICK: `${AUDIO_ASSET_BASE}click.mp3`,
  VICTORY: `${AUDIO_ASSET_BASE}victory.mp3`,
  DEFEAT: `${AUDIO_ASSET_BASE}defeat.mp3`,
  BGM: `${AUDIO_ASSET_BASE}bgm.mp3`
}

export const COLORS = {
  PRIMARY: '#667EEA',
  PRIMARY_DARK: '#4F46E5',
  SECONDARY: '#764BA2',
  ACCENT: '#FBBF24',
  SUCCESS: '#22C55E',
  WARNING: '#F97316',
  DANGER: '#EF4444',
  BG_TOP: '#111827',
  BG_BOTTOM: '#312E81',
  PANEL: 'rgba(255, 255, 255, 0.14)',
  PANEL_STRONG: 'rgba(255, 255, 255, 0.22)',
  TEXT_PRIMARY: '#FFFFFF',
  TEXT_SECONDARY: 'rgba(255, 255, 255, 0.78)',
  TEXT_MUTED: 'rgba(255, 255, 255, 0.56)',
  CARD_BACK: '#4338CA',
  CARD_FACE: '#FFFFFF',
  SHADOW: 'rgba(0, 0, 0, 0.25)'
}

export const FONTS = {
  FAMILY: 'PingFang SC, Microsoft YaHei, sans-serif',
  TITLE: 'bold 36px PingFang SC, Microsoft YaHei, sans-serif',
  SUBTITLE: 'bold 24px PingFang SC, Microsoft YaHei, sans-serif',
  BODY: '20px PingFang SC, Microsoft YaHei, sans-serif',
  SMALL: '16px PingFang SC, Microsoft YaHei, sans-serif',
  BUTTON: 'bold 20px PingFang SC, Microsoft YaHei, sans-serif',
  ROOM_CODE: 'bold 40px PingFang SC, Microsoft YaHei, sans-serif'
}

export const LAYOUT = {
  PAGE_PADDING: 24,
  PAGE_PADDING_SMALL: 16,
  HEADER_HEIGHT: 96,
  FOOTER_HEIGHT: 88,
  BUTTON_WIDTH: 280,
  BUTTON_HEIGHT: 52,
  BUTTON_RADIUS: 10,
  PANEL_RADIUS: 12,
  CARD_RADIUS: 8,
  MIN_TOUCH_SIZE: 44,
  GRID_GAP: {
    EASY: 10,
    MEDIUM: 7,
    HARD: 5
  }
}

export const STORAGE_KEYS = {
  USER_INFO: 'flip_battle_user_info',
  SETTINGS: 'flip_battle_settings',
  LAST_ROOM_CODE: 'flip_battle_last_room_code'
}

export const DEFAULT_SETTINGS = {
  musicEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  musicVolume: 0.4,
  soundVolume: 0.75
}
