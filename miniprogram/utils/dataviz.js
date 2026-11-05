/**
 * 小程序端数据可视化渲染器
 *
 * 小程序没有 DOM、没有 React，但可以用 Canvas 2D 画出与网页端
 * 同一套视觉语言的图表 —— 颜色、几何、缓动全部读 tokens.json
 * （由 video/src/tokens.ts 同步而来）。
 *
 * 用法：
 *   const ctx = wx.createCanvasContext('trendCanvas', this)
 *   renderTrend(ctx, {trend: [...], width: 340, height: 200, progress: 1})
 */
const tokens = require('./tokens.json')

const C = tokens.colors
const GEO = tokens.geo
const SERIES = tokens.seriesColors
const C_GLOBAL = C

/* ---------------- 工具 ---------------- */

/** 与网页端一致的数值格式 */
function yuanShort(n) {
  if (!isFinite(n)) return '0'
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return String(Math.round(n))
}
function yuanLabel(n) {
  return '¥' + yuanShort(n)
}
function comma(n) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** cubic-bezier 缓动求值（与 CSS 同算法） */
function bezier(x1, y1, x2, y2) {
  return function (t) {
    if (t <= 0) return 0
    if (t >= 1) return 1
    // Newton 迭代求 x，再取 y
    const cx = 3 * x1
    const bx = 3 * (x2 - x1) - cx
    const ax = 1 - cx - bx
    const cy = 3 * y1
    const by = 3 * (y2 - y1) - cy
    const ay = 1 - cy - by
    const sampleX = (u) => ((ax * u + bx) * u + cx) * u
    const sampleY = (u) => ((ay * u + by) * u + cy) * u
    const dX = (u) => (3 * ax * u + 2 * bx) * u + cx
    let u = t
    for (let i = 0; i < 8; i++) {
      const x = sampleX(u) - t
      if (Math.abs(x) < 1e-6) break
      const d = dX(u)
      if (Math.abs(d) < 1e-6) break
      u -= x / d
    }
    return sampleY(u)
  }
}

const EASE = {
  enter: bezier(0.16, 1, 0.3, 1),
  grow: bezier(0.33, 1, 0.68, 1)
}

/** 十六进制色 → rgba */
function rgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
}

/* ---------------- 图表 ---------------- */

/**
 * 趋势图 —— 柱（订单量）+ 折线（成交额）
 * 与网页端 TrendChart 视觉一致
 */
function renderTrend(ctx, opts) {
  const data = opts.trend || []
  const W = opts.width
  const H = opts.height
  const progress = opts.progress === undefined ? 1 : opts.progress

  ctx.clearRect(0, 0, W, H)
  if (!data.length) return

  const padX = 10
  const padTop = 18
  const padBottom = 24
  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom
  const slot = plotW / data.length

  const maxCount = Math.max.apply(null, data.map((d) => d.count).concat([1]))
  const maxAmount = Math.max.apply(null, data.map((d) => d.amount).concat([1]))

  const xOf = (i) => padX + slot * i + slot / 2
  const yCount = (v) => padTop + plotH - (v / maxCount) * plotH
  const yAmount = (v) => padTop + plotH - (v / maxAmount) * plotH

  // 网格
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1
  ctx.setLineDash([3, 5])
  ;[0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    const y = padTop + plotH * t
    ctx.beginPath()
    ctx.moveTo(padX, y)
    ctx.lineTo(W - padX, y)
    ctx.stroke()
  })
  ctx.setLineDash([])

  // 柱
  const barW = slot * GEO.barRatio
  data.forEach((d, i) => {
    const appear = Math.max(0, Math.min(1, (progress - i * 0.06) / 0.35))
    if (appear <= 0) return
    const h = (d.count / maxCount) * plotH * EASE.grow(appear)
    ctx.fillStyle = rgba(C.brand, 0.22)
    const x = xOf(i) - barW / 2
    const y = padTop + plotH - h
    ctx.beginPath()
    ctx.moveTo(x, y + 3)
    ctx.arcTo(x, y, x + 3, y, 3)
    ctx.lineTo(x + barW - 3, y)
    ctx.arcTo(x + barW, y, x + barW, y + 3, 3)
    ctx.lineTo(x + barW, padTop + plotH)
    ctx.lineTo(x, padTop + plotH)
    ctx.closePath()
    ctx.fill()
  })

  // 折线 + 面积
  const lineProgress = Math.max(0, Math.min(1, progress * 1.2))
  const visible = Math.max(2, Math.ceil(data.length * lineProgress))
  const pts = data.slice(0, visible).map((d, i) => ({ x: xOf(i), y: yAmount(d.amount) }))

  if (pts.length > 1) {
    // 面积
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH)
    grad.addColorStop(0, rgba(C.brand, GEO.areaFillTop))
    grad.addColorStop(1, rgba(C.brand, GEO.areaFillBottom))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.lineTo(pts[pts.length - 1].x, padTop + plotH)
    ctx.lineTo(pts[0].x, padTop + plotH)
    ctx.closePath()
    ctx.fill()

    // 线
    const lg = ctx.createLinearGradient(pts[0].x, 0, pts[pts.length - 1].x, 0)
    lg.addColorStop(0, C.brand)
    lg.addColorStop(1, C.accent)
    ctx.strokeStyle = lg
    ctx.lineWidth = GEO.lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = rgba(C.brand, 0.55)
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    ctx.shadowBlur = 0

    // 末端光点
    const last = pts[pts.length - 1]
    ctx.fillStyle = C.accent
    ctx.shadowColor = C.accent
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(last.x, last.y, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // X 轴标签
  ctx.fillStyle = C.ink3
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  data.forEach((d, i) => {
    ctx.fillText(d.date, xOf(i), H - 7)
  })
  ctx.textAlign = 'left'
}

/**
 * 环形图 —— 分类分布
 * 与网页端 DonutChart 一致
 */
function renderDonut(ctx, opts) {
  const data = opts.byCategory || []
  const size = opts.size
  const cx = size / 2
  const cy = size / 2
  const progress = opts.progress === undefined ? 1 : opts.progress
  const centerValue = opts.centerValue
  const centerLabel = opts.centerLabel

  ctx.clearRect(0, 0, size, size)
  if (!data.length) return

  const total = data.reduce((s, d) => s + d.count, 0) || 1
  const thickness = GEO.donutThickness * size
  const r = size / 2 - thickness / 2
  const start = (GEO.donutStart * Math.PI) / 180

  // 底环
  ctx.strokeStyle = C.line
  ctx.lineWidth = thickness
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // 扇形
  let acc = 0
  data.forEach((d, i) => {
    const frac = d.count / total
    const a0 = start + acc * Math.PI * 2 * progress
    const a1 = start + (acc + frac) * Math.PI * 2 * progress
    acc += frac
    if (a1 <= a0) return
    const color = SERIES[i % SERIES.length]
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    ctx.shadowColor = rgba(color, 0.4)
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, a1)
    ctx.stroke()
    ctx.shadowBlur = 0
  })

  // 中心文字
  if (centerValue !== undefined) {
    ctx.fillStyle = C.ink
    ctx.font = 'bold 26px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(centerValue), cx, cy + 4)
    if (centerLabel) {
      ctx.fillStyle = C.ink3
      ctx.font = '12px sans-serif'
      ctx.fillText(centerLabel, cx, cy + 22)
    }
    ctx.textAlign = 'left'
  }
}

/**
 * 排行榜条 —— 热销服务
 * 用矩形画，兼容 canvas 2d
 */
function renderTopBars(ctx, opts) {
  const data = opts.topServices || []
  const W = opts.width
  const rowH = opts.rowH || 40
  const H = data.length * rowH
  const progress = opts.progress === undefined ? 1 : opts.progress

  ctx.clearRect(0, 0, W, H)
  if (!data.length) return

  const max = Math.max.apply(
    null,
    data.map((d) => (opts.metric === 'price' ? d.price : d.sales)).concat([1])
  )
  const labelW = 118
  const valueW = 46
  const barX = labelW + 8
  const barW = W - barX - valueW - 4

  data.forEach((d, i) => {
    const appear = Math.max(0, Math.min(1, (progress - i * 0.08) / 0.4))
    if (appear <= 0) return
    const y = i * rowH
    const raw = opts.metric === 'price' ? d.price : d.sales

    // 标题
    ctx.fillStyle = C.ink
    ctx.font = '13px sans-serif'
    ctx.textBaseline = 'middle'
    let title = d.title
    while (ctx.measureText(title).width > labelW && title.length > 3) {
      title = title.slice(0, -1)
    }
    if (title !== d.title) title += '…'
    ctx.fillText(title, 0, y + 12)

    // 条
    const w = (raw / max) * barW * EASE.grow(appear)
    const g = ctx.createLinearGradient(barX, 0, barX + w, 0)
    if (opts.metric === 'price') {
      g.addColorStop(0, C.accent)
      g.addColorStop(1, C.accent2)
    } else {
      g.addColorStop(0, C.brand)
      g.addColorStop(1, C.accent)
    }
    ctx.fillStyle = 'rgba(120,190,230,0.10)'
    ctx.fillRect(barX, y + 6, barW, 5)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(barX, y + 9)
    ctx.arcTo(barX, y + 6, barX + 3, y + 6, 3)
    ctx.lineTo(barX + w - 3, y + 6)
    ctx.arcTo(barX + w, y + 6, barX + w, y + 9, 3)
    ctx.lineTo(barX + w, y + 11)
    ctx.arcTo(barX + w, y + 14, barX + w - 3, y + 14, 3)
    ctx.lineTo(barX + 3, y + 14)
    ctx.arcTo(barX, y + 14, barX, y + 11, 3)
    ctx.closePath()
    ctx.fill()

    // 数值
    ctx.fillStyle = opts.metric === 'price' ? C.accent : C.brand
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'right'
    const shown = raw * appear
    ctx.fillText(opts.metric === 'price' ? yuanLabel(shown) : String(Math.round(shown)), W, y + 11)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  })
}

/**
 * 电影感背景 —— 与网页端 CineBackground 同语言
 *
 * 四层：星云辉光 / 双层网格 / 浮尘粒子 / 扫描线
 * Canvas 没有 CSS 渐变遮罩，用径向渐变自己画。
 */
function renderCineBackground(ctx, opts) {
  const W = opts.width
  const H = opts.height
  const frame = opts.frame || 0
  const C = opts.colors || C_GLOBAL

  ctx.clearRect(0, 0, W, H)

  // 1. 星云辉光
  const glows = [
    {x: W * 0.14, y: H * 0.08, r: W * 0.55, c: 'rgba(34,211,238,0.16)'},
    {x: W * 0.88, y: H * 0.06, r: W * 0.48, c: 'rgba(167,139,250,0.14)'},
    {x: W * 0.5, y: H * 1.04, r: W * 0.6, c: 'rgba(244,114,182,0.10)'}
  ]
  glows.forEach((g) => {
    const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r)
    grad.addColorStop(0, g.c)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  })

  // 2. 双层网格
  const gridX = (frame * 0.5) % 32
  const gridY = (frame * 0.2) % 32
  ctx.lineWidth = 0.5
  ctx.strokeStyle = 'rgba(120,190,230,0.10)'
  for (let x = gridX; x < W; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = gridY; y < H; y += 32) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  // 粗网格
  ctx.strokeStyle = 'rgba(34,211,238,0.13)'
  ctx.lineWidth = 0.8
  for (let x = (gridX * 4) % 128; x < W; x += 128) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }

  // 3. 浮尘粒子
  for (let i = 0; i < 26; i++) {
    const layer = i % 3
    const speed = [0.12, 0.3, 0.6][layer]
    const r = [0.8, 1.4, 2.2][layer]
    const alpha = [0.20, 0.34, 0.55][layer]
    const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1
    const seed2 = Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1
    const x = seed * W
    const y = (seed2 * H + frame * speed) % (H + 20) - 10
    ctx.fillStyle = seed2 > 0.72 ? 'rgba(167,139,250,' + alpha + ')' : 'rgba(34,211,238,' + alpha + ')'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 4. 扫描线
  const scanY = ((frame * 1.6) % (H + 160)) - 80
  const sg = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60)
  sg.addColorStop(0, 'rgba(34,211,238,0)')
  sg.addColorStop(0.5, 'rgba(34,211,238,0.07)')
  sg.addColorStop(1, 'rgba(34,211,238,0)')
  ctx.fillStyle = sg
  ctx.fillRect(0, scanY - 60, W, 120)
}

/**
 * 扫描光条 —— 与网页端 ScanLight 同语言
 * 在指定区域内横向扫过
 */
function renderScanLight(ctx, opts) {
  const W = opts.width
  const H = opts.height
  const progress = opts.progress === undefined ? 1 : opts.progress
  const color = opts.color || '34,211,238'
  if (progress >= 0.99) return

  const x = -W * 0.3 + progress * (W * 1.6)
  const grad = ctx.createLinearGradient(x - 60, 0, x + 60, 0)
  grad.addColorStop(0, 'rgba(' + color + ',0)')
  grad.addColorStop(0.5, 'rgba(' + color + ',0.20)')
  grad.addColorStop(1, 'rgba(' + color + ',0)')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = grad
  ctx.fillRect(x - 60, 0, 120, H)
  ctx.restore()
}

module.exports = {
  tokens,
  colors: C,
  yuanShort,
  yuanLabel,
  comma,
  bezier,
  rgba,
  renderTrend,
  renderDonut,
  renderTopBars,
  renderCineBackground,
  renderScanLight
}
