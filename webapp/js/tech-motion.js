/**
 * 蓝色科技 · 实时动态背景（Canvas 2D，无外部依赖）
 *
 * 设计约束（舍先生 2026-11-05 定稿）：
 *   1. 整幅不透明：每帧先铺满实色底，绝不用 CSS 半透明叠层 / 毛玻璃
 *   2. 浅蓝亮调：最深处仅 #C7DFFF，不出现深蓝黑底、不发灰发糊
 *   3. 只作用于首屏主视觉，内容区保持干净实色，深色文字始终清晰
 *   4. 尊重 prefers-reduced-motion；页面隐藏 / 元素离屏自动停帧
 *
 * 2026-11-05 二次加强（「背景画面太单调了」）：
 *   原来只有淡网格 + 小粒子 + 一圈细环，画面空。现在加入
 *   赛博城市天际线（静态预渲染）· 蜂窝网格 · 大尺度数据仪表 · 底部波形 ·
 *   斜向流动光轨 · 数据瀑布 · 脉冲环 · 扫描光带 · HUD 刻度与字幕。
 *   静态结构画进离屏 canvas，每帧只重绘会动的部分，保持流畅。
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

  var RGB = { blue: '79,125,243', cyan: '14,165,233', violet: '124,92,240' }
  function rgba(tone, a) { return 'rgba(' + RGB[tone] + ',' + Number(a).toFixed(3) + ')' }

  /* 整幅科技底图：解决「只有细线、画面单调」。图片自带极光带 / 斜切色块 /
     斜向光轨 / 透视网格 / 全息数据球 / HUD 面板，Canvas 只负责在它之上跑动效。
     超宽版给 Hero（约 3:1），竖版给手机，避免 cover 裁掉主体。 */
  var STAGE = {
    wide: 'assets/covers/light/tech-stage-wide.jpg?v=20261106b',
    small: 'assets/covers/light/tech-stage-m.jpg?v=20261106b'
  }
  var stageCache = {}
  function stageImage(url, cb) {
    if (Object.prototype.hasOwnProperty.call(stageCache, url)) { cb(stageCache[url]); return }
    var img = new Image()
    img.onload = function () { stageCache[url] = img; cb(img) }
    img.onerror = function () { stageCache[url] = null; cb(null) }
    img.src = url
    if (img.complete && img.naturalWidth) { stageCache[url] = img; cb(img) }
  }

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
    this.beams = []
    this.city = null
    this.staticLayer = null
    this.stage = null
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
    var self = this
    stageImage(this.small ? STAGE.small : STAGE.wide, function (img) {
      self.stage = img
      self.draw(0)
    })
    this.draw(0)
  }

  Motion.prototype.seed = function () {
    var n = this.small ? 44 : 96
    this.particles = []
    for (var i = 0; i < n; i++) {
      this.particles.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        r: rand(1.2, 3.2),
        vy: rand(0.10, 0.40),
        vx: rand(-0.09, 0.09),
        phase: rand(0, Math.PI * 2),
        tone: Math.random() < 0.58 ? 'blue' : (Math.random() < 0.6 ? 'cyan' : 'violet')
      })
    }
    this.bars = []
    var bn = this.small ? 10 : 18
    for (var j = 0; j < bn; j++) {
      this.bars.push({ phase: rand(0, Math.PI * 2), speed: rand(0.0007, 0.0016) })
    }
    this.beams = []
    var kn = this.small ? 3 : 6
    for (var k = 0; k < kn; k++) {
      this.beams.push({
        speed: rand(0.000055, 0.00012),
        phase: rand(0, 1),
        len: rand(this.w * 0.16, this.w * 0.38),
        width: rand(2, 6),
        lane: rand(0.04, 0.92),
        tone: k % 3 === 0 ? 'violet' : (k % 3 === 1 ? 'cyan' : 'blue')
      })
    }
    this.city = this.buildCity()
    this.staticLayer = this.buildStatic()
  }

  /** 城市天际线数据：远层轮廓 + 近层带亮窗的楼体，一次生成后固定 */
  Motion.prototype.buildCity = function () {
    var w = this.w, h = this.h, horizon = h * 0.62
    var far = [], near = [], x = -24
    while (x < w + 24) {
      var fw = rand(14, 40)
      far.push({ x: x, w: fw, h: rand(h * 0.07, h * 0.25) })
      x += fw + rand(2, 9)
    }
    x = -24
    while (x < w + 24) {
      var bw = rand(26, 64)
      var bh = rand(h * 0.14, h * 0.36)
      var cols = Math.max(2, Math.floor(bw / 10))
      var rows = Math.max(3, Math.floor(bh / 11))
      var wins = []
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (Math.random() < 0.44) {
            var roll = Math.random()
            wins.push({ x: c, y: r, tone: roll < 0.13 ? 'violet' : (roll < 0.38 ? 'cyan' : 'white') })
          }
        }
      }
      near.push({
        x: x, w: bw, h: bh, cols: cols, rows: rows, wins: wins,
        tower: Math.random() < 0.24 ? rand(h * 0.06, h * 0.17) : 0,
        neon: Math.random() < 0.34 ? (Math.random() < 0.5 ? 'violet' : 'cyan') : ''
      })
      x += bw + rand(5, 15)
    }
    return { horizon: horizon, far: far, near: near }
  }

  /** 蜂窝网格：只在右上与左下两块区域出现，避免铺满显得杂乱 */
  Motion.prototype.drawHex = function (g, w, h) {
    var R = this.small ? 17 : 25
    var dx = R * 1.5, dy = R * Math.sqrt(3)
    g.lineWidth = 1
    g.strokeStyle = rgba('blue', 0.11)
    for (var col = -1; col < w / dx + 1; col++) {
      for (var row = -1; row < h / dy + 1; row++) {
        var cx = col * dx
        var cy = row * dy + (col % 2 ? dy / 2 : 0)
        var inRight = cx > w * 0.60 && cy < h * 0.58
        var inLeft = cx < w * 0.32 && cy > h * 0.52
        if (!inRight && !inLeft) continue
        g.beginPath()
        for (var k = 0; k < 6; k++) {
          var a = Math.PI / 3 * k
          var px = cx + R * Math.cos(a), py = cy + R * Math.sin(a)
          if (k) g.lineTo(px, py); else g.moveTo(px, py)
        }
        g.closePath()
        g.stroke()
      }
    }
  }

  /** 静态层：蜂窝 + 城市，预渲染到离屏 canvas，之后每帧只 drawImage */
  Motion.prototype.buildStatic = function () {
    var w = this.w, h = this.h, dpr = this.dpr
    var c = document.createElement('canvas')
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    var g = c.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.drawHex(g, w, h)

    var city = this.city, hz = city.horizon, i, b
    // 远景楼群
    for (i = 0; i < city.far.length; i++) {
      b = city.far[i]
      g.fillStyle = rgba('blue', 0.13)
      g.fillRect(b.x, hz - b.h, b.w, b.h)
      g.fillStyle = rgba('cyan', 0.26)
      g.fillRect(b.x, hz - b.h, b.w, 1)
    }
    // 近景楼体 + 亮窗 + 天线 + 顶部霓虹条
    for (i = 0; i < city.near.length; i++) {
      b = city.near[i]
      // 左侧文字区只留淡轮廓，不画亮窗/霓虹，避免小碎点压住标题
      var soft = b.x + b.w < w * 0.46
      g.fillStyle = rgba('blue', soft ? 0.09 : 0.19)
      g.fillRect(b.x, hz - b.h, b.w, b.h)
      g.strokeStyle = rgba('blue', soft ? 0.15 : 0.32)
      g.lineWidth = 1
      g.strokeRect(b.x + 0.5, hz - b.h + 0.5, b.w - 1, b.h)
      if (soft) continue
      var cw = b.w / b.cols, ch = b.h / b.rows
      for (var q = 0; q < b.wins.length; q++) {
        var win = b.wins[q]
        g.fillStyle = win.tone === 'white' ? 'rgba(255,255,255,0.80)' : rgba(win.tone, 0.58)
        g.fillRect(
          b.x + win.x * cw + cw * 0.26,
          hz - b.h + win.y * ch + ch * 0.26,
          Math.max(1.6, cw * 0.44), Math.max(2, ch * 0.34)
        )
      }
      if (b.tower) {
        g.strokeStyle = rgba('cyan', 0.44)
        g.beginPath()
        g.moveTo(b.x + b.w / 2, hz - b.h)
        g.lineTo(b.x + b.w / 2, hz - b.h - b.tower)
        g.stroke()
        g.fillStyle = rgba('cyan', 0.72)
        g.fillRect(b.x + b.w / 2 - 1.5, hz - b.h - b.tower - 1.5, 3, 3)
      }
      if (b.neon) {
        g.fillStyle = rgba(b.neon, 0.42)
        g.fillRect(b.x + 2, hz - b.h - 4, Math.max(8, b.w * 0.62), 3)
      }
    }
    // 地平线亮带
    var lg = g.createLinearGradient(0, hz - 22, 0, hz + 6)
    lg.addColorStop(0, rgba('cyan', 0))
    lg.addColorStop(1, rgba('cyan', 0.30))
    g.fillStyle = lg
    g.fillRect(0, hz - 22, w, 28)
    g.fillStyle = rgba('cyan', 0.34)
    g.fillRect(0, hz, w, 1)
    return c
  }

  /** 不透明底：冷白 → 浅蓝，叠加柔光，所有像素 alpha = 1 */
  Motion.prototype.drawBase = function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#F7FBFF')
    g.addColorStop(0.46, '#E7F3FF')
    g.addColorStop(1, '#C9DEFF')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    var glows = [
      { x: w * 0.80, y: h * 0.20, r: Math.max(w, h) * 0.48, c: rgba('blue', 0.20) },
      { x: w * 0.98, y: h * 0.88, r: Math.max(w, h) * 0.40, c: rgba('cyan', 0.18) },
      { x: w * 0.32, y: h * 1.06, r: Math.max(w, h) * 0.44, c: rgba('violet', 0.13) },
      { x: w * 0.08, y: h * 0.06, r: Math.max(w, h) * 0.34, c: rgba('cyan', 0.10) }
    ]
    for (var i = 0; i < glows.length; i++) {
      var o = glows[i]
      var rg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
      rg.addColorStop(0, o.c)
      rg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, w, h)
    }
  }

  /** 左侧文字区提亮：画在静态层之后，把楼体亮窗压成淡轮廓，保证标题清晰 */
  Motion.prototype.drawVeil = function (ctx, w, h) {
    var v = ctx.createLinearGradient(0, 0, w * 0.48, 0)
    v.addColorStop(0, 'rgba(255,255,255,0.56)')
    v.addColorStop(0.62, 'rgba(255,255,255,0.24)')
    v.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w * 0.48, h)
  }

  /** 透视网格：消失点偏右，横线随时间向下流动 */
  Motion.prototype.drawGrid = function (ctx, w, h, t) {
    var horizon = h * 0.62
    var vx = w * 0.76
    ctx.lineWidth = 1

    ctx.strokeStyle = rgba('blue', 0.27)
    ctx.beginPath()
    for (var i = -18; i <= 18; i++) {
      ctx.moveTo(vx + (i * 4), horizon)
      ctx.lineTo(vx + i * (w / 12), h + 40)
    }
    ctx.stroke()

    var scroll = (t * (this.small ? 0.000055 : 0.000085)) % 1
    for (var k = 0; k < 22; k++) {
      var p = (k + scroll) / 22
      var y = horizon + Math.pow(p, 2.15) * (h - horizon + 40)
      if (y > h + 2) continue
      ctx.strokeStyle = rgba('blue', (0.12 + p * 0.30).toFixed(3))
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }

  /** 斜向流动光轨：企业宣传片字幕背景常见的扫光 */
  Motion.prototype.drawBeams = function (ctx, w, h, t) {
    for (var i = 0; i < this.beams.length; i++) {
      var b = this.beams[i]
      var p = (t * b.speed + b.phase) % 1
      var x = -w * 0.40 + p * (w * 1.75)
      var y = h * b.lane
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(-0.40)
      var lg = ctx.createLinearGradient(0, 0, b.len, 0)
      lg.addColorStop(0, rgba(b.tone, 0))
      lg.addColorStop(0.42, rgba(b.tone, 0.32))
      lg.addColorStop(0.55, rgba(b.tone, 0.60))
      lg.addColorStop(1, rgba(b.tone, 0))
      ctx.fillStyle = lg
      ctx.fillRect(0, 0, b.len, b.width * 1.5)
      ctx.restore()
    }
  }

  /** 底部数据波形：横贯全宽，让下半幅不再空 */
  Motion.prototype.drawWave = function (ctx, w, h, t) {
    var base = h * 0.855
    var amp = this.small ? 9 : 17
    var N = this.small ? 48 : 92
    ctx.beginPath()
    for (var i = 0; i <= N; i++) {
      var x = i / N * w
      var v = Math.sin(i * 0.26 + t * 0.0012) * 0.55 +
              Math.sin(i * 0.11 - t * 0.0008) * 0.34 +
              Math.sin(i * 0.53 + t * 0.0020) * 0.11
      var y = base - v * amp
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
    }
    ctx.strokeStyle = rgba('cyan', 0.48)
    ctx.lineWidth = 1.8
    ctx.stroke()
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    var fg = ctx.createLinearGradient(0, base, 0, h)
    fg.addColorStop(0, rgba('blue', 0.15))
    fg.addColorStop(1, rgba('blue', 0))
    ctx.fillStyle = fg
    ctx.fill()

    // 游标竖线 + 光点
    var lx = w * (0.76 + 0.04 * Math.sin(t * 0.0004))
    ctx.strokeStyle = rgba('violet', 0.34)
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(lx, base - amp * 1.8)
    ctx.lineTo(lx, h)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = rgba('violet', 0.62)
    ctx.beginPath()
    ctx.arc(lx, base - amp * 0.7, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 大尺度数据仪表：刻度环 + 渐变进度弧 + 中心读数 */
  Motion.prototype.drawDial = function (ctx, w, h, t) {
    var r = Math.min(w, h) * (this.small ? 0.15 : 0.19)
    var cx = w * (this.small ? 0.84 : 0.91)
    var cy = h * (this.small ? 0.72 : 0.76)
    for (var k = 0; k < 36; k++) {
      var a = k / 36 * Math.PI * 2 - Math.PI / 2
      var major = k % 3 === 0
      ctx.strokeStyle = rgba('blue', major ? 0.36 : 0.18)
      ctx.lineWidth = major ? 1.6 : 1
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      ctx.lineTo(cx + Math.cos(a) * (r + (major ? 10 : 5)), cy + Math.sin(a) * (r + (major ? 10 : 5)))
      ctx.stroke()
    }
    ctx.strokeStyle = rgba('blue', 0.22)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, r - 8, 0, Math.PI * 2)
    ctx.stroke()
    var prog = 0.66 + 0.16 * Math.sin(t * 0.0005)
    var ag = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    ag.addColorStop(0, rgba('cyan', 0.80))
    ag.addColorStop(1, rgba('violet', 0.80))
    ctx.strokeStyle = ag
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, cy, r - 8, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2)
    ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.setLineDash([3, 7])
    ctx.strokeStyle = rgba('blue', 0.30)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, r - 22, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(11,31,51,0.52)'
    ctx.font = '600 ' + (this.small ? 11 : 15) + 'px ui-monospace, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.fillText((92 + 6 * Math.sin(t * 0.0004)).toFixed(1) + '%', cx, cy + 5)
    ctx.textAlign = 'left'
  }

  /** 上升数据粒子 + 近距连线 */
  Motion.prototype.drawParticles = function (ctx, w, h, t, dt) {
    var ps = this.particles
    var colors = {
      blue: rgba('blue', 0.82),
      cyan: rgba('cyan', 0.78),
      violet: rgba('violet', 0.66)
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
    var maxD = this.small ? 94 : 122
    ctx.lineWidth = 0.8
    for (var a = 0; a < ps.length; a++) {
      for (var b = a + 1; b < ps.length; b++) {
        var dx = ps[a].x - ps[b].x
        var dy = ps[a].y - ps[b].y
        var d2 = dx * dx + dy * dy
        if (d2 > maxD * maxD) continue
        ctx.strokeStyle = rgba('blue', (1 - Math.sqrt(d2) / maxD) * 0.30)
        ctx.beginPath()
        ctx.moveTo(ps[a].x, ps[a].y)
        ctx.lineTo(ps[b].x, ps[b].y)
        ctx.stroke()
      }
    }
    for (var j = 0; j < ps.length; j++) {
      var q = ps[j]
      // 每 6 颗给一颗加发光晕，让底图上的动态粒子有「光」而不是小灰点
      if (j % 6 === 0) {
        var hr = q.r * 7
        var hg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, hr)
        hg.addColorStop(0, rgba(q.tone, 0.34))
        hg.addColorStop(1, rgba(q.tone, 0))
        ctx.fillStyle = hg
        ctx.beginPath()
        ctx.arc(q.x, q.y, hr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = colors[q.tone]
      ctx.globalAlpha = 0.72 + 0.28 * Math.sin(t * 0.0016 + q.phase)
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** 脉冲数据环：右上缓慢扩散的细圆环 */
  Motion.prototype.drawRings = function (ctx, w, h, t) {
    var cx = w * 0.845, cy = h * 0.28
    var base = Math.min(w, h) * 0.12
    for (var i = 0; i < 4; i++) {
      var phase = (t * 0.00013 + i / 4) % 1
      var r = base + phase * Math.min(w, h) * 0.44
      ctx.strokeStyle = rgba('blue', (1 - phase) * 0.42)
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = rgba('cyan', 0.36)
    ctx.beginPath()
    ctx.arc(cx, cy, 3.4, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 数据瀑布：自上而下流动的细亮线 */
  Motion.prototype.drawStreams = function (ctx, w, h, t) {
    var n = this.small ? 6 : 11
    for (var i = 0; i < n; i++) {
      var x = w * (0.05 + i * 0.088)
      var p = (t * (0.000075 + i * 0.000013) + i * 0.19) % 1
      var y = -100 + p * (h + 200)
      var len = 76 + (i % 3) * 38
      var lg = ctx.createLinearGradient(0, y, 0, y + len)
      lg.addColorStop(0, rgba('cyan', 0))
      lg.addColorStop(0.5, rgba('cyan', 0.44))
      lg.addColorStop(1, rgba('cyan', 0))
      ctx.fillStyle = lg
      ctx.fillRect(x, y, 2, len)
    }
  }

  /** 扫描光带（横 + 竖） + 数据条 + HUD 刻度字幕 */
  Motion.prototype.drawScan = function (ctx, w, h, t) {
    var p = (t % 9000) / 9000
    var y = -80 + p * (h + 160)
    var band = ctx.createLinearGradient(0, y - 60, 0, y + 60)
    band.addColorStop(0, 'rgba(255,255,255,0)')
    band.addColorStop(0.5, rgba('cyan', 0.26))
    band.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = band
    ctx.fillRect(0, y - 60, w, 120)

    // 竖向扫描线
    var sx = ((t * 0.00006) % 1) * w
    var vg = ctx.createLinearGradient(sx - 26, 0, sx + 26, 0)
    vg.addColorStop(0, rgba('violet', 0))
    vg.addColorStop(0.5, rgba('violet', 0.13))
    vg.addColorStop(1, rgba('violet', 0))
    ctx.fillStyle = vg
    ctx.fillRect(sx - 26, 0, 52, h)

    // 左下角数据条
    var bx = 22, by = h - 18
    var bw = this.small ? 3 : 4, gap = this.small ? 5 : 7
    for (var i = 0; i < this.bars.length; i++) {
      var b = this.bars[i]
      var hh = 6 + (0.5 + 0.5 * Math.sin(t * b.speed + b.phase)) * (this.small ? 16 : 26)
      ctx.fillStyle = rgba('blue', 0.42)
      ctx.fillRect(bx + i * (bw + gap), by - hh, bw, hh)
    }

    // 右上角刻度尺
    ctx.strokeStyle = rgba('blue', 0.34)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (var k = 0; k < 12; k++) {
      var x = w - 22 - k * 9
      ctx.moveTo(x, 20)
      ctx.lineTo(x, 20 + (k % 3 === 0 ? 11 : 5))
    }
    ctx.stroke()

    // HUD 字幕（低对比度，不抢标题）
    if (!this.small) {
      ctx.fillStyle = 'rgba(11,31,51,0.36)'
      ctx.font = '600 10px ui-monospace, Consolas, monospace'
      ctx.fillText('YINCHUAN · AIGC   /   DATA STREAM 0' + (1 + Math.floor(t / 1000) % 9), 24, 26)
      ctx.fillText('NODES ' + this.particles.length + '   SYNC ' + (100 + Math.floor(t / 50) % 900), w - 196, h - 14)
      ctx.fillStyle = rgba('cyan', 0.42)
      ctx.fillRect(w - 210, 32, 26, 2)
      ctx.fillRect(w - 178, 32, 12, 2)
    }
  }

  Motion.prototype.draw = function (dt) {
    var ctx = this.ctx
    if (!ctx || !this.w || !this.h) return
    var w = this.w, h = this.h, t = this.t
    if (this.stage) {
      // 整幅底图已含极光 / 色块 / 网格 / 数据球，动态层只叠加会动的部分，
      // 不再重画静态城市与网格，避免两层叠脏。
      ctx.drawImage(this.stage, 0, 0, w, h)
    } else {
      // 图片未就绪时的兜底画面（纯程序化绘制，保持不透明浅蓝底）
      this.drawBase(ctx, w, h, t)
      if (this.staticLayer) ctx.drawImage(this.staticLayer, 0, 0, w, h)
      this.drawVeil(ctx, w, h)
      this.drawGrid(ctx, w, h, t)
    }
    this.drawBeams(ctx, w, h, t)
    this.drawRings(ctx, w, h, t)
    this.drawWave(ctx, w, h, t)
    this.drawDial(ctx, w, h, t)
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
    var m
    try {
      m = new Motion(host, canvas)
    } catch (e) {
      // 绘制初始化失败时移除画布，避免留下「有画布但不动」的静默死背景
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
      if (window.console) console.error('[tech-motion] init failed:', e)
      return
    }
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
