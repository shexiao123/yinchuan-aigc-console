const api = require('../../utils/api')
const { orderStatus, yuan, fromNow } = require('../../utils/util')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待接单' },
  { key: 'taken', label: '已接单' },
  { key: 'producing', label: '制作中' },
  { key: 'delivered', label: '待确认' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
]

Page({
  data: {
    loading: true,
    isStaff: false,
    loggedIn: false,
    activating: false,
    activateError: '',
    inviteCode: '',
    filters: FILTERS,
    activeKey: 'all',
    stats: null,
    orders: [],
    gmvText: '0'
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false, isStaff: false, loggedIn: false })
      return
    }
    try {
      const isStaff = await api.isStaff(session.user.id)
      if (!isStaff) {
        this.setData({ loading: false, isStaff: false, loggedIn: true })
        return
      }
      const status = this.data.activeKey === 'all' ? '' : this.data.activeKey
      const [stats, orders] = await Promise.all([api.adminStats(), api.adminListOrders(status, 50)])
      this.setData({
        loading: false,
        isStaff: true,
        stats,
        gmvText: yuan(stats.gmv),
        orders: orders.map((o) => {
          const st = orderStatus(o.status)
          return {
            ...o,
            statusText: st.text,
            tone: st.tone,
            amountText: yuan(o.amount),
            feeText: yuan(o.platform_fee),
            timeText: fromNow(o.created_at)
          }
        })
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeKey) return
    this.setData({ activeKey: key })
    this.loadData()
  },

  /** 打开激活输入框 */
  onActivate() {
    this.setData({ activating: true, activateError: '', inviteCode: '' })
  },

  onActivateCancel() {
    this.setData({ activating: false, activateError: '', inviteCode: '' })
  },

  onInviteInput(e) {
    this.setData({ inviteCode: e.detail.value, activateError: '' })
  },

  /** 提交邀请码 */
  async onActivateSubmit() {
    const code = (this.data.inviteCode || '').trim()
    if (!code) {
      this.setData({ activateError: '请输入邀请码' })
      return
    }
    this.setData({ activating: true, activateError: '' })
    try {
      const row = await api.claimAdminInvite(code)
      const app = getApp()
      app.globalData.isStaff = true
      this.setData({ activating: false, activateError: '', inviteCode: '' })
      wx.showToast({ title: `已激活：${row.name || '管理员'}`, icon: 'success' })
      this.loadData()
    } catch (e) {
      this.setData({ activating: false, activateError: api.friendlyError(e) })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  /** 导出订单数据，供管理端导入（两个云环境数据不互通时的同步手段） */
  async onExport() {
    wx.showLoading({ title: '导出中…' })
    try {
      const data = await api.exportAllOrders()
      const text = JSON.stringify(data)
      wx.setClipboardData({
        data: text,
        success: () => {
          wx.hideLoading()
          wx.showModal({
            title: '已复制到剪贴板',
            content: `共 ${data.count} 条订单数据。请打开管理端的「数据同步」页面，粘贴后导入。`,
            showCancel: false,
            confirmText: '知道了'
          })
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '复制失败，请重试', icon: 'none' })
        }
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onOrderTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` })
  }
})
