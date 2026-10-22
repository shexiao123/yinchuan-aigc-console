const api = require('../../utils/api')
const { yuan, yuanShort, coverTheme } = require('../../utils/util')

Page({
  data: {
    loading: true,
    submitting: false,
    serviceId: null,
    providerId: null,
    publishMode: 'direct',
    service: null,
    provider: null,
    settings: null,
    title: '',
    requirement: '',
    shootDate: '',
    amount: 0,
    platformFee: 0,
    commissionRate: 10,
    amountText: '0',
    feeText: '0',
    dateError: '',
    formError: ''
  },

  onLoad(options) {
    const serviceId = Number((options && options.serviceId) || 0)
    const providerId = Number((options && options.providerId) || 0)
    this.setData({ serviceId, providerId })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [service, settings] = await Promise.all([api.getService(this.data.serviceId), api.getSettings()])
      if (!service) {
        this.setData({ loading: false })
        wx.showToast({ title: '服务不存在或已下架', icon: 'none' })
        return
      }
      const provider = service.provider_id ? await api.getProvider(service.provider_id) : null
      // 佣金按服务者的会员档位算（与下单时服务端重算同一套规则）
      const comm = await api.getProviderCommission(service.provider_id, settings.commission_rate)
      const rate = Number(comm.rate || 0)
      const fee = Math.round((service.price || 0) * rate)
      this.setData({
        service: {
          ...service,
          priceText: yuanShort(service.price),
          coverClass: coverTheme(service.id)
        },
        provider: provider ? { ...provider, initial: provider.nickname ? provider.nickname.charAt(0) : '影' } : null,
        settings,
        title: service.title,
        amount: service.price,
        platformFee: fee,
        commissionRate: Math.round(rate * 100),
        amountText: yuan(service.price),
        feeText: yuan(fee),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value, formError: '' })
  },

  /** 发布方式：指定服务者 / 公开需求大厅抢单 */
  onModeChange(e) {
    this.setData({ publishMode: e.currentTarget.dataset.mode })
  },

  onRequirementInput(e) {
    this.setData({ requirement: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ shootDate: e.detail.value, dateError: '' })
  },

  /** 校验并提交订单 */
  async onSubmit() {
    if (this.data.submitting) return
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    const title = this.data.title.trim()
    if (!title) {
      this.setData({ formError: '请填写订单标题' })
      return
    }
    const minAmount = (this.data.settings && this.data.settings.min_order_amount) || 0
    if (this.data.amount < minAmount) {
      this.setData({ formError: `该服务低于平台最低下单金额 ¥${yuanShort(minAmount)}` })
      return
    }

    this.setData({ submitting: true, formError: '' })
    try {
      const publishMode = this.data.publishMode
      // 公开需求模式下不指定服务者，订单进入需求大厅由服务者抢单
      const assignedProviderId = publishMode === 'open' ? null : this.data.providerId || null
      const order = await api.createOrder({
        serviceId: this.data.serviceId,
        providerId: assignedProviderId,
        title,
        requirement: this.data.requirement.trim(),
        shootDate: this.data.shootDate || null,
        amount: this.data.amount,
        platformFee: this.data.platformFee,
        customerName: session.user.name || null,
        customerAvatar: session.user.avatarUrl || null
      })
      wx.showToast({ title: '下单成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${order.id}` })
      }, 800)
    } catch (e) {
      this.setData({ submitting: false })
      const msg = api.friendlyError(e)
      this.setData({ formError: msg })
      wx.showToast({ title: msg, icon: 'none' })
    }
  }
})
