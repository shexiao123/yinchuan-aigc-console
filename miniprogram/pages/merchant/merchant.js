const merchant = require('../../utils/merchant')

Page({
  data: {
    shop: null,
    tasks: [],
    loading: true
  },

  onLoad(options) {
    this.shopId = options.id
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    try {
      const [shop, tasks] = await Promise.all([
        merchant.getMerchant(this.shopId),
        merchant.listTasks({ merchantId: this.shopId, publicOnly: true })
      ])
      this.setData({ shop, tasks, loading: false })
      if (shop) wx.setNavigationBarTitle({ title: shop.name })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onTask(e) {
    wx.navigateTo({ url: '/pages/task/task?id=' + e.currentTarget.dataset.id })
  },

  onAllTasks() {
    wx.navigateTo({ url: '/pages/merchants/merchants?tab=tasks' })
  }
})
