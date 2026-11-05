const merchant = require('../../utils/merchant')

Page({
  data: {
    loading: true,
    plans: [],
    payCfg: {}
  },

  onLoad() {
    this.init()
  },

  onPullDownRefresh() {
    this.init().finally(() => wx.stopPullDownRefresh())
  },

  async init() {
    try {
      const [plans, payCfg] = await Promise.all([
        merchant.listPlans().catch(() => []),
        merchant.getPayConfig().catch(() => ({}))
      ])
      this.setData({ plans: plans || [], payCfg: payCfg || {}, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onConsole() {
    wx.navigateTo({ url: '/pages/merchant-console/merchant-console' })
  },

  onMerchants() {
    wx.navigateTo({ url: '/pages/merchants/merchants' })
  }
})
