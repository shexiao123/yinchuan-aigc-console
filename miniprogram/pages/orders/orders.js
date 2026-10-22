const api = require('../../utils/api')
const { orderStatus, yuan, fromNow } = require('../../utils/util')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待接单' },
  { key: 'producing', label: '进行中' },
  { key: 'delivered', label: '待确认' },
  { key: 'completed', label: '已完成' }
]

Page({
  data: {
    loading: true,
    filters: FILTERS,
    activeKey: 'all',
    orders: [],
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
      const status = this.data.activeKey === 'all' ? '' : this.data.activeKey
      const orders = await api.listOrders({
        role,
        providerIds,
        uid: session.user.id,
        status
      })
      this.setData({
        role,
        orders: orders.map((o) => {
          const st = orderStatus(o.status)
          return {
            ...o,
            statusText: st.text,
            tone: st.tone,
            amountText: yuan(o.amount),
            timeText: fromNow(o.created_at)
          }
        }),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
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
