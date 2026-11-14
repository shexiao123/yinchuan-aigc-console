const api = require('../../utils/api')
const presence = require('../../utils/presence')
const notice = require('../../utils/notice')
const media = require('../../utils/local-media')
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

  /**
   * 每一项单独降级：云数据库某一张表连不上时不影响其他板块，
   * 首页的轮播 / 分类 / 服务插图始终有画面（包内本地插画）。
   */
  async loadData() {
    this.setData({ loading: true })
    const safe = (p, fallback) => Promise.resolve(p).catch(() => fallback)
    const [banners, categories, hotServices, providers, notices, settings] = await Promise.all([
      safe(api.listBanners(), media.demoBanners()),
      safe(api.listCategories(), media.demoCategories()),
      safe(api.listServices({ limit: 6 }), media.demoServices()),
      safe(api.listProviders(), []),
      safe(notice.listAnnouncements(), []),
      safe(api.getSettings(), null)
    ])
    const app = getApp()
    this.setData({
      banners: (banners.length ? banners : media.demoBanners()).map((b, i) => ({
        ...b,
        themeClass: `banner-${b.theme || 'amber'}`,
        // 用 api 层已解析好的地址（包内本地图 / 云存储签名地址）。
        // 不能再回退去读原始 image_url——那是网页端外链，小程序会裂图。
        imageUrl: b.imageUrl || media.bannerImage(b, i),
        localImage: b.localImage || media.bannerImage(b, i),
        hasImage: true
      })),
      categories: (categories.length ? categories : media.demoCategories()).map((c) => ({
        ...c,
        imageUrl: c.imageUrl || media.coverFor(c),
        localImage: c.localImage || media.coverFor(c)
      })),
      hotServices: (hotServices.length ? hotServices : media.demoServices()).slice(0, 6).map((s) => ({
        ...s,
        priceText: yuanShort(s.price),
        oldPriceText: s.original_price ? yuanShort(s.original_price) : '',
        coverClass: coverTheme(s.id),
        coverUrl: s.coverUrl || media.squareFor(s),
        localCover: s.localCover || media.squareFor(s),
        coverUrlWide: s.coverUrlWide || media.coverFor(s)
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
  },

  /** 外链封面加载失败时立刻换包内插画，绝不留白 */
  onImageFallback: media.makeImageFallback(),

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
