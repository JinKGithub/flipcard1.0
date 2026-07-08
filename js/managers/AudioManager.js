import ResourceLoader from '../utils/ResourceLoader.js'
import { AUDIO, DEFAULT_SETTINGS, STORAGE_KEYS } from '../utils/config.js'

const EFFECT_KEYS = ['FLIP', 'MATCH', 'FAIL', 'CLICK', 'VICTORY', 'DEFEAT']
const BGM_ENABLED = false

class AudioManager {
  static instance = null

  static getInstance() {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager()
    }
    return AudioManager.instance
  }

  constructor() {
    if (AudioManager.instance) return AudioManager.instance

    this.loader = new ResourceLoader()
    this.settings = { ...DEFAULT_SETTINGS }
    this.effects = new Map()
    this.bgm = null
    this.preloaded = false
    this.loadingPromise = null
    this.bgmPlaying = false
    this.bgmEnabled = BGM_ENABLED

    this.loadSettings()
    AudioManager.instance = this
  }

  async preload() {
    if (this.preloaded) return this
    if (this.loadingPromise) return this.loadingPromise

    this.loadingPromise = Promise.all([
      ...EFFECT_KEYS.map((key) => this.ensureEffect(key))
    ]).then(() => {
      this.preloaded = true
      return this
    }).catch(() => {
      this.preloaded = true
      return this
    })

    return this.loadingPromise
  }

  play(name, options = {}) {
    if (!this.settings.soundEnabled && !options.force) return null

    const key = String(name || '').toUpperCase()
    if (!AUDIO[key] || key === 'BGM') return null

    const audio = this.effects.get(key) || this.createEffect(key)
    if (!audio) return null

    this.safeStop(audio)
    this.safeSeekStart(audio)
    audio.volume = this.clampVolume(options.volume ?? this.settings.soundVolume)
    this.safePlay(audio)
    return audio
  }

  playBgm(options = {}) {
    return this.playMusic(options)
  }

  playMusic(options = {}) {
    if (!this.bgmEnabled) return null
    if (!this.settings.musicEnabled && !options.force) return null

    const audio = this.bgm || this.createBgm()
    if (!audio) return null

    audio.loop = true
    audio.volume = this.clampVolume(options.volume ?? this.settings.musicVolume)
    this.safePlay(audio)
    this.bgmPlaying = true
    return audio
  }

  pauseBgm() {
    if (this.bgm && typeof this.bgm.pause === 'function') {
      this.bgm.pause()
    }
    this.bgmPlaying = false
  }

  resumeBgm() {
    if (this.settings.musicEnabled && this.bgm) {
      this.safePlay(this.bgm)
      this.bgmPlaying = true
    }
  }

  stopBgm() {
    if (this.bgm) {
      this.safeStop(this.bgm)
    }
    this.bgmPlaying = false
  }

  stopAllEffects() {
    this.effects.forEach((audio) => this.safeStop(audio))
  }

  stopAll() {
    this.stopAllEffects()
    this.stopBgm()
  }

  setSoundEnabled(enabled) {
    this.settings.soundEnabled = Boolean(enabled)
    if (!this.settings.soundEnabled) this.stopAllEffects()
    this.saveSettings()
    return this.settings.soundEnabled
  }

  setMusicEnabled(enabled) {
    this.settings.musicEnabled = Boolean(enabled)
    if (this.settings.musicEnabled) this.playMusic()
    else this.stopBgm()
    this.saveSettings()
    return this.settings.musicEnabled
  }

  toggleSound() {
    return this.setSoundEnabled(!this.settings.soundEnabled)
  }

  toggleMusic() {
    return this.setMusicEnabled(!this.settings.musicEnabled)
  }

  setSoundVolume(volume) {
    this.settings.soundVolume = this.clampVolume(volume)
    this.saveSettings()
    return this.settings.soundVolume
  }

  setMusicVolume(volume) {
    this.settings.musicVolume = this.clampVolume(volume)
    if (this.bgm) this.bgm.volume = this.settings.musicVolume
    this.saveSettings()
    return this.settings.musicVolume
  }

  getSettings() {
    return { ...this.settings }
  }

  async ensureEffect(key) {
    if (this.effects.has(key)) return this.effects.get(key)

    try {
      const audio = await this.loader.loadAudio(AUDIO[key])
      audio.volume = this.settings.soundVolume
      this.effects.set(key, audio)
      return audio
    } catch (error) {
      return this.createEffect(key)
    }
  }

  async ensureBgm() {
    if (!this.bgmEnabled) return null
    if (this.bgm) return this.bgm

    try {
      const audio = await this.loader.loadAudio(AUDIO.BGM)
      audio.loop = true
      audio.volume = this.settings.musicVolume
      this.bgm = audio
      return audio
    } catch (error) {
      return this.createBgm()
    }
  }

  createEffect(key) {
    const url = AUDIO[key]
    if (!url || typeof wx === 'undefined' || !wx.createInnerAudioContext) return null

    const audio = wx.createInnerAudioContext()
    audio.src = url
    audio.obeyMuteSwitch = true
    audio.volume = this.settings.soundVolume
    this.effects.set(key, audio)
    return audio
  }

  createBgm() {
    if (!this.bgmEnabled) return null
    if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return null

    const audio = wx.createInnerAudioContext()
    audio.src = AUDIO.BGM
    audio.loop = true
    audio.obeyMuteSwitch = true
    audio.volume = this.settings.musicVolume
    this.bgm = audio
    return audio
  }

  loadSettings() {
    try {
      if (typeof wx === 'undefined' || !wx.getStorageSync) return
      const cached = wx.getStorageSync(STORAGE_KEYS.SETTINGS)
      if (cached) {
        this.settings = {
          ...this.settings,
          ...cached
        }
      }
    } catch (error) {}
  }

  saveSettings() {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(STORAGE_KEYS.SETTINGS, this.settings)
      }
    } catch (error) {}
  }

  safePlay(audio) {
    try {
      audio.play()
    } catch (error) {}
  }

  safeStop(audio) {
    try {
      if (audio && typeof audio.stop === 'function') audio.stop()
    } catch (error) {}
  }

  safeSeekStart(audio) {
    try {
      if (audio && typeof audio.seek === 'function') audio.seek(0)
    } catch (error) {}
  }

  clampVolume(volume) {
    const value = Number(volume)
    if (Number.isNaN(value)) return 1
    return Math.max(0, Math.min(1, value))
  }
}

export default AudioManager
