/**
 * 蓝色科技 · 实时动态背景（Canvas 2D，无外部依赖）
 *
 * 设计约束（舍先生 2026-11-05 定稿）：
 *   1. 整幅不透明：每帧先铺满实色底，绝不用 CSS 半透明叠层 / 毛玻璃
 *   2. 浅蓝亮调：最深处仅 #DFEEFF，不出现深蓝黑底、不发灰发糊
 *   3. 只作用于首屏主视觉，内容区保持干净实色，深色文字始终清晰
 *   4. 尊重 prefers-reduced-motion；页面隐藏 / 元素离屏自动停帧
 *
 * 视觉元素（企业宣传片「科技字幕背景」语汇）：
 *   透视流动网格 · 上升数据粒子与近距连线 · 扫描光带 · 脉冲数据环 · 数据条 · 柔光晕
 *
 * 用法：给容器加 class 命中 HOST_SELECTOR，脚本自动挂载；
 *       URL 加 ?motion=0 可强制关闭；window.WBTechMotion 提供 pause/resume/refresh。
 */
;(function () {
  'use strict'

  var HOST_SELECTOR = '.home-hero, .mc-hero, .mjoin-hero'
  var CANVAS_CLASS = 'tech-motion-canvas'
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  var forcedOff = /[?&]motion=0(?:&|$)/.test(location.search)
  var enabled = !forcedOff

  var instances = new Map() // host element -> Motion
  var rafPending = false

  function rand(a, b) { return a + Math.random() * (b - a) }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }

  function Motion(host, canvas) {
    this.host = host
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.w = 0
    this.h = 0
    this.dpr = 1
    this.t = 0
    this.last = 0
    this.frames = 0
    this.running = false
    this.raf = 0
    this.particles = []
    this.bars = []
    this.small = false
    this.resize()
  }

  Motion.prototype.resize = function () {
    var rect = this.host.getBoundingClientRect()
    var w = Math.max(1, Math.round(rect.width))
    var h = Math.max(1, Math.round(rect.height))
    var dpr = clamp(window.devicePixelRatio || 1, 1, 2)
    if (w === this.w && h === this.h && dpr === this.dpr) return
    this.w = w; this.h = h; this.dpr = dpr
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.small = w < 720
    this.seed()
    this.draw(0)
  }

  Motion.prototype.seed = function () {
    var n = this.small ? 26 : 64
    this.particles = []
    for (var i = 0; i < n; i++) {
      this.particles.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        r: rand(1.1, 2.9),
        vy: rand(0.10, 0.34),
        vx: rand(-0.07, 0.07),
        phase: rand(0, Math.PI * 2),
        tone: Math.random() < 0.62 ? 'blue' : (Math.random() < 0.6 ? 'cyan' : 'violet')
      })
    }
    this.bars = []
    var bn = this.small ? 8 : 15
    for (var j = 0; j < bn; j++) {
      this.bars.push({ phase: rand(0, Math.PI * 2), speed: rand(0.0007, 0.0016) })
    }
  }

  /** 不透明底：冷白 → 浅蓝，叠加极淡柔光，所有像素 alpha = 1 */
  Motion.prototype.drawBase = function (ctx, w, h, t) {
    var g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#F7FBFF')
    g.addColorStop(0.50, '#E4F0FF')
    g.addColorStop(1, '#C7DFFF')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // 柔光晕：canvas 内部混色，最终仍是不透明像素
    var glows = [
      { x: w * 0.80, y: h * 0.22, r: Math.max(w, h) * 0.46, c: 'rgba(79,125,243,0.19)' },
      { x: w * 0.98, y: h * 0.86, r: Math.max(w, h) * 0.38, c: 'rgba(14,165,233,0.16)' },
      { x: w * 0.34, y: h * 1.04, r: Math.max(w, h) * 0.42, c: 'rgba(124,92,240,0.10)' }
    ]
    for (var i = 0; i < glows.length; i++) {
      var o = glows[i]
      var rg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
      rg.addColorStop(0, o.c)
      rg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, w, h)
    }

    // 左侧文字区保底：轻微提亮，深色标题对比度足够，不遮掉科技网格
    var veil = ctx.createLinearGradient(0, 0, w * 0.50, 0)
    veil.addColorStop(0, 'rgba(255,255,255,0.42)')
    veil.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = veil
    ctx.fillRect(0, 0, w * 0.50, h)
  }

  /** 透视网格：消失点偏右，横线随时间向下流动，营造向前飞行的纵深 */
  Motion.prototype.drawGrid = function (ctx, w, h, t) {
    var horizon = h * 0.60
    var vx = w * 0.76
    var span = Math.max(w, h)
    ctx.lineWidth = 1

    // 发散纵线
    ctx.strokeStyle = 'rgba(79,125,243,0.22)'
    ctx.beginPath()
    for (var i = -14; i <= 14; i++) {
      var bx = vx + i * (w / 12)
      ctx.moveTo(vx + (i * 4), horizon)
      ctx.lineTo(bx, h + 40)
    }
    ctx.stroke()

    // 流动横线（越靠下越疏，模拟透视）
    var speed = this.small ? 0.000055 : 0.000085
    var scroll = (t * speed) % 1
    for (var k = 0; k < 16; k++) {
      var p = (k + scroll) / 16
      var y = horizon + Math.pow(p, 2.15) * (h - horizon + 40)
      if (y > h + 2) continue
      var a = 0.10 + p * 0.24
      ctx.strokeStyle = 'rgba(79,125,243,' + a.toFixed(3) + ')'
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    // 地平线亮带
    var hg = ctx.createLinearGradient(0, horizon - 26, 0, horizon + 8)
    hg.addColorStop(0, 'rgba(14,165,233,0)')
    hg.addColorStop(1, 'rgba(14,165,233,0.24)')
    ctx.fillStyle = hg
    ctx.fillRect(0, horizon - 26, w, 34)
    void span
  }

  /** 上升数据粒子 + 近距连线 */
  Motion.prototype.drawParticles = function (ctx, w, h, t, dt) {
    var ps = this.particles
    var colors = {
      blue: 'rgba(79,125,243,0.76)',
      cyan: 'rgba(14,165,233,0.72)',
      violet: 'rgba(124,92,240,0.60)'
    }
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i]
      if (dt > 0) {
        p.y -= p.vy * dt * 0.06
        p.x += p.vx * dt * 0.06
        if (p.y < -8) { p.y = h + 8; p.x = rand(0, w) }
        if (p.x < -8) p.x = w + 8
        if (p.x > w + 8) p.x = -8
      }
    }

    // 近距连线（n 小，桌面 64 / 手机 26，开销可控）
    var maxD = this.small ? 92 : 116
    ctx.lineWidth = 0.8
    for (var a = 0; a < ps.length; a++) {
      for (var b = a + 1; b < ps.length; b++) {
        var dx = ps[a].x - ps[b].x
        var dy = ps[a].y - ps[b].y
        var d2 = dx * dx + dy * dy
        if (d2 > maxD * maxD) continue
        var alpha = (1 - Math.sqrt(d2) / maxD) * 0.26
        ctx.strokeStyle = 'rgba(79,125,243,' + alpha.toFixed(3) + ')'
        ctx.beginPath()
        ctx.moveTo(ps[a].x, ps[a].y)
        ctx.lineTo(ps[b].x, ps[b].y)
        ctx.stroke()
      }
    }

    for (var j = 0; j < ps.length; j++) {
      var q = ps[j]
      var tw = 0.72 + 0.28 * Math.sin(t * 0.0016 + q.phase)
      ctx.fillStyle = colors[q.tone]
      ctx.globalAlpha = tw
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** 脉冲数据环：右上缓慢扩散的细圆环 */
  Motion.prototype.drawRings = function (ctx, w, h, t) {
    var cx = w * 0.845
    var cy = h * 0.30
    var base = Math.min(w, h) * 0.13
    for (var i = 0; i < 3; i++) {
      var phase = ((t * 0.00013 + i / 3) % 1)
      var r = base + phase * Math.min(w, h) * 0.42
      var a = (1 - phase) * 0.36
      ctx.strokeStyle = 'rgba(79,125,243,' + a.toFixed(3) + ')'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(14,165,233,0.30)'
    ctx.beginPath()
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 数据瀑布：自上而下流动的细亮线，企业宣传片常见语汇 */
  Motion.prototype.drawStreams = function (ctx, w, h, t) {
    var n = this.small ? 4 : 7
    for (var i = 0; i < n; i++) {
      var x = w * (0.08 + i * 0.135)
      var speed = 0.000075 + i * 0.000013
      var p = (t * speed + i * 0.19) % 1
      var y = -90 + p * (h + 180)
      var len = 70 + (i % 3) * 34
      var lg = ctx.createLinearGradient(0, y, 0, y + len)
      lg.addColorStop(0, 'rgba(14,165,233,0)')
      lg.addColorStop(0.5, 'rgba(14,165,233,0.34)')
      lg.addColorStop(1, 'rgba(14,165,233,0)')
      ctx.fillStyle = lg
      ctx.fillRect(x, y, 1.6, len)
    }
  }

  /** 扫描光带：缓慢下移的一条亮蓝带 + 左侧数据条 */
  Motion.prototype.drawScan = function (ctx, w, h, t) {
    var period = 9000
    var p = (t % period) / period
    var y = -80 + p * (h + 160)
    var band = ctx.createLinearGradient(0, y - 60, 0, y + 60)
    band.addColorStop(0, 'rgba(255,255,255,0)')
    band.addColorStop(0.5, 'rgba(14,165,233,0.20)')
    band.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = band
    ctx.fillRect(0, y - 60, w, 120)

    // 左下角数据条（HUD 语汇）
    var bx = 22
    var by = h - 18
    var bw = this.small ? 3 : 4
    var gap = this.small ? 5 : 7
    for (var i = 0; i < this.bars.length; i++) {
      var b = this.bars[i]
      var hh = 6 + (0.5 + 0.5 * Math.sin(t * b.speed + b.phase)) * (this.small ? 16 : 26)
      ctx.fillStyle = 'rgba(79,125,243,0.38)'
      ctx.fillRect(bx + i * (bw + gap), by - hh, bw, hh)
    }

    // 右上角细刻度
    ctx.strokeStyle = 'rgba(79,125,243,0.30)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (var k = 0; k < 9; k++) {
      var x = w - 22 - k * 9
      ctx.moveTo(x, 20)
      ctx.lineTo(x, 20 + (k % 3 === 0 ? 10 : 5))
    }
    ctx.stroke()
  }

  Motion.prototype.draw = function (dt) {
    var ctx = this.ctx
    if (!ctx || !this.w || !this.h) return
    var w = this.w, h = this.h, t = this.t
    this.drawBase(ctx, w, h, t)
    this.drawGrid(ctx, w, h, t)
    this.drawRings(ctx, w, h, t)
    this.drawStreams(ctx, w, h, t)
    this.drawParticles(ctx, w, h, t, dt)
    this.drawScan(ctx, w, h, t)
  }

  Motion.prototype.frame = function (ts) {
    if (!this.running) return
    var dt = this.last ? Math.min(ts - this.last, 60) : 16
    this.last = ts
    this.t += dt
    this.frames++
    this.draw(dt)
    this.raf = requestAnimationFrame(this.frame.bind(this))
  }

  Motion.prototype.start = function () {
    if (this.running || reduced || !enabled || document.hidden) return
    this.running = true
    this.last = 0
    this.raf = requestAnimationFrame(this.frame.bind(this))
  }

  Motion.prototype.stop = function () {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  function mount(host) {
    if (!enabled || instances.has(host)) return
    if (host.querySelector('.' + CANVAS_CLASS)) return
    var canvas = document.createElement('canvas')
    canvas.className = CANVAS_CLASS
    canvas.setAttribute('aria-hidden', 'true')
    host.insertBefore(canvas, host.firstChild)
    var m = new Motion(host, canvas)
    instances.set(host, m)

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { m.resize() })
      ro.observe(host)
      m.ro = ro
    }
    m.start()
  }

  function refresh() {
    if (!rafPending) return
    rafPending = false
    // 清理已离屏实例
    instances.forEach(function (m, host) {
      if (!host.isConnected) {
        m.stop()
        if (m.ro) m.ro.disconnect()
        instances.delete(host)
      }
    })
    if (!enabled) return
    var root = document.getElementById('app') || document.body
    var hosts = root.querySelectorAll(HOST_SELECTOR)
    for (var i = 0; i < hosts.length; i++) mount(hosts[i])
  }

  function schedule() {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(refresh)
  }

  function init() {
    if (!enabled) return
    var root = document.getElementById('app') || document.body
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', schedule, { once: true })
    } else {
      schedule()
    }
    // 只观察 #app 的直接子节点，避免观察 subtree 造成自触发循环
    var observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true })

    window.addEventListener('resize', function () {
      instances.forEach(function (m) { m.resize() })
    }, { passive: true })

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        instances.forEach(function (m) { m.stop() })
      } else {
        instances.forEach(function (m) { m.start() })
      }
    })

    window.addEventListener('hashchange', schedule)
  }

  window.WBTechMotion = {
    refresh: schedule,
    pause: function () { enabled = false; instances.forEach(function (m) { m.stop() }) },
    resume: function () { enabled = true; schedule(); instances.forEach(function (m) { m.start() }) },
    isRunning: function () {
      var any = false
      instances.forEach(function (m) { if (m.running) any = true })
      return any
    },
    frameCount: function () {
      var n = 0
      instances.forEach(function (m) { n = Math.max(n, m.frames) })
      return n
    },
    hosts: function () { return instances.size },
    reduced: reduced
  }

  init()
})()
