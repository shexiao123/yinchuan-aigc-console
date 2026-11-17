const merchant = require('../../utils/merchant')
const api = require('../../utils/api')
const chain = require('../../utils/taskchain')
const reqForm = require('../../utils/req-form')

const FALLBACK_CATS = [
  { name: '短视频剪辑', slug: 'short-video' },
  { name: 'AI 生成 / 修图', slug: 'ai-create' },
  { name: '婚礼跟拍', slug: 'wedding' },
  { name: '漫剧 / 动画', slug: 'comic' },
  { name: '品牌宣传片', slug: 'brand-film' },
  { name: '其他', slug: 'other' }
]

Page(Object.assign({}, reqForm.methods, {
  data: Object.assign({
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
    cloudPaid: false,
    demoPaid: false,
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
  }, reqForm.data()),

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
    const localShop = chain.getMerchant()
    const localTasks = chain.listTasks()
    const demoInfo = chain.paidInfo()
    try {
      const [uid, cats, plans, payCfg, orders] = await Promise.all([
        merchant.currentUid(),
        api.listCategories().catch(() => []),
        merchant.listPlans().catch(() => []),
        merchant.getPayConfig().catch(() => ({})),
        merchant.listMyOrders().catch(() => [])
      ])
      const cloudShop = uid ? await merchant.getMyMerchant().catch(() => null) : null
      const cloudInfo = merchant.paidInfo(cloudShop)
      const shop = cloudShop || localShop
      const planList = plans || []
      const orderList = orders || []
      const preferred = planList.findIndex((p) => p.code === 'pro')
      const pendingOrder = orderList.filter((o) => o.status === 'pending')[0] || null
      let cloudTasks = []
      if (cloudShop && cloudInfo.paid) {
        cloudTasks = await merchant.listTasks({ merchantId: cloudShop.id }).catch(() => [])
      }
      this.setData({
        logged: !!uid || !!localShop,
        shop,
        tasks: localTasks.concat(cloudTasks || []),
        categories: (cats && cats.length ? cats : FALLBACK_CATS),
        plans: planList,
        planNames: planList.length ? planList.map((p) => p.name + ' · ' + p.totalText) : ['演示套餐 · 免付费'],
        planIndex: preferred >= 0 ? preferred : 0,
        payCfg: payCfg || {},
        orders: orderList,
        pendingOrder,
        paid: cloudInfo.paid || demoInfo.active,
        cloudPaid: cloudInfo.paid,
        demoPaid: !cloudInfo.paid && demoInfo.active,
        payInfo: cloudInfo.paid ? cloudInfo : demoInfo,
        videoLimit: (cloudShop && cloudShop.video_limit_mb) || 100,
        payTxn: pendingOrder ? (pendingOrder.transaction_id || '') : '',
        payRemark: pendingOrder ? (pendingOrder.remark || '') : '',
        loading: false
      }, () => this.syncReqCategory())
    } catch (e) {
      // 云端整体不可用时，仍要保证本地工作台可用
      this.setData({
        logged: !!localShop,
        shop: localShop,
        tasks: localTasks,
        categories: FALLBACK_CATS,
        planNames: ['演示套餐 · 免付费'],
        paid: demoInfo.active,
        cloudPaid: false,
        demoPaid: demoInfo.active,
        payInfo: demoInfo,
        loading: false
      }, () => this.syncReqCategory())
    }
  },

  /** 品类可能来自云端或 FALLBACK，统一交给模板层按 slug/id/中文名解析 */
  syncReqCategory() {
    const cat = (this.data.categories || [])[this.data.catIndex] || {}
    // 只在品类真正变化时重建字段，避免 onShow 反复刷新把用户已填内容清掉
    if (this._reqCatKey && this._reqCatKey === (cat.slug || cat.name || cat.id)) return
    this._reqCatKey = cat.slug || cat.name || cat.id
    this.setReqCategory(cat)
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
    const idx = Number(e.detail.value)
    this.setData({ catIndex: idx }, () => {
      this._reqCatKey = null
      this.syncReqCategory()
    })
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
          videoName: f.name || f.tempFilePath.split('/').pop() || '参考视频.mp4'
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

  /** 入驻：本地资料必写成功，云端只做尽力同步，不再卡住流程 */
  async onOpenShop() {
    const f = this.data.form
    if (String(f.shopName || '').trim().length < 2) {
      wx.showToast({ title: '请填写店铺名称', icon: 'none' })
      return
    }
    const cat = this.data.categories[this.data.catIndex] || {}
    const plan = this.data.plans[this.data.planIndex] || {}
    const payload = {
      name: f.shopName,
      city: f.city,
      intro: f.intro,
      contact_name: f.contact,
      contact_phone: f.phone,
      category_slug: cat.slug || '',
      planCode: plan.code || 'demo'
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中' })
    let cloudOk = false
    try {
      chain.saveMerchant(payload)
      try {
        const shop = await merchant.saveMerchant(payload)
        const planId = this.currentPlanId()
        if (planId && shop && shop.id) await merchant.createOrder(planId, shop.id)
        cloudOk = true
      } catch (e) {
        console.warn('[merchant-console] cloud join skipped', e && e.message)
      }
      wx.hideLoading()
      wx.showToast({
        title: cloudOk ? '资料已提交，订单已生成' : '资料已保存（本地演示）',
        icon: 'none'
      })
      await this.init()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 开店表单里一步到位：保存资料 + 启用演示店铺 */
  onDemoJoin() {
    const f = this.data.form
    if (String(f.shopName || '').trim().length < 2) {
      wx.showToast({ title: '请填写店铺名称', icon: 'none' })
      return
    }
    const cat = this.data.categories[this.data.catIndex] || {}
    const plan = this.data.plans[this.data.planIndex] || {}
    wx.showModal({
      title: '启用演示店铺',
      content: '仅在本机启用：不产生真实付款、不改变云端审核状态、任务不会同步给其他用户。启用后可立即发布任务与上传参考视频。',
      confirmText: '立即启用',
      success: (r) => {
        if (!r.confirm) return
        chain.saveMerchant({
          name: f.shopName, city: f.city, intro: f.intro,
          contact_name: f.contact, contact_phone: f.phone,
          category_slug: cat.slug || '', planCode: plan.code || 'demo'
        })
        chain.activateDemo(plan.code || 'demo')
        wx.showToast({ title: '演示店铺已启用', icon: 'success' })
        this.init()
      }
    })
  },

  /**
   * 演示开通：平台缴费审核在后台完成，小程序端无法自行激活。
   * 这里给出一个明确标注的本地演示通道，让「发布任务 / 上传视频」可以立即试用。
   */
  onDemoActivate() {
    wx.showModal({
      title: '启用演示店铺',
      content: '仅在本机启用演示态：不产生真实付款、不改变云端审核状态、任务不会同步给其他用户。确定启用后立即可以发布任务和上传视频。',
      confirmText: '启用演示',
      success: (r) => {
        if (!r.confirm) return
        const plan = this.data.plans[this.data.planIndex] || {}
        chain.activateDemo(plan.code || 'demo')
        wx.showToast({ title: '演示店铺已启用', icon: 'success' })
        this.init()
      }
    })
  },

  async onCreateOrder() {
    const planId = this.currentPlanId()
    const shop = this.data.shop
    if (!planId || !shop || /^(shop|local)-/.test(String(shop.id || ''))) {
      wx.showModal({
        title: '需要云端审核',
        content: '当前是本机演示店铺，正式缴费订单需云端店铺。可先「启用演示店铺」试用发布任务与上传视频。',
        showCancel: false
      })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '生成订单' })
    try {
      await merchant.createOrder(planId, shop.id)
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
    if (!planId || !this.data.shop || /^(shop|local)-/.test(String(this.data.shop.id || ''))) {
      wx.showToast({ title: '演示店铺无需续费', icon: 'none' })
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

  /** 发布任务：本地必成（含参考视频），云端仅在真实缴费店铺下尽力同步 */
  async onPublish() {
    const f = this.data.form
    if (String(f.title || '').trim().length < 4) {
      wx.showToast({ title: '任务标题至少 4 个字', icon: 'none' })
      return
    }
    const err = this.reqValidate()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    const cat = this.data.categories[this.data.catIndex] || {}
    const req = this.reqPayload()
    const payload = {
      title: f.title,
      // 规范文本写回原 description 字段，云端商家任务无需改表结构
      description: req.reqText,
      category_slug: cat.slug || req.reqCategorySlug || '',
      reqCatId: req.reqCatId,
      reqCatName: req.reqCatName,
      reqFields: req.reqFields,
      budget: Math.round(Number(f.budget || 0) * 100),
      deadline: f.deadline || '',
      videoTempPath: this.data.videoTempPath,
      videoSize: this.data.videoSize,
      videoName: this.data.videoName,
      videoUrl: String(f.videoUrl || '').trim()
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: this.data.videoTempPath ? '保存视频中' : '发布中' })
    let published
    try {
      published = chain.publishTask(payload)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '发布失败', icon: 'none' })
      this.setData({ submitting: false })
      return
    }

    let cloudMsg = ''
    if (this.data.cloudPaid) {
      try {
        await merchant.saveTask({
          title: payload.title,
          description: payload.description,
          category_slug: payload.category_slug,
          budget: payload.budget,
          deadline: payload.deadline || null,
          videoTempPath: this.data.videoTempPath,
          videoSize: this.data.videoSize,
          videoName: this.data.videoName,
          reference_video_path: payload.videoUrl
        })
        cloudMsg = '，已同步云端'
      } catch (e) {
        console.warn('[merchant-console] cloud publish skipped', e && e.message)
        cloudMsg = '，云端同步失败（本地已保存）'
      }
    }
    wx.hideLoading()
    wx.showToast({ title: '任务已发布' + cloudMsg, icon: 'none' })
    this.setData({
      'form.title': '', 'form.budget': '', 'form.deadline': '', 'form.desc': '', 'form.videoUrl': '',
      videoTempPath: '', videoSize: 0, videoName: ''
    })
    this.resetReqFields()
    await this.init()
    this.setData({ submitting: false })
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
}))
