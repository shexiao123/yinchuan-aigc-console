const demand = require('../../utils/demand')
const wallet = require('../../utils/wallet')

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

Page({
  data: {
    cats: CATS,
    catIdx: 0,
    deadlines: DEADLINES,
    deadlineIdx: 1,
    title: '',
    requirement: '',
    budget: '',
    contact: '',
    submitting: false,
    balanceText: '0.00',
    canSubmit: false
  },

  onShow() {
    this.setData({ balanceText: wallet.summary().balanceText })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const patch = {}
    patch[field] = e.detail.value
    this.setData(patch, () => this.check())
  },

  onCatChange(e) {
    this.setData({ catIdx: Number(e.detail.value) })
  },

  onDeadlineChange(e) {
    this.setData({ deadlineIdx: Number(e.detail.value) })
  },

  check() {
    const ok = this.data.title.trim().length >= 4 && Number(this.data.budget) >= 100 && this.data.requirement.trim().length >= 6
    this.setData({ canSubmit: ok })
  },

  submit() {
    if (this.data.submitting) return
    const title = this.data.title.trim()
    const budget = Number(this.data.budget)
    const requirement = this.data.requirement.trim()
    if (title.length < 4) return wx.showToast({ title: '标题至少 4 个字', icon: 'none' })
    if (!(budget >= 100)) return wx.showToast({ title: '预算不能低于 100 元', icon: 'none' })
    if (requirement.length < 6) return wx.showToast({ title: '需求描述再写细一点', icon: 'none' })

    this.setData({ submitting: true })
    try {
      demand.publish({
        title,
        budget: Math.round(budget * 100),
        requirement,
        deadline: DEADLINES[this.data.deadlineIdx],
        categoryId: CATS[this.data.catIdx].id,
        categoryName: CATS[this.data.catIdx].name,
        customerName: this.data.contact.trim() || '我'
      })
      wx.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) {
      this.setData({ submitting: false })
      wx.showModal({
        title: '发布失败',
        content: (e && e.message) || '请稍后重试',
        showCancel: false
      })
    }
  }
})
