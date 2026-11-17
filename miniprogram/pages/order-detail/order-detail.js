const api = require('../../utils/api')
const { orderStatus, yuan, fromNow } = require('../../utils/util')
const reqTpl = require('../../utils/requirement-templates')
const guarantee = require('../../utils/guarantee')

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
    loggedIn: false,
    guarantee: null
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
      // 云端 orders 只存规范文本 `【标签】值`，这里反解析成结构化行
      const reqRows = reqTpl.buildRows(order)
      // 是否已评价（决定按钮显示「写评价」还是「修改评价」）
      const existingReview = order.status === 'completed' ? await api.getReviewByOrder(order.id) : null
      // 履约档案：老订单懒建，进入即判定逾期违约
      const pid = guarantee.projectId('order', order.id)
      if (!guarantee.get(pid)) {
        guarantee.ensureProject({
          projectId: pid, source: 'order', refId: order.id,
          title: order.title, budget: order.amount,
          publisherName: order.customer_name || '下单客户',
          dueAt: /^\d{4}-\d{2}-\d{2}$/.test(String(order.shoot_date || ''))
            ? String(order.shoot_date).slice(0, 10) : guarantee.defaultDueAt(),
          requireMerchant: false
        })
      }
      const gp = guarantee.checkOverdue(pid)
      this.setData({
        order: {
          ...order,
          statusText: st.text,
          tone: st.tone,
          amountText: yuan(order.amount),
          feeText: yuan(order.platform_fee),
          timeText: fromNow(order.created_at),
          timeline: timeline.map((t) => ({ ...t, timeText: fromNow(t.at) })),
          reqRows,
          hasReqRows: reqRows.length > 0
        },
        service,
        provider: provider ? { ...provider, initial: provider.nickname ? provider.nickname.charAt(0) : '影' } : null,
        isCustomer: order.customer_id === uid,
        isProvider: !!app.globalData.provider && order.provider_id === app.globalData.provider.id,
        reviewed: !!existingReview,
        loggedIn: true,
        loading: false,
        guarantee: gp
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

  _pid() {
    return guarantee.projectId('order', this.data.orderId)
  },

  /** 每个单子的统一上传 / 发布者审核通道 */
  onDeliveryChannel() {
    wx.navigateTo({ url: `/pages/delivery/delivery?source=order&id=${this.data.orderId}` })
  },

  onTakeOrder() {
    // 接单须缴项目金额 15% 履约保证金（本地演示记账必成）
    try {
      guarantee.holdProviderDeposit(this._pid(), '服务者')
    } catch (e) {
      wx.showToast({ title: e.message || '保证金冻结失败', icon: 'none' })
      return
    }
    this.advance('taken')
  },

  onStartProducing() {
    this.advance('producing')
  },

  onDeliver() {
    this.onDeliveryChannel()
  },

  /** 发布者审核通过：无需意见，双方保证金自动返还原支付账户 */
  onConfirm() {
    try {
      guarantee.approve(this._pid())
    } catch (e) {
      wx.showToast({ title: '请先在「项目交付通道」完成作品上传与审核', icon: 'none' })
      return
    }
    this.advance('completed')
  },

  /** 审核不通过必须填修改意见 + 新的提交日期，走交付页完整表单 */
  onReject() {
    this.onDeliveryChannel()
  },

  onRefund() {
    wx.showModal({
      title: '申请退款',
      content: '提交后订单进入「退款中」，由平台核实处理。确定申请吗？',
      confirmText: '申请退款',
      confirmColor: '#C0574A',
      success: (res) => {
        if (res.confirm) this.advance('refund', '客户发起退款申请')
      }
    })
  },

  onCancel() {
    wx.showModal({
      title: '取消订单',
      content: '取消后需要重新下单，确定要取消吗？',
      confirmText: '确定取消',
      confirmColor: '#C0574A',
      success: (res) => {
        if (res.confirm) {
          // 取消时未违约的双方保证金原路退回
          try { guarantee.cancel(this._pid(), '订单取消') } catch (e) {}
          this.advance('cancelled')
        }
      }
    })
  },

  onEvaluate() {
    if (!this.data.order) return
    wx.navigateTo({ url: `/pages/review/review?id=${this.data.orderId}` })
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.navigateTo({ url: '/pages/orders/orders' })
    })
  },

  onServiceTap() {
    if (!this.data.service) return
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${this.data.service.id}` })
  }
})
