const api = require('../../utils/api')
const { orderStatus, yuan, fromNow } = require('../../utils/util')
const dataviz = require('../../utils/dataviz')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待接单' },
  { key: 'taken', label: '已接单' },
  { key: 'producing', label: '制作中' },
  { key: 'delivered', label: '待确认' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
]

Page({
  data: {
    loading: true,
    isStaff: false,
    loggedIn: false,
    activating: false,
    activateError: '',
    inviteCode: '',
    filters: FILTERS,
    activeKey: 'all',
    stats: null,
    // 可视化数据版画布尺寸
    vizTrendW: 300,
    vizTrendH: 180,
    vizDonutSize: 150,
    vizTopW: 300,
    vizTopH: 200,
    // 数据报告视频（Remotion 渲染，部署在网页端静态目录）
    reportVideoUrl: 'https://guangying-web.app.workbuddy.host/assets/videos/mobile-share-card.mp4',
    orders: [],
    gmvText: '0'
  },

  onLoad() {
    this.loadData()
  },

  onHide() {
    this.stopCineBackground()
  },

  onUnload() {
    this.stopCineBackground()
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false, isStaff: false, loggedIn: false })
      return
    }
    try {
      const isStaff = await api.isStaff(session.user.id)
      if (!isStaff) {
        this.setData({ loading: false, isStaff: false, loggedIn: true })
        return
      }
      const status = this.data.activeKey === 'all' ? '' : this.data.activeKey
      const [stats, orders] = await Promise.all([api.adminStats(), api.adminListOrders(status, 50)])
      // 分类图例配色：与网页端 seriesColors 同序
      const SERIES = dataviz.tokens.seriesColors
      const byCategory = (stats.byCategory || []).map((c, i) => ({
        ...c,
        color: SERIES[i % SERIES.length]
      }))
      this.setData({
        loading: false,
        isStaff: true,
        stats: {...stats, byCategory},
        gmvText: yuan(stats.gmv),
        orders: orders.map((o) => {
          const st = orderStatus(o.status)
          return {
            ...o,
            statusText: st.text,
            tone: st.tone,
            amountText: yuan(o.amount),
            feeText: yuan(o.platform_fee),
            timeText: fromNow(o.created_at)
          }
        })
      })
      this.drawViz(stats)
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  /* ---------------- 可视化数据版 ---------------- */

  /**
   * 用 Canvas 绘制趋势图 / 环形图 / 排行榜
   * 与网页端 Remotion 版共用 tokens（miniprogram/utils/tokens.json）
   */
  async drawViz(stats) {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const pageW = sys.windowWidth
    const pad = 16 * 2
    const panelPad = 18 * 2
    const innerW = pageW - pad - panelPad

    const trendW = innerW
    const trendH = 180
    const donutSize = 150
    const topW = innerW
    const topH = 5 * 40

    this.setData({
      vizTrendW: trendW,
      vizTrendH: trendH,
      vizDonutSize: donutSize,
      vizTopW: topW,
      vizTopH: topH
    })

    // 等 DOM 更新完再画
    await new Promise((resolve) => setTimeout(resolve, 60))

    // 背景层：电影感网格 + 粒子 + 扫描线（持续动画）
    this.startCineBackground()

    await this.animateCanvas('vizTrend', trendW, trendH, (ctx, p) => {
      dataviz.renderTrend(ctx, {trend: stats.trend || [], width: trendW, height: trendH, progress: p})
    })
    await this.animateCanvas('vizDonut', donutSize, donutSize, (ctx, p) => {
      dataviz.renderDonut(ctx, {
        byCategory: stats.byCategory || [],
        size: donutSize,
        progress: p,
        centerValue: String(stats.onShelf || 0),
        centerLabel: '在架服务'
      })
    })
    await this.animateCanvas('vizTop', topW, topH, (ctx, p) => {
      dataviz.renderTopBars(ctx, {
        topServices: stats.topServices || [],
        width: topW,
        rowH: 40,
        progress: p,
        metric: 'sales'
      })
    })
  },

  /**
   * 背景层持续动画（与网页端 CineBackground 同一套语言）
   */
  startCineBackground() {
    const self = this
    this.stopCineBackground()
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const W = sys.windowWidth
    const H = 900

    const query = wx.createSelectorQuery().in(this)
    query
      .select('#vizBg')
      .fields({node: true, size: true})
      .exec((res) => {
        const item = res && res[0]
        if (!item || !item.node) return
        const canvas = item.node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2
        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)

        const start = Date.now()
        const loop = () => {
          if (!self._bgRunning) return
          const frame = Math.floor((Date.now() - start) / 33)
          dataviz.renderCineBackground(ctx, {width: W, height: H, frame})
          self._bgTimer = setTimeout(loop, 33)
        }
        self._bgRunning = true
        loop()
      })
  },

  stopCineBackground() {
    this._bgRunning = false
    if (this._bgTimer) {
      clearTimeout(this._bgTimer)
      this._bgTimer = null
    }
  },

  /**
   * Canvas 入场动画：60fps 推进 progress，缓动与网页端一致
   */
  animateCanvas(id, w, h, draw) {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery().in(this)
      query
        .select('#' + id)
        .fields({node: true, size: true})
        .exec((res) => {
          const item = res && res[0]
          if (!item || !item.node) {
            resolve()
            return
          }
          const canvas = item.node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2
          canvas.width = w * dpr
          canvas.height = h * dpr
          ctx.scale(dpr, dpr)

          const duration = 700
          const start = Date.now()
          const step = () => {
            const t = Math.min(1, (Date.now() - start) / duration)
            const eased = dataviz.bezier(0.33, 1, 0.68, 1)(t)
            draw(ctx, eased)
            if (t < 1) {
              setTimeout(step, 16)
            } else {
              resolve()
            }
          }
          step()
        })
    })
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeKey) return
    this.setData({ activeKey: key })
    this.loadData()
  },

  /** 打开激活输入框 */
  onActivate() {
    this.setData({ activating: true, activateError: '', inviteCode: '' })
  },

  onActivateCancel() {
    this.setData({ activating: false, activateError: '', inviteCode: '' })
  },

  onInviteInput(e) {
    this.setData({ inviteCode: e.detail.value, activateError: '' })
  },

  /** 提交邀请码 */
  async onActivateSubmit() {
    const code = (this.data.inviteCode || '').trim()
    if (!code) {
      this.setData({ activateError: '请输入邀请码' })
      return
    }
    this.setData({ activating: true, activateError: '' })
    try {
      const row = await api.claimAdminInvite(code)
      const app = getApp()
      app.globalData.isStaff = true
      this.setData({ activating: false, activateError: '', inviteCode: '' })
      wx.showToast({ title: `已激活：${row.name || '管理员'}`, icon: 'success' })
      this.loadData()
    } catch (e) {
      this.setData({ activating: false, activateError: api.friendlyError(e) })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  /** 导出订单数据，供管理端导入（两个云环境数据不互通时的同步手段） */
  async onExport() {
    wx.showLoading({ title: '导出中…' })
    try {
      const data = await api.exportAllOrders()
      const text = JSON.stringify(data)
      wx.setClipboardData({
        data: text,
        success: () => {
          wx.hideLoading()
          wx.showModal({
            title: '已复制到剪贴板',
            content: `共 ${data.count} 条订单数据。请打开管理端的「数据同步」页面，粘贴后导入。`,
            showCancel: false,
            confirmText: '知道了'
          })
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '复制失败，请重试', icon: 'none' })
        }
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onOrderTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` })
  }
})
