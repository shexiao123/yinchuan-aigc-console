const api = require('../../utils/api')
const media = require('../../utils/local-media')
const { yuan, yuanShort, coverTheme } = require('../../utils/util')
const reqForm = require('../../utils/req-form')
const reqTpl = require('../../utils/requirement-templates')
const guarantee = require('../../utils/guarantee')

Page(Object.assign({}, reqForm.methods, {
  data: Object.assign({
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
    deliveryDue: guarantee.defaultDueAt(),
    minDue: guarantee.dateStr(new Date()),
    amount: 0,
    platformFee: 0,
    commissionRate: 10,
    amountText: '0',
    feeText: '0',
    dateError: '',
    formError: ''
  }, reqForm.data()),

  onLoad(options) {
    const serviceId = Number((options && options.serviceId) || 0)
    const providerId = Number((options && options.providerId) || 0)
    this.setData({ serviceId, providerId })
    this.loadData()
  },

  onImageFallback: media.makeImageFallback(),

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
          coverClass: coverTheme(service.id),
          coverUrl: service.coverUrl || media.squareFor(service),
          coverUrlWide: service.coverUrlWide || media.coverFor(service),
          localCover: service.localCover || media.squareFor(service)
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
      }, () => {
        // 品类由所属服务决定，用户下单时不需要再选
        const catKey = service.category_id || service.categoryId || service.category_slug || 0
        const resolved = reqTpl.resolve(catKey)
        this.setReqCategory(resolved.id)
        // 服务的标题/标签里往往带规格，预填到「补充说明」作为参考
        const tags = (service.tags || []).join('、')
        if (tags) {
          const fields = (this.data.reqFields || []).slice()
          const idx = fields.findIndex((f) => f.key === 'extra')
          if (idx >= 0 && !fields[idx].value) {
            this.setData({ ['reqFields[' + idx + '].value']: '服务包含：' + tags })
          }
        }
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

  onDateChange(e) {
    this.setData({ shootDate: e.detail.value, dateError: '' })
  },

  /** 校验并提交订单 */
  onDeliveryDueChange(e) {
    this.setData({ deliveryDue: e.detail.value })
  },

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
    const reqErr = this.reqValidate()
    if (reqErr) {
      this.setData({ formError: reqErr })
      wx.showToast({ title: reqErr, icon: 'none' })
      return
    }
    const minAmount = (this.data.settings && this.data.settings.min_order_amount) || 0
    if (this.data.amount < minAmount) {
      this.setData({ formError: `该服务低于平台最低下单金额 ¥${yuanShort(minAmount)}` })
      return
    }

    const req = this.reqPayload()
    this.setData({ submitting: true, formError: '' })
    try {
      const publishMode = this.data.publishMode
      // 公开需求模式下不指定服务者，订单进入需求大厅由服务者抢单
      const assignedProviderId = publishMode === 'open' ? null : this.data.providerId || null
      const order = await api.createOrder({
        serviceId: this.data.serviceId,
        providerId: assignedProviderId,
        title,
        // 规范文本写回云端 orders.requirement，不新增列
        requirement: req.reqText,
        shootDate: this.data.shootDate || null,
        amount: this.data.amount,
        platformFee: this.data.platformFee,
        customerName: session.user.name || null,
        customerAvatar: session.user.avatarUrl || null
      })
      // 为云端订单建立本地履约档案：发布方保证金 10%（下单是消费行为，不校验商家资质）
      // 云端订单资金以服务端为准，这里做的是演示记账 + 交付审核/违约金规则联动
      try {
        guarantee.createProject({
          source: 'order',
          refId: order.id,
          title,
          budget: this.data.amount,
          publisherName: session.user.name || '下单客户',
          dueAt: this.data.deliveryDue || guarantee.defaultDueAt(),
          requireMerchant: false
        })
      } catch (ge) {
        console.warn('[order-create] guarantee project skipped', ge && ge.message)
      }
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
}))
