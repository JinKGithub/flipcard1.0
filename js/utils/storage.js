import { DEFAULT_SETTINGS, STORAGE_KEYS } from './config.js'

/**
 * Read a value from local storage.
 */
export function getStorage(key, fallback = null) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const value = wx.getStorageSync(key)
      return value === '' || typeof value === 'undefined' ? fallback : value
    }

    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key)
      return raw === null ? fallback : JSON.parse(raw)
    }
  } catch (error) {}

  return fallback
}

/**
 * Write a value to local storage.
 */
export function setStorage(key, value) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(key, value)
      return true
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    }
  } catch (error) {}

  return false
}

/**
 * Remove one value from local storage.
 */
export function removeStorage(key) {
  try {
    if (typeof wx !== 'undefined' && wx.removeStorageSync) {
      wx.removeStorageSync(key)
      return true
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key)
      return true
    }
  } catch (error) {}

  return false
}

/**
 * Clear all local storage values.
 */
export function clearStorage() {
  try {
    if (typeof wx !== 'undefined' && wx.clearStorageSync) {
      wx.clearStorageSync()
      return true
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
      return true
    }
  } catch (error) {}

  return false
}

/**
 * Read user settings and merge them with defaults.
 */
export function getSettings() {
  const settings = getStorage(STORAGE_KEYS.SETTINGS, {})
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {})
  }
}

/**
 * Save the full user settings object.
 */
export function setSettings(settings = {}) {
  return setStorage(STORAGE_KEYS.SETTINGS, {
    ...DEFAULT_SETTINGS,
    ...settings
  })
}

/**
 * Update part of the settings object.
 */
export function updateSettings(partial = {}) {
  const nextSettings = {
    ...getSettings(),
    ...partial
  }
  setSettings(nextSettings)
  return nextSettings
}

/**
 * Read cached login/user information.
 */
export function getUserInfo() {
  return getStorage(STORAGE_KEYS.USER_INFO, null)
}

/**
 * Save cached login/user information.
 */
export function setUserInfo(userInfo) {
  return setStorage(STORAGE_KEYS.USER_INFO, userInfo)
}

/**
 * Clear cached login/user information.
 */
export function removeUserInfo() {
  return removeStorage(STORAGE_KEYS.USER_INFO)
}

/**
 * Read the last room code used by the player.
 */
export function getLastRoomCode() {
  return getStorage(STORAGE_KEYS.LAST_ROOM_CODE, '')
}

/**
 * Save the last room code used by the player.
 */
export function setLastRoomCode(roomCode) {
  return setStorage(STORAGE_KEYS.LAST_ROOM_CODE, String(roomCode || ''))
}

class Storage {
  static get(key, fallback = null) {
    return getStorage(key, fallback)
  }

  static set(key, value) {
    return setStorage(key, value)
  }

  static remove(key) {
    return removeStorage(key)
  }

  static clear() {
    return clearStorage()
  }

  static getSettings() {
    return getSettings()
  }

  static setSettings(settings) {
    return setSettings(settings)
  }

  static updateSettings(partial) {
    return updateSettings(partial)
  }

  static getUserInfo() {
    return getUserInfo()
  }

  static setUserInfo(userInfo) {
    return setUserInfo(userInfo)
  }

  static removeUserInfo() {
    return removeUserInfo()
  }

  static getLastRoomCode() {
    return getLastRoomCode()
  }

  static setLastRoomCode(roomCode) {
    return setLastRoomCode(roomCode)
  }
}

export default Storage
