const merchant = require('../../utils/merchant')

Page({
  data: {
    tab: 'shops',
    shops: [],
    tasks: [],
    loading: true
  },

  onLoad(options) {
    if (options && options.tab) this.setData({ tab: options.tab })
    this.loadData()
  },

  onShow() {
    if (this._loaded) this.loadData()
    this._loaded = true
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    try {
      const [shops, tasks] = await Promise.all([
        merchant.listMerchants(),
        merchant.listTasks({ publicOnly: true, limit: 100 })
      ])
      this.setData({ shops, tasks, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  onShop(e) {
    wx.navigateTo({ url: '/pages/merchant/merchant?id=' + e.currentTarget.dataset.id })
  },

  onTask(e) {
    wx.navigateTo({ url: '/pages/task/task?id=' + e.currentTarget.dataset.id })
  },

  onConsole() {
    wx.navigateTo({ url: '/pages/merchant-console/merchant-console' })
  }
})
