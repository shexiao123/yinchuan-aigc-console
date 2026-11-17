const merchant = require('../../utils/merchant')
const chain = require('../../utils/taskchain')

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
    const localTasks = chain.listTasks({ publicOnly: true })
    const localShop = chain.getMerchant()
    try {
      const [cloudShops, cloudTasks] = await Promise.all([
        merchant.listMerchants().catch(() => []),
        merchant.listTasks({ publicOnly: true, limit: 100 }).catch(() => [])
      ])
      const shops = (cloudShops || []).slice()
      if (localShop && chain.isDemoActive()) {
        shops.unshift({
          id: localShop.id,
          name: localShop.name,
          city: localShop.city || '银川',
          intro: localShop.intro || '本机演示店铺 · 可发布任务与上传参考视频',
          initial: String(localShop.name || '商').charAt(0),
          is_verified: false,
          openTaskCount: localTasks.length,
          isLocal: true
        })
      }
      this.setData({
        shops,
        tasks: localTasks.concat(cloudTasks || []),
        loading: false
      })
    } catch (e) {
      this.setData({
        shops: localShop ? [{
          id: localShop.id, name: localShop.name, city: localShop.city || '银川',
          intro: localShop.intro || '本机演示店铺', initial: String(localShop.name || '商').charAt(0),
          openTaskCount: localTasks.length, isLocal: true
        }] : [],
        tasks: localTasks,
        loading: false
      })
    }
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  onShop(e) {
    const id = e.currentTarget.dataset.id
    if (chain.isLocalId(id)) {
      wx.navigateTo({ url: '/pages/merchant-console/merchant-console' })
      return
    }
    wx.navigateTo({ url: '/pages/merchant/merchant?id=' + id })
  },

  onTask(e) {
    wx.navigateTo({ url: '/pages/task/task?id=' + e.currentTarget.dataset.id })
  },

  onJoin() {
    wx.navigateTo({ url: '/pages/merchant-join/merchant-join' })
  },

  onConsole() {
    wx.navigateTo({ url: '/pages/merchant-console/merchant-console' })
  }
})
