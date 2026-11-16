const wallet = require('../../utils/wallet')
const demand = require('../../utils/demand')

Page({
  data: {
    w: null,
    tab: 'pending',
    tabs: [
      { key: 'pending', label: '待确认' },
      { key: 'settling', label: '待结算' },
      { key: 'done', label: '已到账' }
    ],
    list: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const w = wallet.summary()
    this.setData({ w }, () => this.buildList())
  },

  onTabTap(e) {
    this.setData({ tab: e.currentTarget.dataset.key }, () => this.buildList())
  },

  buildList() {
    const w = this.data.w
    if (!w) return
    const map = {
      pending: (x) => x.type === 'freeze',
      settling: (x) => x.type === 'settle',
      done: (x) => x.type === 'earn' || x.type === 'recharge'
    }
    const fn = map[this.data.tab] || (() => true)
    this.setData({ list: w.ledger.filter(fn) })
  },

  onRecharge() {
    try {
      wallet.recharge(500000)
      this.refresh()
      wx.showToast({ title: '已充值 ¥5000（演示）', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '充值失败', icon: 'none' })
    }
  },

  onWithdraw() {
    wx.navigateTo({ url: '/pages/withdraw/withdraw' })
  },

  onAccounts() {
    wx.navigateTo({ url: '/pages/accounts/accounts' })
  },

  onGoHall() {
    wx.switchTab({ url: '/pages/hall/hall' })
  },

  onReset() {
    wx.showModal({
      title: '重置演示数据',
      content: '将清空钱包流水与本地需求池，恢复初始演示状态。确定重置？',
      success: (res) => {
        if (!res.confirm) return
        wallet.reset()
        demand.reset()
        this.refresh()
        wx.showToast({ title: '已重置', icon: 'success' })
      }
    })
  }
})
