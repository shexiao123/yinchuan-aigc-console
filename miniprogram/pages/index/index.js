const api = require('../../utils/api')
const presence = require('../../utils/presence')
const notice = require('../../utils/notice')
const { coverTheme, yuanShort, fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    banners: [],
    categories: [],
    hotServices: [],
    providers: [],
    settings: null,
    loggedIn: false,
    onlineCount: '–',
    notices: [],
    noticeCurrent: 0
  },

  onLoad() {
    this.loadData()
    this.startOnlineBeat()
  },

  onShow() {
    const app = getApp()
    const loggedIn = !!(app.globalData.session && app.globalData.session.user)
    if (loggedIn !== this.data.loggedIn) {
      this.setData({ loggedIn })
    }
    // 从后台切回时立刻刷新在线数
    if (this._onlineStarted) this.reportOnline()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [banners, categories, hotServices, providers, notices] = await Promise.all([
        api.listBanners(),
        api.listCategories(),
        api.listServices({ limit: 6 }),
        api.listProviders(),
        notice.listAnnouncements()
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
        notices,
        noticeCurrent: 0,
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

  /** 企业商家：店铺与任务广场 */
  onMerchantEntry() {
    wx.navigateTo({ url: '/pages/merchants/merchants' })
  },

  /** 公告滚动栏：垂直轮播记录当前索引，点击看全文 */
  onNoticeChange(e) {
    this.setData({ noticeCurrent: e.detail.current || 0 })
  },

  onNoticeTap() {
    const a = this.data.notices[this.data.noticeCurrent]
    if (a) this.showNoticeDetail(a)
  },

  onNoticeAll() {
    const list = this.data.notices.slice(0, 6)
    if (!list.length) return
    wx.showActionSheet({
      itemList: list.map((a) => `${a.tag || '公告'} · ${a.title}`.slice(0, 24)),
      success: (res) => this.showNoticeDetail(list[res.tapIndex]),
      fail: () => {}
    })
  },

  showNoticeDetail(a) {
    if (!a) return
    wx.showModal({
      title: a.title.slice(0, 24),
      content: a.content || '（无详细内容）',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /** 平台在线人数：真实心跳，30 秒刷新，失败显示「–」 */
  async reportOnline() {
    const n = await presence.reportOnline('pages/index/index')
    const text = n == null ? '–' : String(n)
    if (this.data.onlineCount !== text) this.setData({ onlineCount: text })
  },

  startOnlineBeat() {
    this._onlineStarted = true
    this.reportOnline()
    this.clearOnlineBeat()
    this._onlineTimer = setInterval(() => this.reportOnline(), 30000)
  },

  clearOnlineBeat() {
    if (this._onlineTimer) {
      clearInterval(this._onlineTimer)
      this._onlineTimer = null
    }
  },

  onUnload() {
    this.clearOnlineBeat()
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
