class CloudDB {
  static instance = null

  static getInstance() {
    if (!CloudDB.instance) {
      CloudDB.instance = new CloudDB()
    }
    return CloudDB.instance
  }

  constructor() {
    if (CloudDB.instance) return CloudDB.instance

    this.db = null
    this.watchers = new Map()
    this.init()
    CloudDB.instance = this
  }

  init() {
    if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.database) {
      this.db = wx.cloud.database()
    }
  }

  collection(name) {
    if (!this.db) this.init()
    if (!this.db) return null
    return this.db.collection(name)
  }

  async add(collectionName, data) {
    const collection = this.collection(collectionName)
    if (!collection) return null

    return collection.add({
      data: {
        ...data,
        createTime: data.createTime || Date.now(),
        updateTime: Date.now()
      }
    })
  }

  async update(collectionName, docId, data) {
    const collection = this.collection(collectionName)
    if (!collection) return null

    return collection.doc(docId).update({
      data: {
        ...data,
        updateTime: Date.now()
      }
    })
  }

  async get(collectionName, docId) {
    const collection = this.collection(collectionName)
    if (!collection) return null

    const result = await collection.doc(docId).get()
    return result.data
  }

  async query(collectionName, where = {}, options = {}) {
    let collection = this.collection(collectionName)
    if (!collection) return []

    collection = collection.where(where)

    if (options.orderBy) {
      collection = collection.orderBy(options.orderBy.field, options.orderBy.direction || 'asc')
    }

    if (options.limit) {
      collection = collection.limit(options.limit)
    }

    const result = await collection.get()
    return result.data || []
  }

  async updateRoom(roomId, data) {
    return this.update('rooms', roomId, data)
  }

  async callFunction(name, data = {}) {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
      return null
    }

    return wx.cloud.callFunction({
      name,
      data
    })
  }

  watch(collectionName, options = {}, onChange, onError = null) {
    const collection = this.collection(collectionName)
    if (!collection || !collection.watch) return null

    const key = options.key || `${collectionName}:query:${Date.now()}`
    this.closeWatcher(key)

    let query = collection
    if (options.where) query = query.where(options.where)

    const watcher = query.watch({
      onChange: (snapshot) => {
        if (onChange) onChange(snapshot.docs || [], snapshot)
      },
      onError: (error) => {
        if (onError) onError(error)
      }
    })

    this.watchers.set(key, watcher)
    return watcher
  }

  watchDoc(collectionName, docId, onChange, onError = null) {
    const collection = this.collection(collectionName)
    if (!collection || !docId || !collection.doc(docId).watch) {
      return null
    }

    this.closeWatcher(`${collectionName}:${docId}`)

    let watcher = null
    try {
      watcher = collection.doc(docId).watch({
      onChange: (snapshot) => {
        const doc = snapshot.docs && snapshot.docs[0]
        if (doc && onChange) onChange(doc, snapshot)
      },
      onError: (error) => {
        if (this.isClosedWatchError(error)) return
        if (onError) onError(error)
      }
      })
    } catch (error) {
      if (onError && !this.isClosedWatchError(error)) onError(error)
      return null
    }

    this.watchers.set(`${collectionName}:${docId}`, watcher)
    return watcher
  }

  watchRoom(roomId, onChange, onError = null) {
    return this.watchDoc('rooms', roomId, onChange, onError)
  }

  closeWatcher(key) {
    const watcher = this.watchers.get(key)
    if (watcher && typeof watcher.close === 'function') {
      setTimeout(() => {
        try {
          watcher.close()
        } catch (error) {}
      }, 200)
    }
    this.watchers.delete(key)
  }

  closeAllWatchers() {
    this.watchers.forEach((watcher) => {
      if (watcher && typeof watcher.close === 'function') {
        try {
          watcher.close()
        } catch (error) {}
      }
    })
    this.watchers.clear()
  }

  isClosedWatchError(error) {
    const message = error && (error.message || error.errMsg || String(error))
    return typeof message === 'string' && message.indexOf('CLOSED') !== -1
  }
}

export default CloudDB
