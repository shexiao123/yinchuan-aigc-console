const merchant = require('../../utils/merchant')
const chain = require('../../utils/taskchain')
const reqTpl = require('../../utils/requirement-templates')
const guarantee = require('../../utils/guarantee')

Page({
  data: {
    task: null,
    applied: null,
    loading: true,
    isLocal: false,
    isOwner: false,
    canDeliver: false,
    guarantee: null,
    deliveryName: '',
    deliveryTempPath: '',
    submitting: false
  },

  onLoad(options) {
    this.taskId = options.id
    this.loadData()
  },

  onShow() {
    if (this._loaded) this.loadData()
    this._loaded = true
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    const local = chain.isLocalId(this.taskId)
    try {
      let task = null
      let applied = null
      if (local) {
        task = chain.getTask(this.taskId)
        applied = chain.myApplication(this.taskId)
      } else {
        const [cloudTask, apps] = await Promise.all([
          merchant.getTask(this.taskId).catch(() => null),
          merchant.listMyApplications().catch(() => [])
        ])
        task = cloudTask
        applied = (apps || []).filter((a) => String(a.task_id) === String(this.taskId))[0] || null
      }
      if (task) {
        const merchantObj = task.merchant || null
        task.merchantInitial = merchantObj
          ? (String(merchantObj.name || '商').charAt(0))
          : (String(task.merchantName || '商').charAt(0))
        task.merchantCity = merchantObj ? (merchantObj.city || '银川') : (task.merchantName || '本机店铺')
        task.statusText = task.statusText || (task.status === 'open' ? '招募中' : '已结束')
        task.timelineText = (task.timeline || []).map((t) => ({
          ...t,
          timeText: String(t.at || '').slice(5, 16).replace('T', ' ')
        }))
        // 云端任务没有 decorate，这里统一补齐结构化需求行
        if (!task.hasReqRows) {
          const rows = reqTpl.buildRows(task)
          task.reqRows = rows
          task.hasReqRows = rows.length > 0
        }
      }
      const owner = local && !!chain.getMerchant()
      const selected = task && (task.selectedApplicant || '')
      const canDeliver = !!(local && !owner && (applied && applied.status === 'selected' || selected))
      // 进入项目即判定逾期违约，并把履约档案带给页面
      let gp = null
      if (local) {
        chain.syncOverdue(this.taskId)
        if (task && task.guaranteeId) gp = guarantee.get(task.guaranteeId)
        task = chain.getTask(this.taskId) || task
        if (task) {
          task.timelineText = (task.timeline || []).map((t) => ({
            ...t,
            timeText: String(t.at || '').slice(5, 16).replace('T', ' ')
          }))
        }
      }
      this.setData({
        task,
        applied,
        isLocal: local,
        isOwner: owner,
        canDeliver: canDeliver && !(gp && gp.status === 'breached'),
        guarantee: gp,
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  act(fn, okText) {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      fn()
      wx.showToast({ title: okText || '操作成功', icon: 'success' })
      this.loadData()
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
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
        if (this.data.isLocal) {
          this.act(() => chain.applyTask(this.taskId, r.content || ''), '报名已提交')
          return
        }
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

  /* ---------------- 商家侧：选定承接方 / 验收 / 关闭 ---------------- */

  onSelectApplicant(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '该服务者'
    wx.showModal({
      title: '选定承接方',
      content: `确定由「${name}」承接？任务将进入制作中，其他报名自动标记未入选。`,
      success: (r) => {
        if (r.confirm) this.act(() => chain.selectApplicant(this.taskId, id), '已选定，开始制作')
      }
    })
  },

  onAccept() {
    wx.showModal({
      title: '验收通过',
      content: '确认成片符合需求？验收后任务完成，不可再打回。',
      success: (r) => {
        if (r.confirm) this.act(() => chain.acceptTask(this.taskId, '商家验收通过'), '任务已完成')
      }
    })
  },

  /** 审核不通过必须填「修改意见 + 新提交日期」，统一走交付页的完整表单 */
  onReject() {
    wx.navigateTo({ url: `/pages/delivery/delivery?source=task&id=${encodeURIComponent(this.taskId)}` })
  },

  /** 每个项目的统一上传 / 审核通道（云端任务也走本地履约档案，演示记账） */
  onDeliveryChannel() {
    wx.navigateTo({ url: `/pages/delivery/delivery?source=task&id=${encodeURIComponent(this.taskId)}` })
  },

  onCancelTask() {
    wx.showModal({
      title: '关闭任务',
      content: '关闭后任务不再招募，确定吗？',
      confirmText: '关闭任务',
      success: (r) => {
        if (r.confirm) this.act(() => chain.cancelTask(this.taskId, '商家主动关闭'), '任务已关闭')
      }
    })
  },

  /* ---------------- 承接方侧：上传成片 ---------------- */

  onChooseDelivery() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 300,
      success: (r) => {
        const f = (r.tempFiles || [])[0]
        if (!f) return
        if (Number(f.size || 0) > 100 * 1024 * 1024) {
          wx.showToast({ title: '成片不能超过 100MB', icon: 'none' })
          return
        }
        this.setData({
          deliveryTempPath: f.tempFilePath,
          deliveryName: f.name || f.tempFilePath.split('/').pop() || '成片.mp4'
        })
      },
      fail: () => {}
    })
  },

  clearDelivery() {
    this.setData({ deliveryTempPath: '', deliveryName: '' })
  },

  onDeliver() {
    if (!this.data.deliveryTempPath) {
      wx.showToast({ title: '请先选择成片视频', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存视频中' })
    this.act(() => {
      wx.hideLoading()
      chain.deliverTask(this.taskId, {
        videoTempPath: this.data.deliveryTempPath,
        videoName: this.data.deliveryName
      })
      this.setData({ deliveryTempPath: '', deliveryName: '' })
    }, '成片已交付')
  },

  onShop() {
    const id = this.data.task && this.data.task.merchant_id
    if (id) wx.navigateTo({ url: '/pages/merchant/merchant?id=' + id })
  },

  onAllTasks() {
    wx.navigateTo({ url: '/pages/merchants/merchants?tab=tasks' })
  }
})
