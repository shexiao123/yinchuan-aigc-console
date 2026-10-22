const api = require('../../utils/api')
const { coverTheme, yuanShort, fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    banners: [],
    categories: [],
    hotServices: [],
    providers: [],
    settings: null,
    loggedIn: false
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    const app = getApp()
    const loggedIn = !!(app.globalData.session && app.globalData.session.user)
    if (loggedIn !== this.data.loggedIn) {
      this.setData({ loggedIn })
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [banners, categories, hotServices, providers] = await Promise.all([
        api.listBanners(),
        api.listCategories(),
        api.listServices({ limit: 6 }),
        api.listProviders()
      ])
      const settings = await api.getSettings()
      const app = getApp()
      this.setData({
        banners: banners.map((b) => ({
          ...b,
          themeClass: `banner-${b.theme || 'amber'}`,
          // 背景图：完整 http 地址直接用；存储路径需转签名地址
          imageUrl: b.image_url ? (String(b.image_url).startsWith('http') ? b.image_url : '') : '',
          hasImage: !!b.image_url
        })),
        categories,
        hotServices: hotServices.map((s) => ({
          ...s,
          priceText: yuanShort(s.price),
          oldPriceText: s.original_price ? yuanShort(s.original_price) : '',
          coverClass: coverTheme(s.id)
        })),
        providers: providers.map((p) => ({
          ...p,
          initial: p.nickname ? p.nickname.charAt(0) : '影',
          ratingText: Number(p.rating || 5).toFixed(1)
        })),
        settings,
        loggedIn: !!(app.globalData.session && app.globalData.session.user),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  /** 轮播点击：跳到对应分类的服务列表 */
  onBannerTap(e) {
    const slug = e.currentTarget.dataset.slug
    const type = e.currentTarget.dataset.type
    // link_type=all：跳全部服务；否则按分类跳转
    if (type === 'all' || !slug) {
      wx.navigateTo({ url: '/pages/services/services' })
      return
    }
    wx.navigateTo({ url: `/pages/services/services?category=${slug}` })
  },

  /** 分类点击 */
  onCategoryTap(e) {
    const slug = e.currentTarget.dataset.slug
    if (!slug) return
    wx.navigateTo({ url: `/pages/services/services?category=${slug}` })
  },

  /** 轮播图需要图片素材，这里用渐变封面代替 */
  onServiceTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` })
  },

  onProviderTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/services/services?provider=${id}` })
  },

  onSeeAll() {
    wx.navigateTo({ url: '/pages/services/services' })
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  onShareAppMessage() {
    return {
      title: '银川AIGC数字文化产业基地 · 婚礼微电影 / 宣传片 / 短视频，一次下单全程托管',
      path: '/pages/index/index'
    }
  }
})
