const merchant = require('../../utils/merchant')
const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    logged: false,
    shop: null,
    tasks: [],
    categories: [],
    catIndex: 0,
    form: {
      shopName: '', city: '银川', intro: '', contact: '', phone: '',
      title: '', budget: '', deadline: '', desc: '', videoUrl: ''
    },
    videoName: '',
    videoTempPath: '',
    videoSize: 0,
    submitting: false
  },

  onLoad() {
    this.init()
  },

  onPullDownRefresh() {
    this.init().finally(() => wx.stopPullDownRefresh())
  },

  async init() {
    try {
      const [uid, cats] = await Promise.all([
        merchant.currentUid(),
        api.listCategories().catch(() => [])
      ])
      this.setData({ logged: !!uid, categories: cats || [], loading: false })
      if (!uid) return
      const shop = await merchant.getMyMerchant()
      this.setData({ shop })
      if (shop) {
        const tasks = await merchant.listTasks({ merchantId: shop.id })
        this.setData({ tasks })
      }
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onInput(e) {
    const f = e.currentTarget.dataset.field
    this.setData({ ['form.' + f]: e.detail.value })
  },

  onCat(e) {
    this.setData({ catIndex: Number(e.detail.value) })
  },

  onDate(e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  onChooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 300,
      success: (r) => {
        const f = (r.tempFiles || [])[0]
        if (!f) return
        const size = Number(f.size) || 0
        if (size > 100 * 1024 * 1024) {
          wx.showToast({ title: '视频不能超过 100MB', icon: 'none' })
          return
        }
        this.setData({
          videoTempPath: f.tempFilePath,
          videoSize: size,
          videoName: (f.name || f.tempFilePath.split('/').pop() || '参考视频.mp4')
        })
      },
      fail: () => {}
    })
  },

  clearVideo() {
    this.setData({ videoTempPath: '', videoSize: 0, videoName: '' })
  },

  async onOpenShop() {
    const f = this.data.form
    if (String(f.shopName || '').trim().length < 2) {
      wx.showToast({ title: '请填写店铺名称', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '开通中' })
    try {
      await merchant.saveMerchant({
        name: f.shopName,
        city: f.city,
        intro: f.intro,
        contact_name: f.contact,
        contact_phone: f.phone,
        category_slug: (this.data.categories[this.data.catIndex] || {}).slug || ''
      })
      wx.hideLoading()
      wx.showToast({ title: '店铺已开通', icon: 'success' })
      this.init()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '开通失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onPublish() {
    const f = this.data.form
    if (String(f.title || '').trim().length < 4) {
      wx.showToast({ title: '任务标题至少 4 个字', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: this.data.videoTempPath ? '上传视频中' : '发布中' })
    try {
      await merchant.saveTask({
        title: f.title,
        description: f.desc,
        category_slug: (this.data.categories[this.data.catIndex] || {}).slug || '',
        budget: Math.round(Number(f.budget || 0) * 100),
        deadline: f.deadline || null,
        videoTempPath: this.data.videoTempPath,
        videoSize: this.data.videoSize,
        videoName: this.data.videoName,
        reference_video_path: String(f.videoUrl || '').trim()
      })
      wx.hideLoading()
      wx.showToast({ title: '任务已发布', icon: 'success' })
      this.setData({
        'form.title': '', 'form.budget': '', 'form.deadline': '', 'form.desc': '', 'form.videoUrl': '',
        videoTempPath: '', videoSize: 0, videoName: ''
      })
      this.init()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '发布失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onShopPage() {
    if (this.data.shop) wx.navigateTo({ url: '/pages/merchant/merchant?id=' + this.data.shop.id })
  },

  onTask(e) {
    wx.navigateTo({ url: '/pages/task/task?id=' + e.currentTarget.dataset.id })
  }
})
