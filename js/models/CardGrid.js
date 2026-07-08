import Card from './Card.js'
import { CARD_BACK_IMAGE, CARD_IMAGES, CARD_STATE, DIFFICULTY, LAYOUT } from '../utils/config.js'

class CardGrid {
  constructor(options = {}) {
    this.cards = []
    this.difficulty = options.difficulty || 'EASY'
    this.layout = {
      startX: 0,
      startY: 0,
      cardWidth: 0,
      cardHeight: 0,
      gap: 0,
      gridWidth: 0,
      gridHeight: 0
    }

    this.frontTextures = options.frontTextures || {}
    this.backTexture = options.backTexture || null

    if (options.autoGenerate) {
      this.generate(this.difficulty)
    }
  }

  generate(difficulty = this.difficulty, options = {}) {
    const difficultyConfig = this.resolveDifficulty(difficulty)
    const selectedImages = this.pickCardImages(difficultyConfig.pairCount, options.seed)
    const cards = []

    selectedImages.forEach((imageUrl, index) => {
      const pairId = `pair_${index + 1}`

      cards.push(this.createCard({
        id: `card_${index + 1}_a`,
        pairId,
        imageUrl
      }))

      cards.push(this.createCard({
        id: `card_${index + 1}_b`,
        pairId,
        imageUrl
      }))
    })

    this.cards = this.shuffle(cards, options.seed)
    this.difficulty = difficultyConfig.key
    this.assignPositions(difficultyConfig)

    return this.cards
  }

  load(cards = [], difficulty = this.difficulty) {
    this.difficulty = this.resolveDifficulty(difficulty).key
    this.cards = cards.map((cardData) => this.createCard({
      id: cardData.id,
      pairId: cardData.pairId,
      imageUrl: cardData.imageUrl || cardData.frontImage,
      state: cardData.state || CARD_STATE.HIDDEN,
      position: cardData.position || { row: 0, col: 0 }
    }))
    return this.cards
  }

  update(deltaTime) {
    this.cards.forEach((card) => card.update(deltaTime))
  }

  render(ctx) {
    this.cards.forEach((card) => card.render(ctx))
  }

  calculateLayout(options = {}) {
    const difficultyConfig = this.resolveDifficulty(this.difficulty)
    const rows = difficultyConfig.rows
    const cols = difficultyConfig.cols

    const width = options.width || 375
    const height = options.height || 667
    const safeTop = options.safeTop || 0
    const safeBottom = options.safeBottom || 0

    const marginX = width <= 360 ? LAYOUT.PAGE_PADDING_SMALL : LAYOUT.PAGE_PADDING
    const headerHeight = options.headerHeight || (LAYOUT.HEADER_HEIGHT + safeTop)
    const footerHeight = options.footerHeight || (LAYOUT.FOOTER_HEIGHT + safeBottom)
    const top = options.top || headerHeight
    const bottom = options.bottom || (height - footerHeight)
    const availableWidth = Math.max(0, (options.availableWidth || width) - marginX * 2)
    const availableHeight = Math.max(0, bottom - top)
    const gap = typeof options.gap === 'number'
      ? options.gap
      : LAYOUT.GRID_GAP[difficultyConfig.key]

    const maxCardWidth = (availableWidth - gap * (cols - 1)) / cols
    const maxCardHeight = (availableHeight - gap * (rows - 1)) / rows
    const ratio = difficultyConfig.key === 'HARD' ? 1.18 : 1.25

    let cardWidth = Math.min(maxCardWidth, maxCardHeight / ratio)
    let cardHeight = cardWidth * ratio

    if (cardWidth < LAYOUT.MIN_TOUCH_SIZE) {
      cardWidth = LAYOUT.MIN_TOUCH_SIZE
      cardHeight = Math.max(LAYOUT.MIN_TOUCH_SIZE, cardWidth * ratio)
    }

    const gridWidth = cardWidth * cols + gap * (cols - 1)
    const gridHeight = cardHeight * rows + gap * (rows - 1)

    this.layout = {
      startX: Math.round((width - gridWidth) / 2),
      startY: Math.round(top + (availableHeight - gridHeight) / 2),
      cardWidth,
      cardHeight,
      gap,
      gridWidth,
      gridHeight
    }

    this.applyLayout()
    return this.layout
  }

  hitTest(x, y) {
    for (let index = this.cards.length - 1; index >= 0; index -= 1) {
      const card = this.cards[index]
      if (card.hitTest(x, y)) {
        return card
      }
    }

    return null
  }

  getCardById(cardId) {
    return this.cards.find((card) => card.id === cardId) || null
  }

  getFlippedCards() {
    return this.cards.filter((card) => card.state === CARD_STATE.REVEALED)
  }

  getMatchedCards() {
    return this.cards.filter((card) => card.state === CARD_STATE.MATCHED)
  }

  getMatchedCount() {
    return this.getMatchedCards().length / 2
  }

  isComplete() {
    return this.cards.length > 0 && this.cards.every((card) => card.state === CARD_STATE.MATCHED)
  }

  reset() {
    this.cards.forEach((card) => {
      card.state = CARD_STATE.HIDDEN
      card.locked = false
      card.flipProgress = 0
      card.setScale(1)
      card.rotation = 0
    })
  }

  toJSON() {
    return this.cards.map((card) => card.toJSON())
  }

  setTextures(frontTextures = {}, backTexture = null) {
    this.frontTextures = frontTextures
    this.backTexture = backTexture || this.backTexture

    this.cards.forEach((card) => {
      card.setTextures(this.frontTextures[card.frontImage], this.backTexture)
    })
  }

  createCard(options) {
    return new Card({
      id: options.id,
      pairId: options.pairId,
      frontImage: options.imageUrl,
      backImage: CARD_BACK_IMAGE,
      state: options.state || CARD_STATE.HIDDEN,
      position: options.position || { row: 0, col: 0 },
      frontTexture: this.frontTextures[options.imageUrl] || null,
      backTexture: this.backTexture
    })
  }

  assignPositions(difficultyConfig) {
    this.cards.forEach((card, index) => {
      card.setGridPosition(
        Math.floor(index / difficultyConfig.cols),
        index % difficultyConfig.cols
      )
    })
  }

  applyLayout() {
    const { startX, startY, cardWidth, cardHeight, gap } = this.layout

    this.cards.forEach((card) => {
      const x = startX + card.position.col * (cardWidth + gap)
      const y = startY + card.position.row * (cardHeight + gap)
      card.setPosition(x, y)
      card.setSize(cardWidth, cardHeight)
    })
  }

  pickCardImages(count, seed = null) {
    const source = CARD_IMAGES.slice()
    const shuffled = this.shuffle(source, seed)
    return shuffled.slice(0, count)
  }

  shuffle(items, seed = null) {
    const result = items.slice()
    const random = seed === null || typeof seed === 'undefined'
      ? Math.random
      : this.createSeededRandom(seed)

    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(random() * (index + 1))
      const temp = result[index]
      result[index] = result[randomIndex]
      result[randomIndex] = temp
    }

    return result
  }

  createSeededRandom(seed) {
    let value = Number(seed) || 1

    return function random() {
      value = (value * 9301 + 49297) % 233280
      return value / 233280
    }
  }

  resolveDifficulty(difficulty) {
    if (typeof difficulty === 'string') {
      const key = difficulty.toUpperCase()
      if (DIFFICULTY[key]) return DIFFICULTY[key]
    }

    if (difficulty && difficulty.rows && difficulty.cols) {
      return difficulty
    }

    return DIFFICULTY.EASY
  }
}

export default CardGrid
