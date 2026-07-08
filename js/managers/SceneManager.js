class SceneManager {
  static instance = null

  static getInstance() {
    if (!SceneManager.instance) {
      SceneManager.instance = new SceneManager()
    }
    return SceneManager.instance
  }

  constructor() {
    if (SceneManager.instance) {
      return SceneManager.instance
    }

    this.scenes = new Map()
    this.currentScene = null
    this.currentSceneKey = ''
    this.nextSceneKey = ''
    this.switching = false

    SceneManager.instance = this
  }

  register(key, scene) {
    if (!key || !scene) {
      throw new Error('SceneManager.register requires key and scene.')
    }

    this.scenes.set(key, scene)
  }

  unregister(key) {
    if (this.currentSceneKey === key) {
      this.currentScene = null
      this.currentSceneKey = ''
    }

    this.scenes.delete(key)
  }

  switchTo(key, params = {}) {
    const nextScene = this.scenes.get(key)

    if (!nextScene) {
      throw new Error(`Scene "${key}" has not been registered.`)
    }

    if (this.currentScene && typeof this.currentScene.exit === 'function') {
      this.currentScene.exit()
    }

    this.currentScene = nextScene
    this.currentSceneKey = key

    if (typeof this.currentScene.enter === 'function') {
      this.currentScene.enter(params)
    }
  }

  update(deltaTime) {
    if (this.currentScene && typeof this.currentScene.update === 'function') {
      this.currentScene.update(deltaTime)
    }
  }

  render(ctx) {
    if (this.currentScene && typeof this.currentScene.render === 'function') {
      this.currentScene.render(ctx)
    }
  }

  handleShow(options) {
    if (this.currentScene && typeof this.currentScene.handleShow === 'function') {
      this.currentScene.handleShow(options)
    }
  }

  handleHide() {
    if (this.currentScene && typeof this.currentScene.handleHide === 'function') {
      this.currentScene.handleHide()
    }
  }

  handleResize(screen) {
    if (!this.currentScene) return

    if (typeof this.currentScene.handleResize === 'function') {
      this.currentScene.handleResize(screen)
      return
    }

    if (typeof this.currentScene.createLayout === 'function') {
      this.currentScene.createLayout(screen)
      if (typeof this.currentScene.registerInputs === 'function') {
        this.currentScene.registerInputs()
      }
    }
  }

  getCurrentScene() {
    return this.currentScene
  }

  getCurrentSceneKey() {
    return this.currentSceneKey
  }
}

export default SceneManager
