const merchant = require('../../utils/merchant')

Page({
  data: {
    task: null,
    applied: null,
    loading: true
  },

  onLoad(options) {
    this.taskId = options.id
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    try {
      const [task, apps] = await Promise.all([
        merchant.getTask(this.taskId),
        merchant.listMyApplications()
      ])
      this.setData({
        task,
        applied: apps.filter((a) => String(a.task_id) === String(this.taskId))[0] || null,
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onApply() {
    wx.showModal({
      title: '报名接单',
      content: '',
      editable: true,
      placeholderText: '例：做过 3 支同类品牌片，可先给一版分镜',
      confirmText: '提交报名',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '提交中' })
        try {
          await merchant.applyTask(Number(this.taskId), r.content || '')
          wx.hideLoading()
          wx.showToast({ title: '报名已提交', icon: 'success' })
          this.loadData()
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: e.message || '报名失败', icon: 'none' })
        }
      }
    })
  },

  onShop() {
    const id = this.data.task && this.data.task.merchant_id
    if (id) wx.navigateTo({ url: '/pages/merchant/merchant?id=' + id })
  },

  onAllTasks() {
    wx.navigateTo({ url: '/pages/merchants/merchants?tab=tasks' })
  }
})
