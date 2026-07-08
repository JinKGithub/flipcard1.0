export class Particle {
  constructor(options = {}) {
    this.reset(options)
  }

  reset(options = {}) {
    this.x = options.x || 0
    this.y = options.y || 0
    this.vx = options.vx || 0
    this.vy = options.vy || 0
    this.ax = options.ax || 0
    this.ay = options.ay || 0
    this.life = options.life || 0
    this.maxLife = options.maxLife || 1000
    this.size = options.size || 2
    this.startSize = this.size
    this.endSize = typeof options.endSize === 'number' ? options.endSize : this.size
    this.color = options.color || '#FFFFFF'
    this.alpha = typeof options.alpha === 'number' ? options.alpha : 1
    this.startAlpha = this.alpha
    this.rotation = options.rotation || 0
    this.rotationSpeed = options.rotationSpeed || 0
    this.shape = options.shape || 'circle'
    this.recyclable = options.recyclable !== false
  }

  update(deltaTime) {
    this.life += deltaTime
    this.vx += this.ax * deltaTime
    this.vy += this.ay * deltaTime
    this.x += this.vx * deltaTime
    this.y += this.vy * deltaTime
    this.rotation += this.rotationSpeed * deltaTime

    const progress = Math.min(this.life / this.maxLife, 1)
    this.alpha = this.startAlpha * (1 - progress)
    this.size = this.startSize + (this.endSize - this.startSize) * progress
  }

  render(ctx) {
    if (this.alpha <= 0 || this.size <= 0) return

    ctx.save()
    ctx.globalAlpha = this.alpha
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.fillStyle = this.color

    if (this.shape === 'star') {
      this.drawStar(ctx, this.size)
    } else if (this.shape === 'coin') {
      ctx.beginPath()
      ctx.ellipse(0, 0, this.size * 0.85, this.size, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(0, 0, this.size, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  drawStar(ctx, radius) {
    const spikes = 5
    const innerRadius = radius * 0.45
    let angle = -Math.PI / 2
    const step = Math.PI / spikes

    ctx.beginPath()
    for (let index = 0; index < spikes * 2; index += 1) {
      const r = index % 2 === 0 ? radius : innerRadius
      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      angle += step
    }
    ctx.closePath()
    ctx.fill()
  }

  get dead() {
    return this.life >= this.maxLife
  }
}

export class Emitter {
  constructor(options = {}) {
    this.x = options.x || 0
    this.y = options.y || 0
    this.width = options.width || 0
    this.height = options.height || 0
    this.rate = options.rate || 10
    this.accumulator = 0
    this.active = options.active !== false
    this.factory = options.factory || (() => ({}))
  }

  update(deltaTime, particleSystem) {
    if (!this.active || !particleSystem) return

    this.accumulator += (this.rate * deltaTime) / 1000
    const count = Math.floor(this.accumulator)
    this.accumulator -= count

    for (let index = 0; index < count; index += 1) {
      particleSystem.emit({
        x: this.x + Math.random() * this.width,
        y: this.y + Math.random() * this.height,
        ...this.factory()
      })
    }
  }
}

class ParticleSystem {
  constructor(options = {}) {
    this.particles = []
    this.pool = []
    this.emitters = []
    this.maxParticles = options.maxParticles || 300
  }

  addEmitter(emitter) {
    this.emitters.push(emitter)
    return emitter
  }

  emit(options = {}) {
    if (this.particles.length >= this.maxParticles) return null

    const particle = this.pool.pop() || new Particle()
    particle.reset(options)
    this.particles.push(particle)
    return particle
  }

  createStarExplosion(x, y, count = 28) {
    const colors = ['#FBBF24', '#FDE68A', '#FFFFFF', '#F97316']

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.08 + Math.random() * 0.18
      this.emit({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ay: 0.00008,
        size: 3 + Math.random() * 4,
        endSize: 0,
        color: colors[index % colors.length],
        alpha: 1,
        maxLife: 700 + Math.random() * 500,
        rotationSpeed: (Math.random() - 0.5) * 0.018,
        shape: 'star'
      })
    }
  }

  createCoinDrop(count, width, height = 0) {
    for (let index = 0; index < count; index += 1) {
      this.emit({
        x: Math.random() * width,
        y: height - Math.random() * 180,
        vx: (Math.random() - 0.5) * 0.04,
        vy: 0.08 + Math.random() * 0.08,
        ay: 0.00003,
        size: 4 + Math.random() * 4,
        color: '#FBBF24',
        alpha: 0.95,
        maxLife: 2400 + Math.random() * 1000,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        shape: 'coin'
      })
    }
  }

  createBackgroundLights(count, width, height) {
    this.clear()

    for (let index = 0; index < count; index += 1) {
      this.emit({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.012,
        vy: -(0.008 + Math.random() * 0.018),
        size: 1.5 + Math.random() * 3.5,
        color: index % 3 === 0 ? '#FBBF24' : '#FFFFFF',
        alpha: 0.25 + Math.random() * 0.45,
        life: Math.random() * 4000,
        maxLife: 4000 + Math.random() * 3000,
        shape: 'circle'
      })
    }
  }

  createFloatingLights(count, width, height) {
    this.createBackgroundLights(count, width, height)
  }

  createFireworks(count, width, height) {
    for (let index = 0; index < count; index += 1) {
      this.createStarExplosion(
        width * (0.25 + Math.random() * 0.5),
        height * (0.18 + Math.random() * 0.28),
        28 + Math.floor(Math.random() * 12)
      )
    }
  }

  createCoins(count, width) {
    this.createCoinDrop(count, width, 0)
  }

  update(deltaTime, bounds = null) {
    this.emitters.forEach((emitter) => emitter.update(deltaTime, this))

    const alive = []
    this.particles.forEach((particle) => {
      particle.update(deltaTime)

      if (bounds && particle.vy < 0 && (particle.dead || particle.y < -20)) {
        particle.reset({
          x: Math.random() * bounds.width,
          y: bounds.height + Math.random() * 40,
          vx: (Math.random() - 0.5) * 0.012,
          vy: -(0.008 + Math.random() * 0.018),
          size: 1.5 + Math.random() * 3.5,
          color: Math.random() > 0.65 ? '#FBBF24' : '#FFFFFF',
          alpha: 0.25 + Math.random() * 0.45,
          maxLife: 4000 + Math.random() * 3000
        })
        alive.push(particle)
        return
      }

      if (particle.dead) {
        if (particle.recyclable) this.pool.push(particle)
      } else {
        alive.push(particle)
      }
    })

    this.particles = alive
  }

  render(ctx) {
    this.particles.forEach((particle) => particle.render(ctx))
  }

  clear() {
    this.pool.push(...this.particles.filter((particle) => particle.recyclable))
    this.particles = []
  }
}

export default ParticleSystem
