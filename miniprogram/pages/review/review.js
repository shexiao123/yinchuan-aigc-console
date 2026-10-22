const api = require('../../utils/api')
const { yuan } = require('../../utils/util')

const RATING_TAGS = ['技术专业', '沟通顺畅', '守时准时', '交付及时', '有创意', '价格实惠']

Page({
  data: {
    loading: true,
    submitting: false,
    orderId: null,
    order: null,
    service: null,
    provider: null,
    rating: 5,
    ratingText: '非常满意',
    ratingStars: [1, 2, 3, 4, 5],
    content: '',
    tags: [],
    tagStates: {},
    allTags: RATING_TAGS,
    images: [],
    error: ''
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0)
    if (!id) {
      this.setData({ loading: false, error: '订单参数缺失' })
      return
    }
    this.setData({ orderId: id })
    this.loadData()
  },

  async loadData() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false, error: '请先登录后再评价' })
      return
    }
    try {
      const order = await api.getOrder(this.data.orderId)
      if (!order) {
        this.setData({ loading: false, error: '订单不存在' })
        return
      }
      if (order.customer_id !== session.user.id) {
        this.setData({ loading: false, error: '只有下单客户可以评价这单' })
        return
      }
      if (order.status !== 'completed') {
        this.setData({ loading: false, error: '订单完成后才能评价' })
        return
      }

      const [service, provider, existing] = await Promise.all([
        api.getService(order.service_id),
        order.provider_id ? api.getProvider(order.provider_id) : null,
        api.getReviewByOrder(this.data.orderId)
      ])

      this.setData({
        order: {
          ...order,
          amountText: yuan(order.amount)
        },
        service,
        provider: provider ? { ...provider, initial: provider.nickname ? provider.nickname.charAt(0) : '影' } : null,
        // 已评价过 → 回填原内容（支持修改）
        rating: existing ? existing.rating : 5,
        ratingText: existing ? this.ratingText(existing.rating) : '非常满意',
        content: existing ? existing.content || '' : '',
        tags: existing && Array.isArray(existing.tags) ? existing.tags : [],
        tagStates: this.buildTagStates(existing && Array.isArray(existing.tags) ? existing.tags : []),
        images: existing && Array.isArray(existing.images) ? existing.images : [],
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false, error: api.friendlyError(e) })
    }
  },

  ratingText(score) {
    return { 1: '很不满意', 2: '不太满意', 3: '一般', 4: '满意', 5: '非常满意' }[score] || '非常满意'
  },

  /** 把标签数组转成 { tag: true } 映射，供 WXML 直接取值（小程序不支持 indexOf） */
  buildTagStates(tags) {
    const map = {}
    ;(tags || []).forEach((t) => {
      map[t] = true
    })
    return map
  },

  onRatingTap(e) {
    const score = Number(e.currentTarget.dataset.score)
    this.setData({ rating: score, ratingText: this.ratingText(score) })
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/orders/orders' })
    })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value, error: '' })
  },

  onTagTap(e) {
    const tag = e.currentTarget.dataset.tag
    const tags = this.data.tags.slice()
    const idx = tags.indexOf(tag)
    if (idx >= 0) tags.splice(idx, 1)
    else if (tags.length < 3) tags.push(tag)
    else {
      wx.showToast({ title: '最多选 3 个标签', icon: 'none' })
      return
    }
    this.setData({ tags, tagStates: this.buildTagStates(tags) })
  },

  onAddImage() {
    if (this.data.images.length >= 3) {
      wx.showToast({ title: '最多上传 3 张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: 3 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map((f) => f.tempFilePath)
        if (!files.length) return
        this.setData({ images: this.data.images.concat(files).slice(0, 3) })
      }
    })
  },

  onRemoveImage(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const images = this.data.images.slice()
    images.splice(idx, 1)
    this.setData({ images })
  },

  onPreviewImage(e) {
    const idx = Number(e.currentTarget.dataset.index)
    wx.previewImage({ current: this.data.images[idx], urls: this.data.images })
  },

  onSubmit() {
    if (this.data.submitting) return
    const content = this.data.content.trim()
    if (content.length < 5) {
      this.setData({ error: '评价内容至少 5 个字' })
      return
    }
    this.setData({ submitting: true, error: '' })
    try {
      const app = getApp()
      const session = app.globalData.session
      api
        .createReview({
          orderId: this.data.orderId,
          serviceId: this.data.order.service_id,
          providerId: this.data.order.provider_id,
          rating: this.data.rating,
          content,
          tags: this.data.tags,
          images: this.data.images
        })
        .then(() => {
          wx.showToast({ title: '评价已提交', icon: 'success' })
          setTimeout(() => {
            wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${this.data.orderId}` })
          }, 900)
        })
        .catch((e) => {
          this.setData({ error: api.friendlyError(e), submitting: false })
        })
    } catch (e) {
      this.setData({ error: api.friendlyError(e), submitting: false })
    }
  }
})
