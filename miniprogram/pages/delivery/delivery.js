/**
 * 项目交付通道（统一页）
 *
 * 三套单子（本地需求池 / 商家任务 / 云端订单）都从这里上传成片、由发布者审核：
 *  - 上传成片：wx.chooseMedia → 本地永久路径 → 履约档案 + 各数据层同步
 *  - 审核通过：无需写意见，双方保证金自动返还原支付账户
 *  - 审核不通过：必须填「修改意见 + 新的提交日期」，缺一不可
 *  - 逾期未交付：进入页面即自动扣除违约金（平台 / 发布者按规则分账）
 *
 * 本机演示态不区分登录身份，页面同时展示上传与审核两个区块，
 * 由「你同时扮演发布者与接单者」的说明标注清楚。
 */
const guarantee = require('../../utils/guarantee')
const demand = require('../../utils/demand')
const chain = require('../../utils/taskchain')
const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    source: 'task',
    refId: '',
    project: null,
    deliveryTempPath: '',
    deliveryName: '',
    deliveryNote: '',
    showReject: false,
    rejectOpinion: '',
    rejectDue: '',
    minDue: '',
    submitting: false,
    errText: ''
  },

  onLoad(options) {
    const source = String((options && options.source) || 'task')
    const refId = String((options && options.id) || '')
    const minDue = guarantee.dateStr(new Date())
    this.setData({ source, refId, minDue, rejectDue: guarantee.defaultDueAt() })
    this.loadData()
  },

  onShow() {
    if (this._loaded) this.loadData()
    this._loaded = true
  },

  onPullDownRefresh() {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  /** 履约档案 id 以各数据层实际记录为准，不能简单用 source:id 拼 */
  resolvePid() {
    if (this.data.source === 'demand') {
      const it = demand.getLocal(this.data.refId)
      return (it && it.guaranteeId) || guarantee.projectId('demand', this.data.refId)
    }
    if (this.data.source === 'task') {
      const t = chain.getTask(this.data.refId)
      return (t && t.guaranteeId) || guarantee.projectId('task', this.data.refId)
    }
    return guarantee.projectId('order', this.data.refId)
  },

  loadData() {
    const pid = this.resolvePid()
    if (!guarantee.get(pid)) {
      // 老单/历史单第一次进入：懒建档案，不冻结资金
      const src = this.data.source
      let title = '项目 #' + this.data.refId
      let budget = 0
      let dueAt = guarantee.defaultDueAt()
      let publisherName = '发布商家'
      if (src === 'demand') {
        const it = demand.getLocal(this.data.refId)
        if (it) { title = it.title; budget = it.budget; dueAt = it.dueAt || demand.dueAtFrom(it.deadline); publisherName = it.customerName || publisherName }
      } else if (src === 'task') {
        const t = chain.getTask(this.data.refId)
        if (t) { title = t.title; budget = t.budget; dueAt = t.dueAt || dueAt; publisherName = t.merchantName || publisherName }
      }
      guarantee.ensureProject({
        projectId: pid, source: src, refId: this.data.refId,
        title, budget, publisherName, dueAt
      })
    }
    // 进入项目即判定逾期；扣款在 guarantee 内落库
    guarantee.checkOverdue(pid)
    if (this.data.source === 'task') chain.syncOverdue(this.data.refId)
    const project = guarantee.get(pid)
    this.setData({ project, loading: false, errText: '' })
  },

  /** 统一操作入口：按来源分发到各自数据层，本地动作必成、云端尽力同步 */
  run(label, fn, cloudFn) {
    if (this.data.submitting) return
    this.setData({ submitting: true, errText: '' })
    try {
      fn()
      if (cloudFn) Promise.resolve().then(cloudFn).catch((e) => console.warn('[delivery] cloud sync skipped', e && e.message))
      wx.showToast({ title: label, icon: 'success' })
      this.loadData()
    } catch (e) {
      const msg = (e && e.message) || '操作失败'
      this.setData({ errText: msg })
      wx.showToast({ title: msg, icon: 'none' })
      // 逾期扣款后状态已变，重新拉一次
      this.loadData()
    } finally {
      this.setData({ submitting: false })
    }
  },

  /* ---------------- 承接方：上传成片 ---------------- */

  onChooseVideo() {
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

  clearVideo() {
    this.setData({ deliveryTempPath: '', deliveryName: '' })
  },

  onNote(e) {
    this.setData({ deliveryNote: e.detail.value })
  },

  onUpload() {
    if (!this.data.deliveryTempPath) {
      wx.showToast({ title: '请先选择成片视频', icon: 'none' })
      return
    }
    const pid = this.resolvePid()
    const src = this.data.source
    const id = this.data.refId
    const name = this.data.deliveryName || '成片.mp4'
    const note = String(this.data.deliveryNote || '').trim()
    // 保存到本机永久路径（失败则退回临时路径，本次仍可播放）
    const path = chain.persistVideo(this.data.deliveryTempPath, 'delivery')
    this.run('作品已提交，等待审核', () => {
      if (src === 'demand') {
        demand.deliver(id, { videoPath: path, videoName: name, note })
      } else if (src === 'task') {
        chain.deliverTask(id, { videoUrl: path, videoName: name, note })
      } else {
        guarantee.submitDelivery(pid, { videoPath: path, videoName: name, note })
      }
    }, src === 'order' ? () => api.advanceOrder(Number(id), 'delivered', note || '作品已上传') : null)
    this.setData({ deliveryTempPath: '', deliveryName: '', deliveryNote: '' })
  },

  /* ---------------- 发布者：审核 ---------------- */

  onApprove() {
    wx.showModal({
      title: '审核通过',
      content: '确认作品符合需求？通过后项目完成，双方保证金自动返还原支付账户，无需填写意见。',
      confirmText: '审核通过',
      success: (r) => {
        if (!r.confirm) return
        const pid = this.resolvePid()
        const src = this.data.source
        const id = this.data.refId
        this.run('审核通过，保证金已返还', () => {
          if (src === 'demand') demand.review(id, 'approve')
          else if (src === 'task') chain.acceptTask(id, '发布者审核通过')
          else guarantee.approve(pid)
        }, src === 'order' ? () => api.advanceOrder(Number(id), 'completed', '发布者审核通过') : null)
      }
    })
  },

  toggleReject() {
    this.setData({ showReject: !this.data.showReject, errText: '' })
  },

  onOpinion(e) {
    this.setData({ rejectOpinion: e.detail.value })
  },

  onRejectDue(e) {
    this.setData({ rejectDue: e.detail.value })
  },

  onRejectSubmit() {
    const opinion = String(this.data.rejectOpinion || '').trim()
    const newDueAt = String(this.data.rejectDue || '').trim()
    // 数据层 guarantee.reject 会强校验：意见 ≥4 字 + 合法新提交日期
    const pid = this.resolvePid()
    const src = this.data.source
    const id = this.data.refId
    this.run('已打回，等待重新提交', () => {
      if (src === 'demand') demand.review(id, 'reject', { opinion, newDueAt })
      else if (src === 'task') chain.rejectDelivery(id, opinion, newDueAt)
      else guarantee.reject(pid, { opinion, newDueAt })
    }, src === 'order' ? () => api.advanceOrder(Number(id), 'producing', '审核不通过：' + opinion) : null)
    this.setData({ showReject: false, rejectOpinion: '' })
  },

  onCancelProject() {
    wx.showModal({
      title: '关闭项目',
      content: '关闭后未违约的双方保证金将原路退回，确定吗？',
      confirmText: '关闭项目',
      confirmColor: '#C0574A',
      success: (r) => {
        if (!r.confirm) return
        const pid = this.resolvePid()
        const src = this.data.source
        const id = this.data.refId
        this.run('项目已关闭', () => {
          if (src === 'demand') demand.advance(id, 'cancelled')
          else if (src === 'task') chain.cancelTask(id, '发布者关闭项目')
          else guarantee.cancel(pid, '发布者关闭项目')
        }, src === 'order' ? () => api.advanceOrder(Number(id), 'cancelled', '发布者关闭项目') : null)
      }
    })
  }
})
