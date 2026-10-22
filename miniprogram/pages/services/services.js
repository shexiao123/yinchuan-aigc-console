const api = require('../../utils/api')
const { coverTheme, yuanShort } = require('../../utils/util')

Page({
  data: {
    loading: true,
    category: '',
    providerId: '',
    keyword: '',
    categories: [],
    activeCat: '',
    services: [],
    total: 0
  },

  onLoad(options) {
    const category = (options && options.category) || ''
    const providerId = (options && options.provider) || ''
    this.setData({ category, providerId, activeCat: category })
    this.loadCategories()
    this.loadServices()
  },

  onShow() {
    const app = getApp()
    if (app.globalData.session && !this.data.loaded) {
      this.setData({ loaded: true })
    }
  },

  async loadCategories() {
    try {
      const categories = await api.listCategories()
      this.setData({ categories })
    } catch (e) {
      console.error('[services] loadCategories failed', JSON.stringify({ message: e.message }))
    }
  },

  async loadServices() {
    this.setData({ loading: true })
    try {
      const services = await api.listServices({
        categorySlug: this.data.category,
        providerId: this.data.providerId ? Number(this.data.providerId) : undefined,
        keyword: this.data.keyword,
        limit: 50
      })
      this.setData({
        services: services.map((s) => ({
          ...s,
          priceText: yuanShort(s.price),
          oldPriceText: s.original_price ? yuanShort(s.original_price) : '',
          coverClass: coverTheme(s.id)
        })),
        total: services.length,
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onCatTap(e) {
    const slug = e.currentTarget.dataset.slug
    if (slug === this.data.activeCat) return
    this.setData({ activeCat: slug, category: slug })
    this.loadServices()
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchConfirm() {
    this.loadServices()
  },

  onServiceTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` })
  },

  onPullDownRefresh() {
    this.loadServices().finally(() => wx.stopPullDownRefresh())
  },

  onShareAppMessage() {
    return { title: '银川AIGC数字文化产业基地 · 精选影视制作服务', path: '/pages/services/services' }
  }
})
