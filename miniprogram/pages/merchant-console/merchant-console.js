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
    // 付费入驻
    plans: [],
    planNames: [],
    planIndex: 0,
    payCfg: {},
    orders: [],
    pendingOrder: null,
    paid: false,
    payInfo: {},
    videoLimit: 100,
    payTxn: '',
    payRemark: '',
    proofTempPath: '',
    proofName: '',
    // 店铺 / 任务表单
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

  onShow() {
    if (this._loaded) this.init()
    this._loaded = true
  },

  onPullDownRefresh() {
    this.init().finally(() => wx.stopPullDownRefresh())
  },

  async init() {
    try {
      const [uid, cats, plans, payCfg, orders] = await Promise.all([
        merchant.currentUid(),
        api.listCategories().catch(() => []),
        merchant.listPlans().catch(() => []),
        merchant.getPayConfig().catch(() => ({})),
        merchant.listMyOrders().catch(() => [])
      ])
      const shop = uid ? await merchant.getMyMerchant() : null
      const info = merchant.paidInfo(shop)
      const planList = plans || []
      const orderList = orders || []
      const preferred = planList.findIndex((p) => p.code === 'pro')
      const pendingOrder = orderList.filter((o) => o.status === 'pending')[0] || null
      let tasks = []
      if (shop && info.paid) tasks = await merchant.listTasks({ merchantId: shop.id })
      this.setData({
        logged: !!uid,
        shop,
        tasks,
        categories: cats || [],
        plans: planList,
        planNames: planList.map((p) => p.name + ' · ' + p.totalText),
        planIndex: preferred >= 0 ? preferred : 0,
        payCfg: payCfg || {},
        orders: orderList,
        pendingOrder,
        paid: info.paid,
        payInfo: info,
        videoLimit: (shop && shop.video_limit_mb) || 100,
        payTxn: pendingOrder ? (pendingOrder.transaction_id || '') : '',
        payRemark: pendingOrder ? (pendingOrder.remark || '') : '',
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  currentPlanId() {
    const p = this.data.plans[this.data.planIndex]
    return p ? p.id : 0
  },

  onInput(e) {
    const f = e.currentTarget.dataset.field
    this.setData({ ['form.' + f]: e.detail.value })
  },

  onCat(e) {
    this.setData({ catIndex: Number(e.detail.value) })
  },

  onJoinPlan(e) {
    this.setData({ planIndex: Number(e.detail.value) })
  },

  onDate(e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  onPayTxn(e) {
    this.setData({ payTxn: e.detail.value })
  },

  onPayRemark(e) {
    this.setData({ payRemark: e.detail.value })
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
        if (size > this.data.videoLimit * 1024 * 1024) {
          wx.showToast({ title: `视频不能超过 ${this.data.videoLimit}MB`, icon: 'none' })
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

  onChooseProof() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (r) => {
        const f = (r.tempFiles || [])[0]
        if (!f) return
        this.setData({ proofTempPath: f.tempFilePath, proofName: '已选择付款凭证' })
      },
      fail: () => {}
    })
  },

  async onOpenShop() {
    const f = this.data.form
    if (String(f.shopName || '').trim().length < 2) {
      wx.showToast({ title: '请填写店铺名称', icon: 'none' })
      return
    }
    const planId = this.currentPlanId()
    if (!planId) {
      wx.showToast({ title: '请先选择入驻套餐', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中' })
    try {
      const shop = await merchant.saveMerchant({
        name: f.shopName,
        city: f.city,
        intro: f.intro,
        contact_name: f.contact,
        contact_phone: f.phone,
        category_slug: (this.data.categories[this.data.catIndex] || {}).slug || ''
      })
      await merchant.createOrder(planId, shop.id)
      wx.hideLoading()
      wx.showToast({ title: '资料已提交，订单已生成', icon: 'none' })
      this.init()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onCreateOrder() {
    const planId = this.currentPlanId()
    if (!planId || !this.data.shop) {
      wx.showToast({ title: '请先选择入驻套餐', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '生成订单' })
    try {
      await merchant.createOrder(planId, this.data.shop.id)
      wx.hideLoading()
      wx.showToast({ title: '缴费订单已生成', icon: 'success' })
      this.init()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '生成失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onPaySubmit() {
    const o = this.data.pendingOrder
    if (!o) return
    const txn = String(this.data.payTxn || '').trim()
    if (!txn && !this.data.proofTempPath && !o.payment_proof_path) {
      wx.showToast({ title: '请填写流水号或上传凭证', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中' })
    try {
      let proofPath = o.payment_proof_path || ''
      if (this.data.proofTempPath) {
        try {
          proofPath = await merchant.uploadProof(this.data.proofTempPath)
        } catch (e) {
          wx.showToast({ title: '凭证上传失败，已提交文字信息', icon: 'none' })
        }
      }
      await merchant.submitPayment(o.id, txn, this.data.payRemark, proofPath)
      wx.hideLoading()
      wx.showToast({ title: '已提交，等待平台确认', icon: 'success' })
      this.setData({ proofTempPath: '', proofName: '' })
      this.init()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onRenew() {
    if (this.data.pendingOrder) {
      wx.showToast({ title: '已有待审核的缴费订单', icon: 'none' })
      return
    }
    const planId = this.currentPlanId()
    if (!planId || !this.data.shop) {
      wx.showToast({ title: '请先选择入驻套餐', icon: 'none' })
      return
    }
    wx.showLoading({ title: '生成订单' })
    try {
      await merchant.createOrder(planId, this.data.shop.id)
      wx.hideLoading()
      wx.showToast({ title: '续费订单已生成', icon: 'none' })
      this.init()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '生成失败', icon: 'none' })
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

  onJoin() {
    wx.navigateTo({ url: '/pages/merchant-join/merchant-join' })
  },

  onShopPage() {
    if (this.data.shop) wx.navigateTo({ url: '/pages/merchant/merchant?id=' + this.data.shop.id })
  },

  onTask(e) {
    wx.navigateTo({ url: '/pages/task/task?id=' + e.currentTarget.dataset.id })
  }
})
