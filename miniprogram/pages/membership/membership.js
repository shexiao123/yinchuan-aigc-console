const member = require('../../utils/member')
const app = getApp()

Page({
  data: {
    loading: true,
    loggedIn: false,
    plans: [],
    status: null,
    deposit: null,
    depositAmountText: '0.00',
    orders: [],
    logs: [],
    selectedCode: '',
    breakdown: null,
    paying: false,
    showPay: false,
    payOrder: null
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    if (this.data.loggedIn) this.loadData()
  },

  async loadData() {
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false, loggedIn: false })
      return
    }
      const uid = session.user.id
      try {
        const [plans, status, deposit, orders, logs] = await Promise.all([
          member.listPlans(),
          member.getMembershipStatus(uid),
          member.getMyDeposit(uid),
          member.listMyPaymentOrders(uid, 10),
          member.listMyMembershipLogs(uid, 20)
        ])
        const selectedCode = this.data.selectedCode || (plans[0] ? plans[0].code : '')
        this.setData({
          loading: false,
          loggedIn: true,
          plans: plans.map((p) => this.decoratePlan(p, selectedCode)),
          status: this.decorateStatus(status),
          deposit: deposit ? { ...deposit, amountText: (Number(deposit.amount_cents || 0) / 100).toFixed(2) } : null,
          depositAmountText: deposit ? (Number(deposit.amount_cents || 0) / 100).toFixed(2) : '0.00',
          orders: (orders || []).map((o) => ({
            ...o,
            amountText: (Number(o.amount_cents || 0) / 100).toFixed(2),
            statusText: this.statusText(o.status),
            createdAtText: this.formatTime(o.created_at)
          })),
          logs: (logs || []).map((l) => ({
            ...l,
            actionText: this.actionText(l.action),
            createdAtText: this.formatTime(l.created_at)
          })),
          selectedCode
        })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    },

    /** 补充展示字段 */
    decoratePlan(p, selectedCode) {
      return {
        ...p,
        // 显式列出可能被 RLS/裁剪丢掉的字段
        description: p.description || '',
        benefits: p.benefits || [],
        selected: p.code === selectedCode,
        priceText: (Number(p.price_cents || 0) / 100).toFixed(0),
        depositText: (Number(p.deposit_cents || 0) / 100).toFixed(0),
        onboardingText: (Number(p.onboarding_fee_cents || 0) / 100).toFixed(0),
        commissionText: (Number(p.commission_rate || 0) * 100).toFixed(0),
        periodText: p.period_days >= 365 ? '年' : (p.period_days >= 90 ? '季' : '月'),
        benefitsList: p.benefits || []
      }
    },

    /** 状态补上展示字段 */
    decorateStatus(s) {
      if (!s) return { isMember: false }
      return {
        ...s,
        commissionText: s.commissionRate === null || s.commissionRate === undefined ? '--' : Number(s.commissionRate * 100).toFixed(0),
        expireAtText: s.expireAt ? String(s.expireAt).slice(0, 10) : ''
      }
    },

    statusText(status) {
      return { pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款', failed: '支付失败' }[status] || status
    },

    actionText(action) {
      return {
        activate: '开通会员',
        renew: '续费',
        cancel: '取消会员',
        deposit_refund: '退还保证金',
        deposit_deduct: '扣除保证金'
      }[action] || action
    },

    formatTime(t) {
      if (!t) return ''
      const d = new Date(t)
      if (Number.isNaN(d.getTime())) return String(t).slice(0, 10)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    },

  onSelectPlan(e) {
    this.setData({ selectedCode: e.currentTarget.dataset.code, breakdown: null })
    // 同步高亮选中态
    const plans = this.data.plans.map((p) => ({ ...p, selected: p.code === e.currentTarget.dataset.code }))
    this.setData({ plans })
  },

  /** 开通会员：生成待支付订单 */
  async onSubscribe() {
    if (this.data.paying) return
    const session = app.globalData.session
    if (!session || !session.user) {
      wx.showModal({
        title: '需要登录',
        content: '登录后才能开通会员',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }) }
      })
      return
    }
    if (!this.data.selectedCode) {
      wx.showToast({ title: '请先选择套餐', icon: 'none' })
      return
    }
    this.setData({ paying: true })
    try {
      const res = await member.createSubscriptionOrder(session.user.id, this.data.selectedCode)
      this.setData({
        paying: false,
        showPay: true,
        payOrder: res.order,
        breakdown: this.decorateBreakdown(res.breakdown)
      })
    } catch (e) {
      this.setData({ paying: false })
      wx.showToast({ title: (e && e.message) || '下单失败', icon: 'none' })
    }
  },

  /** 金额格式化放到 JS，WXML 不做运算 */
  decorateBreakdown(b) {
    if (!b) return null
    return {
      ...b,
      membershipText: (Number(b.membership || 0) / 100).toFixed(2),
      depositText: (Number(b.deposit || 0) / 100).toFixed(2),
      onboardingText: (Number(b.onboarding || 0) / 100).toFixed(2),
      totalText: (Number(b.total || 0) / 100).toFixed(2)
    }
  },

  onClosePay() {
    this.setData({ showPay: false })
  },

  /** 支付通道未开：生成订单后提示线下/后台确认 */
  onConfirmPay() {
    const o = this.data.payOrder
    if (!o) return
    wx.showModal({
      title: '订单已生成',
      content: `订单号 ${o.order_no}\n金额 ¥${(Number(o.amount_cents || 0) / 100).toFixed(2)}\n\n支付通道暂未开通，付款后由平台在后台确认开通。`,
      confirmText: '知道了',
      showCancel: false,
      success: () => {
        this.setData({ showPay: false, payOrder: null, breakdown: null })
        this.loadData()
      }
    })
  },

  async onCancel() {
    const session = app.globalData.session
    if (!session || !session.user) return
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '取消会员',
        content: '取消后立即失去接单资格，已缴纳的会员费不退还。确定取消吗？',
        confirmText: '确定取消',
        confirmColor: '#A8463A',
        success: (r) => resolve(r)
      })
    })
    if (!res.confirm) return
    try {
      await member.cancelSubscription(session.user.id)
      wx.showToast({ title: '已取消', icon: 'success' })
      this.loadData()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '取消失败', icon: 'none' })
    }
  },

  async onRenew() {
    const session = app.globalData.session
    if (!session || !session.user) return
    const code = this.data.status && this.data.status.tier
      ? (this.data.plans.find((p) => p.tier === this.data.status.tier) || {}).code
      : this.data.selectedCode
    if (!code) return
    try {
      const res = await member.renewSubscription(session.user.id, code)
      this.setData({ showPay: true, payOrder: res.order, breakdown: this.decorateBreakdown(res.breakdown) })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '续费失败', icon: 'none' })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onGoSupport() {
    wx.navigateTo({ url: '/pages/support/support' })
  }
})
