const api = require('../../utils/api')
const samples = require('../../utils/samples')

Page({
  data: {
    mode: 'service',
    submitting: false,
    categories: [],
    categoryIndex: 0,
    formError: '',

    // 身份表单
    nickname: '',
    bio: '',
    city: '银川',
    tagsText: '',

    // 服务表单
    title: '',
    subtitle: '',
    description: '',
    priceYuan: '',
    originalPriceYuan: '',
    unit: '单',
    duration: '',
    deliveryDays: '7',
    tagsText: '',
    coverUrl: '',
    coverPath: '',
    uploadingCover: false
  },

  onLoad(options) {
    const mode = (options && options.mode) === 'identity' ? 'identity' : 'service'
    this.setData({ mode })
    wx.setNavigationBarTitle({ title: mode === 'identity' ? '申请成为服务者' : '上架服务' })
    if (mode === 'service') this.loadCategories()
  },

  async loadCategories() {
    try {
      const categories = await api.listCategories()
      this.setData({ categories })
    } catch (e) {
      console.error('[publish] loadCategories failed', JSON.stringify({ message: e.message }))
    }
  },

  onCategoryChange(e) {
    this.setData({ categoryIndex: Number(e.detail.value) })
  },

  onNicknameInput(e) { this.setData({ nickname: e.detail.value, formError: '' }) },
  onBioInput(e) { this.setData({ bio: e.detail.value }) },
  onCityInput(e) { this.setData({ city: e.detail.value }) },
  onIdentityTagsInput(e) { this.setData({ tagsText: e.detail.value }) },

  onTitleInput(e) { this.setData({ title: e.detail.value, formError: '' }) },
  /* ---------------- 服务封面 ---------------- */

  async onPickCover() {
    if (this.data.uploadingCover) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const f = (res.tempFiles || [])[0]
        if (!f) return
        if (f.size > 5 * 1024 * 1024) {
          wx.showToast({ title: '封面不能超过 5MB', icon: 'none' })
          return
        }
        this.setData({ uploadingCover: true })
        try {
          const provider = await this.getProvider()
          const ownerSegment = (provider && provider.owner_id) || 'platform'
          const path = await samples.uploadImageFile(f.tempFilePath, 'covers', ownerSegment)
          const url = await samples.signedUrl(path, 7200)
          this.setData({ coverUrl: url, coverPath: path, formError: '' })
        } catch (e) {
          wx.showToast({ title: e.message || '封面上传失败', icon: 'none' })
        } finally {
          this.setData({ uploadingCover: false })
        }
      },
      fail: (err) => {
        const msg = String(err.errMsg || '')
        if (!msg.includes('cancel')) {
          wx.showToast({ title: '选择图片失败', icon: 'none' })
        }
      }
    })
  },

  onRemoveCover() {
    this.setData({ coverUrl: '', coverPath: '' })
  },

  /** 取当前服务者（用于确定封面的存储归属） */
  async getProvider() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) return null
    try {
      return app.globalData.provider || (await api.getMyProvider(session.user.id))
    } catch (e) {
      return null
    }
  },
  onSubtitleInput(e) { this.setData({ subtitle: e.detail.value }) },
  onDescriptionInput(e) { this.setData({ description: e.detail.value }) },
  onPriceInput(e) { this.setData({ priceYuan: e.detail.value, formError: '' }) },
  onOriginalPriceInput(e) { this.setData({ originalPriceYuan: e.detail.value }) },
  onUnitInput(e) { this.setData({ unit: e.detail.value }) },
  onDurationInput(e) { this.setData({ duration: e.detail.value }) },
  onDeliveryDaysInput(e) { this.setData({ deliveryDays: e.detail.value }) },
  onTagsInput(e) { this.setData({ tagsText: e.detail.value }) },

  parseTags(text) {
    return String(text || '')
      .split(/[,，、\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 6)
  },

  /** 提交服务者申请 */
  async onSubmitIdentity() {
    if (this.data.submitting) return
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const nickname = this.data.nickname.trim()
    if (!nickname) {
      this.setData({ formError: '请填写服务者名称' })
      return
    }
    this.setData({ submitting: true, formError: '' })
    try {
      await api.applyProvider(
        {
          nickname,
          bio: this.data.bio.trim(),
          city: this.data.city.trim() || '银川',
          tags: this.parseTags(this.data.tagsText)
        },
        session.user.id,
        session.user.name || null
      )
      wx.showToast({ title: '申请已提交', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack({
          fail: () => wx.switchTab({ url: '/pages/studio/studio' })
        })
      }, 1000)
    } catch (e) {
      this.setData({ submitting: false })
      const msg = api.friendlyError(e)
      this.setData({ formError: msg })
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  /** 上架服务 */
  async onSubmitService() {
    if (this.data.submitting) return
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const provider = app.globalData.provider
    if (!provider) {
      this.setData({ formError: '请先申请成为服务者' })
      return
    }
    const title = this.data.title.trim()
    const price = Math.round(Number(this.data.priceYuan) * 100)
    if (!title) {
      this.setData({ formError: '请填写服务名称' })
      return
    }
    if (!price || price <= 0) {
      this.setData({ formError: '请填写有效的价格' })
      return
    }
    const category = this.data.categories[this.data.categoryIndex]
    if (!category) {
      this.setData({ formError: '请选择服务分类' })
      return
    }

    this.setData({ submitting: true, formError: '' })
    try {
      await api.publishService({
        provider_id: provider.id,
        category_id: category.id,
        title,
        subtitle: this.data.subtitle.trim(),
        description: this.data.description.trim(),
        cover_url: this.data.coverPath || null,
        price,
        original_price: this.data.originalPriceYuan
          ? Math.round(Number(this.data.originalPriceYuan) * 100)
          : null,
        unit: this.data.unit.trim() || '单',
        duration: this.data.duration.trim(),
        delivery_days: Number(this.data.deliveryDays) || 7,
        tags: this.parseTags(this.data.tagsText),
        rating: 5.0,
        sales_count: 0,
        status: 'on'
      })
      wx.showToast({ title: '上架成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack({
          fail: () => wx.switchTab({ url: '/pages/studio/studio' })
        })
      }, 800)
    } catch (e) {
      this.setData({ submitting: false })
      const msg = api.friendlyError(e)
      this.setData({ formError: msg })
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  onSubmit() {
    if (this.data.mode === 'identity') {
      this.onSubmitIdentity()
    } else {
      this.onSubmitService()
    }
  }
})
