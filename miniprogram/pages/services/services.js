const api = require('../../utils/api')
const media = require('../../utils/local-media')
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
    total: 0,
    isComic: false
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
    let categories = []
    try {
      categories = await api.listCategories()
    } catch (e) {
      categories = []
    }
    this.setData({ categories: categories.length ? categories : media.demoCategories() })
  },

  async loadServices() {
    this.setData({ loading: true })
    let services = []
    try {
      services = await api.listServices({
        categorySlug: this.data.category,
        providerId: this.data.providerId ? Number(this.data.providerId) : undefined,
        keyword: this.data.keyword,
        limit: 50
      })
    } catch (e) {
      services = []
    }
    // 云端不可达时按分类给出离线演示服务，插图仍然在
    if (!services.length && !this.data.providerId && !this.data.keyword) {
      services = media.demoServices(this.data.category)
    }
    this.setData({
      services: services.map((s) => ({
        ...s,
        priceText: yuanShort(s.price),
        oldPriceText: s.original_price ? yuanShort(s.original_price) : '',
        coverClass: coverTheme(s.id),
        coverUrl: s.coverUrl || media.squareFor(s),
        localCover: s.localCover || media.squareFor(s),
        coverUrlWide: s.coverUrlWide || media.coverFor(s)
      })),
      total: services.length,
      isComic: this.data.category === 'comic-drama' && !this.data.keyword,
      loading: false
    })
  },

  /** 外链封面裂图时换包内插画 */
  onImageFallback: media.makeImageFallback(),

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

  /** 漫剧制作按项目整案对接，不划分服务项 */
  onComicTasks() {
    wx.navigateTo({ url: '/pages/merchants/merchants?tab=tasks' })
  },
  onComicGroups() {
    wx.navigateTo({ url: '/pages/groups/groups' })
  },

  onPullDownRefresh() {
    this.loadServices().finally(() => wx.stopPullDownRefresh())
  },

  onShareAppMessage() {
    return { title: '银川AIGC数字文化产业基地 · 精选影视制作服务', path: '/pages/services/services' }
  }
})
