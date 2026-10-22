const api = require('../../utils/api')
const samples = require('../../utils/samples')
const { coverTheme, yuanShort, yuan, fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    serviceId: null,
    service: null,
    provider: null,
    reviews: [],
    samples: [],
    loggedIn: false,
    submitting: false
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0)
    this.setData({ serviceId: id })
    this.loadData()
  },

  onShow() {
    const app = getApp()
    this.setData({ loggedIn: !!(app.globalData.session && app.globalData.session.user) })
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const service = await api.getService(this.data.serviceId)
      if (!service) {
        this.setData({ loading: false })
        wx.showToast({ title: '服务不存在或已下架', icon: 'none' })
        return
      }
      const app = getApp()
      const loggedIn = !!(app.globalData.session && app.globalData.session.user)
      const [provider, reviews, rawSamples] = await Promise.all([
        api.getProvider(service.provider_id),
        api.listReviews(service.id),
        api.listSamples(service.id)
      ])
      // 样片需签名后才能播放；未登录时无法签名，展示登录引导
      let signed = rawSamples.map((s) => ({ ...s, url: '', locked: true }))
      if (loggedIn) {
        signed = await samples.signedUrls(rawSamples)
      }
      this.setData({
        service: {
          ...service,
          priceText: yuanShort(service.price),
          oldPriceText: service.original_price ? yuanShort(service.original_price) : '',
          coverClass: coverTheme(service.id)
        },
        provider: provider
          ? {
              ...provider,
              initial: provider.nickname ? provider.nickname.charAt(0) : '影',
              ratingText: Number(provider.rating || 5).toFixed(1)
            }
          : null,
        reviews: reviews.map((r) => ({
          ...r,
          timeText: fromNow(r.created_at),
          initial: r.customer_name ? r.customer_name.charAt(0) : '客'
        })),
        samples: signed.map((s) => ({
          ...s,
          sizeText: s.file_size ? (s.file_size / 1024 / 1024).toFixed(1) + 'MB' : '',
          durationText: s.duration ? Math.round(s.duration) + ' 秒' : ''
        })),
        loading: false
      })
      wx.setNavigationBarTitle({ title: service.title })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  /** 播放样片 */
  onPlaySample(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const s = this.data.samples[idx]
    if (!s) return
    // 未登录时无法签名，看不了样片
    if (!s.url) {
      wx.showModal({
        title: '登录后观看样片',
        content: '样片需要登录后才能播放，登录还可以直接下单。',
        confirmText: '去登录',
        cancelText: '再看看',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/login/login' })
        }
      })
      return
    }
    if (s.media_type === 'video') {
      wx.previewMedia({
        sources: [{ url: s.url, type: 'video' }],
        current: 0
      })
    } else {
      wx.previewImage({
        current: s.url,
        urls: this.data.samples.filter((x) => x.media_type === 'image').map((x) => x.url)
      })
    }
  },

  onProviderTap() {
    if (!this.data.provider) return
    wx.navigateTo({ url: `/pages/services/services?provider=${this.data.provider.id}` })
  },

  /** 去下单 */
  onOrder() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({
      url: `/pages/order-create/order-create?serviceId=${this.data.service.id}&providerId=${this.data.service.provider_id}`
    })
  },

  onShareAppMessage() {
    const s = this.data.service
    return {
      title: s ? `${s.title} · 宁夏云辇文化科技有限公司` : '宁夏云辇文化科技有限公司',
      path: `/pages/service-detail/service-detail?id=${this.data.serviceId}`
    }
  }
})
