const api = require('../../utils/api')
const { fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    loggedIn: false,
    list: [],
    unread: 0,
    emptyText: '暂无消息'
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false, loggedIn: false, list: [], unread: 0 })
      return
    }
    try {
      const [rows, unread] = await Promise.all([
        api.listNotifications(60),
        api.countUnread()
      ])
      this.setData({
        loggedIn: true,
        unread,
        list: rows.map((n) => ({
          ...n,
          timeText: fromNow(n.created_at),
          typeText: { order: '订单', system: '系统', review: '评价', apply: '审核' }[n.type] || '通知',
          isUnread: !n.is_read
        })),
        emptyText: rows.length ? '暂无消息' : '暂时没有新消息，接单与订单进展会在这里提醒你',
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  async onTap(e) {
    const id = Number(e.currentTarget.dataset.id)
    const linkType = e.currentTarget.dataset.linkType
    const linkId = e.currentTarget.dataset.linkId
    const item = this.data.list.find((n) => n.id === id)
    if (item && item.isUnread) {
      try {
        await api.markNotificationRead(id)
      } catch (e) {
        // 标记失败不阻断跳转
      }
    }
    const ROUTES = {
      order: '/pages/order-detail/order-detail?id=',
      service: '/pages/service-detail/service-detail?id=',
      task: '/pages/task/task?id=',
      merchant: '/pages/merchant/merchant?id='
    }
    if (ROUTES[linkType] && linkId) {
      wx.navigateTo({ url: ROUTES[linkType] + linkId })
      return
    }
    if (linkType === 'wallet' || linkType === 'income') {
      wx.navigateTo({ url: '/pages/wallet/wallet' })
      return
    }
    // 没有明确落地页的通知，至少把完整内容展示出来，不再点了没反应
    if (item) {
      wx.showModal({
        title: item.title || '消息详情',
        content: item.body || item.content || '暂无详细内容',
        showCancel: false
      })
    }
  },

  async onReadAll() {
    try {
      const n = await api.markAllNotificationsRead()
      toast(n ? `已标记 ${n} 条为已读` : '没有未读消息')
      this.loadData()
    } catch (e) {
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  }
})

function toast(msg) {
  wx.showToast({ title: msg, icon: 'none' })
}
