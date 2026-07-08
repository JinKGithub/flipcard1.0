class ResourceLoader {
  static imageCache = new Map()
  static audioCache = new Map()

  constructor(options = {}) {
    this.imageCache = options.imageCache || ResourceLoader.imageCache
    this.audioCache = options.audioCache || ResourceLoader.audioCache
    this.total = 0
    this.loaded = 0
    this.failed = 0
    this.progress = 0
    this.lazyQueue = new Map()
  }

  reset(total = 0) {
    this.total = total
    this.loaded = 0
    this.failed = 0
    this.progress = total === 0 ? 100 : 0
  }

  async loadImages(urls = [], onProgress = null) {
    const uniqueUrls = this.unique(urls)
    this.reset(uniqueUrls.length)

    const results = await Promise.all(uniqueUrls.map((url) => {
      return this.loadImage(url)
        .then((image) => {
          this.markLoaded(onProgress)
          return { url, resource: image, success: true }
        })
        .catch((error) => {
          this.markFailed(onProgress)
          return { url, error, success: false }
        })
    }))

    return {
      progress: this.progress,
      loaded: this.loaded,
      failed: this.failed,
      total: this.total,
      results
    }
  }

  async loadAudios(urls = [], onProgress = null) {
    const uniqueUrls = this.unique(urls)
    this.reset(uniqueUrls.length)

    const results = await Promise.all(uniqueUrls.map((url) => {
      return this.loadAudio(url)
        .then((audio) => {
          this.markLoaded(onProgress)
          return { url, resource: audio, success: true }
        })
        .catch((error) => {
          this.markFailed(onProgress)
          return { url, error, success: false }
        })
    }))

    return {
      progress: this.progress,
      loaded: this.loaded,
      failed: this.failed,
      total: this.total,
      results
    }
  }

  async loadAll({ images = [], audios = [] } = {}, onProgress = null) {
    const imageUrls = this.unique(images)
    const audioUrls = this.unique(audios)
    const total = imageUrls.length + audioUrls.length

    this.reset(total)

    const updateProgress = () => {
      if (onProgress) {
        onProgress(this.progress, {
          loaded: this.loaded,
          failed: this.failed,
          total: this.total
        })
      }
    }

    const imageTasks = imageUrls.map((url) => {
      return this.loadImage(url)
        .then((image) => {
          this.markLoaded(updateProgress)
          return { type: 'image', url, resource: image, success: true }
        })
        .catch((error) => {
          this.markFailed(updateProgress)
          return { type: 'image', url, error, success: false }
        })
    })

    const audioTasks = audioUrls.map((url) => {
      return this.loadAudio(url)
        .then((audio) => {
          this.markLoaded(updateProgress)
          return { type: 'audio', url, resource: audio, success: true }
        })
        .catch((error) => {
          this.markFailed(updateProgress)
          return { type: 'audio', url, error, success: false }
        })
    })

    const results = await Promise.all([...imageTasks, ...audioTasks])

    return {
      progress: this.progress,
      loaded: this.loaded,
      failed: this.failed,
      total: this.total,
      results
    }
  }

  loadImage(url) {
    if (!url) return Promise.reject(new Error('Image url is empty.'))
    if (this.imageCache.has(url)) return Promise.resolve(this.imageCache.get(url))

    return new Promise((resolve, reject) => {
      const image = this.createImage()

      image.onload = () => {
        this.imageCache.set(url, image)
        resolve(image)
      }

      image.onerror = (error) => {
        reject(error || new Error(`Failed to load image: ${url}`))
      }

      image.src = url
    })
  }

  loadImageLazy(url) {
    if (!url) return Promise.reject(new Error('Image url is empty.'))
    if (this.imageCache.has(url)) return Promise.resolve(this.imageCache.get(url))
    if (this.lazyQueue.has(url)) return this.lazyQueue.get(url)

    const task = this.loadImage(url).finally(() => {
      this.lazyQueue.delete(url)
    })
    this.lazyQueue.set(url, task)
    return task
  }

  async loadImagesLazy(urls = [], concurrency = 3) {
    const queue = this.unique(urls)
    const results = []

    while (queue.length) {
      const batch = queue.splice(0, concurrency)
      const batchResults = await Promise.all(batch.map((url) => {
        return this.loadImageLazy(url)
          .then((image) => ({ url, resource: image, success: true }))
          .catch((error) => ({ url, error, success: false }))
      }))
      results.push(...batchResults)
    }

    return results
  }

  loadAudio(url) {
    if (!url) return Promise.reject(new Error('Audio url is empty.'))
    if (this.audioCache.has(url)) return Promise.resolve(this.audioCache.get(url))

    if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
      return Promise.reject(new Error('wx.createInnerAudioContext is unavailable.'))
    }

    return new Promise((resolve, reject) => {
      const audio = wx.createInnerAudioContext()
      let settled = false

      const cleanup = () => {
        audio.offCanplay && audio.offCanplay(onReady)
        audio.offError && audio.offError(onError)
      }

      const onReady = () => {
        if (settled) return
        settled = true
        cleanup()
        this.audioCache.set(url, audio)
        resolve(audio)
      }

      const onError = (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error || new Error(`Failed to load audio: ${url}`))
      }

      audio.onCanplay(onReady)
      audio.onError(onError)
      audio.src = url

      // Some devices do not fire canplay for very short effects until play is called.
      setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        this.audioCache.set(url, audio)
        resolve(audio)
      }, 1200)
    })
  }

  getImage(url) {
    return this.imageCache.get(url) || null
  }

  getAudio(url) {
    return this.audioCache.get(url) || null
  }

  hasImage(url) {
    return this.imageCache.has(url)
  }

  releaseImage(url) {
    this.imageCache.delete(url)
  }

  releaseImages(urls = []) {
    this.unique(urls).forEach((url) => this.releaseImage(url))
  }

  getProgress() {
    return this.progress
  }

  markLoaded(onProgress) {
    this.loaded += 1
    this.updateProgress(onProgress)
  }

  markFailed(onProgress) {
    this.failed += 1
    this.updateProgress(onProgress)
  }

  updateProgress(onProgress) {
    const done = this.loaded + this.failed
    this.progress = this.total === 0 ? 100 : Math.round((done / this.total) * 100)

    if (onProgress) {
      onProgress(this.progress, {
        loaded: this.loaded,
        failed: this.failed,
        total: this.total
      })
    }
  }

  createImage() {
    if (typeof wx !== 'undefined' && wx.createImage) {
      return wx.createImage()
    }

    if (typeof Image !== 'undefined') {
      return new Image()
    }

    throw new Error('No image factory is available.')
  }

  unique(urls) {
    return Array.from(new Set(urls.filter(Boolean)))
  }
}

export default ResourceLoader
