const wallet = require('../../utils/wallet')
const payout = require('../../utils/payout')

Page({
  data: {
    balanceText: '0.00',
    balance: 0,
    accounts: [],
    activeId: '',
    amount: '',
    rules: { minText: '10.00', dailyText: '50000.00', todayUsedText: '0.00' },
    records: [],
    submitting: false,
    canSubmit: false
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const w = wallet.summary()
    const accounts = payout.listAccounts()
    const cur = this.data.activeId
    const keep = accounts.some((a) => a.id === cur) ? cur : (accounts.find((a) => a.isDefault) || accounts[0] || {}).id || ''
    this.setData({
      balance: w.balance,
      balanceText: w.balanceText,
      accounts,
      activeId: keep,
      rules: payout.rules(),
      records: payout.listRecords().slice(0, 5)
    })
  },

  onSelect(e) {
    this.setData({ activeId: e.currentTarget.dataset.id })
  },

  onAll() {
    this.setData({ amount: this.data.balanceText }, () => this.check())
  },

  onInput(e) {
    this.setData({ amount: e.detail.value }, () => this.check())
  },

  check() {
    const n = Math.round(Number(this.data.amount) * 100)
    this.setData({ canSubmit: n >= payout.MIN_WITHDRAW && n <= this.data.balance && !!this.data.activeId })
  },

  onManage() {
    wx.navigateTo({ url: '/pages/accounts/accounts' })
  },

  submit() {
    if (this.data.submitting) return
    const n = Math.round(Number(this.data.amount) * 100)
    this.setData({ submitting: true })
    try {
      const rec = payout.submitWithdraw({ amount: n, accountId: this.data.activeId })
      wx.showModal({
        title: '提现申请已提交',
        content: `${rec.netText} 元将提现到「${rec.accountLabel}」。\n处理中状态会在渠道回调后变更为成功，本次为演示流程，不产生真实打款。`,
        showCancel: false,
        confirmText: '知道了',
        success: () => {
          this.setData({ amount: '' }, () => this.check())
          this.refresh()
        }
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提现失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
