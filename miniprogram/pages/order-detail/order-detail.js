const api = require('../../utils/api')
const { orderStatus, yuan, fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    acting: false,
    orderId: null,
    order: null,
    service: null,
    provider: null,
    isCustomer: false,
    isProvider: false,
    reviewed: false,
    loggedIn: false
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0)
    this.setData({ orderId: id })
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    const app = getApp()
    const session = app.globalData.session
    const loggedIn = !!(session && session.user)
    if (!loggedIn) {
      this.setData({ loading: false })
      return
    }
    try {
      const order = await api.getOrder(this.data.orderId)
      if (!order) {
        this.setData({ loading: false })
        wx.showToast({ title: '订单不存在', icon: 'none' })
        return
      }
      const service = await api.getService(order.service_id)
      const provider = order.provider_id ? await api.getProvider(order.provider_id) : null
      const uid = session.user.id
      const st = orderStatus(order.status)
      const timeline = Array.isArray(order.timeline) ? order.timeline : []
      // 是否已评价（决定按钮显示「写评价」还是「修改评价」）
      const existingReview = order.status === 'completed' ? await api.getReviewByOrder(order.id) : null
      this.setData({
        order: {
          ...order,
          statusText: st.text,
          tone: st.tone,
          amountText: yuan(order.amount),
          feeText: yuan(order.platform_fee),
          timeText: fromNow(order.created_at),
          timeline: timeline.map((t) => ({ ...t, timeText: fromNow(t.at) }))
        },
        service,
        provider: provider ? { ...provider, initial: provider.nickname ? provider.nickname.charAt(0) : '影' } : null,
        isCustomer: order.customer_id === uid,
        isProvider: !!app.globalData.provider && order.provider_id === app.globalData.provider.id,
        reviewed: !!existingReview,
        loggedIn: true,
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  /** 状态推进的统一入口 */
  async advance(nextStatus, note) {
    if (this.data.acting) return
    this.setData({ acting: true })
    try {
      const app = getApp()
      const uid = app.globalData.session ? app.globalData.session.user.id : ''
      await api.advanceOrder(this.data.orderId, nextStatus, note, uid)
      wx.showToast({ title: '操作成功', icon: 'success' })
      await this.loadData()
    } catch (e) {
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  onTakeOrder() {
    this.advance('taken')
  },

  onStartProducing() {
    this.advance('producing')
  },

  onDeliver() {
    this.advance('delivered')
  },

  onConfirm() {
    this.advance('completed')
  },

  onCancel() {
    wx.showModal({
      title: '取消订单',
      content: '取消后需要重新下单，确定要取消吗？',
      confirmText: '确定取消',
      confirmColor: '#C0574A',
      success: (res) => {
        if (res.confirm) this.advance('cancelled')
      }
    })
  },

  onEvaluate() {
    if (!this.data.order) return
    wx.navigateTo({ url: `/pages/review/review?id=${this.data.orderId}` })
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/orders/orders' })
    })
  },

  onServiceTap() {
    if (!this.data.service) return
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${this.data.service.id}` })
  }
})
