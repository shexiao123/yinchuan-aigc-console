const demand = require('../../utils/demand')
const wallet = require('../../utils/wallet')
const reqForm = require('../../utils/req-form')
const reqTpl = require('../../utils/requirement-templates')
const guarantee = require('../../utils/guarantee')

const CATS = [
  { id: 1, name: '婚礼跟拍' },
  { id: 2, name: '婚礼微电影' },
  { id: 3, name: '品牌宣传片' },
  { id: 4, name: '短视频剪辑' },
  { id: 5, name: '商业摄影' },
  { id: 6, name: 'AE 动画' },
  { id: 7, name: 'AI 生成' },
  { id: 8, name: '漫剧制作' }
]

const DEADLINES = ['3 天内', '7 天内', '15 天内', '30 天内', '长期合作']

Page(Object.assign({}, reqForm.methods, {
  data: Object.assign({
    cats: CATS,
    catIdx: 0,
    deadlines: DEADLINES,
    deadlineIdx: 1,
    dueDate: guarantee.defaultDueAt(),
    minDue: guarantee.dateStr(new Date()),
    isMerchant: false,
    merchantName: '',
    title: '',
    requirement: '',
    budget: '',
    contact: '',
    submitting: false,
    balanceText: '0.00',
    canSubmit: false
  }, reqForm.data()),

  onLoad() {
    this.setReqCategory(CATS[0].id)
  },

  onShow() {
    const pub = guarantee.isRegisteredPublisher()
    this.setData({
      balanceText: wallet.summary().balanceText,
      isMerchant: pub.ok,
      merchantName: pub.name || ''
    }, () => this.check())
  },

  onDueChange(e) {
    this.setData({ dueDate: e.detail.value })
  },

  onGoMerchant() {
    wx.navigateTo({ url: '/pages/merchant-console/merchant-console' })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const patch = {}
    patch[field] = e.detail.value
    this.setData(patch, () => this.check())
  },

  /** 切换品类：动态换成该品类的专属需求字段，同名项保留已填值 */
  onCatChange(e) {
    const idx = Number(e.detail.value)
    this.setData({ catIdx: idx }, () => {
      this.setReqCategory(CATS[idx].id)
      this.check()
    })
  },

  onDeadlineChange(e) {
    this.setData({ deadlineIdx: Number(e.detail.value) })
  },

  /** mixin 在字段变化时回调，用于刷新底部按钮可用态 */
  onReqChange() {
    this.check()
  },

  check() {
    const basic = this.data.title.trim().length >= 4 && Number(this.data.budget) >= 100
    const reqOk = !reqTpl.validate(this.data.reqFields || [])
    this.setData({ canSubmit: basic && reqOk && this.data.isMerchant })
  },

  submit() {
    if (this.data.submitting) return
    if (!this.data.isMerchant) {
      wx.showModal({
        title: '需要先注册商家',
        content: '按平台规则，发布者必须是已注册的企业商家。是否前往注册 / 启用演示店铺？',
        confirmText: '去注册',
        success: (r) => { if (r.confirm) this.onGoMerchant() }
      })
      return
    }
    const title = this.data.title.trim()
    const budget = Number(this.data.budget)
    const err = this.reqValidate()
    if (title.length < 4) return wx.showToast({ title: '标题至少 4 个字', icon: 'none' })
    if (!(budget >= 100)) return wx.showToast({ title: '预算不能低于 100 元', icon: 'none' })
    if (err) return wx.showToast({ title: err, icon: 'none' })

    const req = this.reqPayload()
    this.setData({ submitting: true })
    try {
      demand.publish({
        title,
        budget: Math.round(budget * 100),
        // 规范文本写回原 requirement 字段，云端/老页面读到的是可读需求
        requirement: req.reqText,
        reqCatId: req.reqCatId,
        reqCatName: req.reqCatName,
        reqFields: req.reqFields,
        deadline: DEADLINES[this.data.deadlineIdx],
        dueAt: this.data.dueDate,
        categoryId: CATS[this.data.catIdx].id,
        categoryName: CATS[this.data.catIdx].name,
        customerName: this.data.contact.trim() || this.data.merchantName || '我'
      })
      wx.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) {
      this.setData({ submitting: false })
      wx.showModal({
        title: e && e.code === 'NOT_MERCHANT' ? '需要先注册商家' : '发布失败',
        content: (e && e.message) || '请稍后重试',
        confirmText: e && e.code === 'NOT_MERCHANT' ? '去注册' : '知道了',
        showCancel: !!(e && e.code === 'NOT_MERCHANT'),
        success: (r) => {
          if (e && e.code === 'NOT_MERCHANT' && r.confirm) this.onGoMerchant()
        }
      })
    }
  }
}))
