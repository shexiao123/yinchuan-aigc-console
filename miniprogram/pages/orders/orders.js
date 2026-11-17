const api = require('../../utils/api')
const demand = require('../../utils/demand')
const chain = require('../../utils/taskchain')
const { orderStatus, yuan, fromNow } = require('../../utils/util')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待接单' },
  { key: 'producing', label: '进行中' },
  { key: 'delivered', label: '待确认' },
  { key: 'completed', label: '已完成' },
  { key: 'refund', label: '退款中' }
]

Page({
  data: {
    loading: true,
    filters: FILTERS,
    activeKey: 'all',
    keyword: '',
    orders: [],
    stats: { pending: 0, doing: 0, check: 0, refund: 0, done: 0, closed: 0 },
    role: 'customer',
    loggedIn: false
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    const app = getApp()
    const loggedIn = !!(app.globalData.session && app.globalData.session.user)
    this.setData({ loggedIn })
    this.loadOrders()
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeKey) return
    this.setData({ activeKey: key })
    this.loadOrders()
  },

  async loadOrders() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false, orders: [], loggedIn: false })
      return
    }
    this.setData({ loading: true })
    try {
      const provider = app.globalData.provider
      const providerIds = provider ? [provider.id] : []
      const role = provider ? 'provider' : 'customer'
      const key = this.data.activeKey
      // 一次取全量，本地算统计格再按状态过滤，避免 6 宫格要发 6 次请求
      const all = await api.listOrders({
        role,
        providerIds,
        uid: session.user.id,
        status: ''
      })
      // 6 宫格与首页共用一套统计口径：云端订单 + 本地演示需求 + 商家任务
      const stats = chain.mergeStats(all, demand.myTaken(), chain.listTasks())
      const pick = {
        all: () => all,
        open: () => all.filter((o) => o.status === 'open'),
        producing: () => all.filter((o) => o.status === 'taken' || o.status === 'producing'),
        delivered: () => all.filter((o) => o.status === 'delivered'),
        completed: () => all.filter((o) => o.status === 'completed'),
        refund: () => all.filter((o) => o.status === 'refund')
      }
      const orders = (pick[key] || pick.all)()
      const mapped = orders.map((o) => {
        const st = orderStatus(o.status)
        return {
          ...o,
          statusText: st.text,
          tone: st.tone,
          amountText: yuan(o.amount),
          timeText: fromNow(o.created_at)
        }
      })
      // 搜索框在本地过滤，切 tab 不重新请求
      this.allOrders = mapped
      this.setData({
        role,
        stats,
        orders: mapped,
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onKeyword(e) {
    const kw = String(e.detail.value || '').trim().toLowerCase()
    this.setData({ keyword: e.detail.value })
    const all = this.allOrders || []
    const list = kw
      ? all.filter((o) => (o.title || '').toLowerCase().indexOf(kw) >= 0 || (o.order_no || '').toLowerCase().indexOf(kw) >= 0)
      : all
    this.setData({ orders: list })
  },

  onOrderTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` })
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh())
  }
})
