const payout = require('../../utils/payout')

const TYPES = [
  { key: 'bank', name: '银行卡' },
  { key: 'alipay', name: '支付宝' }
]

const BANKS = ['中国工商银行', '中国建设银行', '中国农业银行', '中国银行', '交通银行', '招商银行', '宁夏银行', '黄河农村商业银行', '其他银行']

Page({
  data: {
    accounts: [],
    types: TYPES,
    typeIdx: 0,
    banks: BANKS,
    bankIdx: 0,
    showForm: false,
    cardNo: '',
    holder: '',
    phone: '',
    alipay: '',
    submitting: false
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    this.setData({ accounts: payout.listAccounts() })
  },

  onToggleForm() {
    this.setData({ showForm: !this.data.showForm })
  },

  onTypeChange(e) {
    this.setData({ typeIdx: Number(e.detail.value) })
  },

  onBankChange(e) {
    this.setData({ bankIdx: Number(e.detail.value) })
  },

  onInput(e) {
    const f = e.currentTarget.dataset.field
    const patch = {}
    patch[f] = e.detail.value
    this.setData(patch)
  },

  submit() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      if (TYPES[this.data.typeIdx].key === 'bank') {
        payout.addBank({
          cardNo: this.data.cardNo,
          bankName: BANKS[this.data.bankIdx],
          holder: this.data.holder,
          phone: this.data.phone
        })
      } else {
        payout.addAlipay({ account: this.data.alipay, holder: this.data.holder })
      }
      wx.showToast({ title: '已添加', icon: 'success' })
      this.setData({
        showForm: false,
        cardNo: '',
        holder: '',
        phone: '',
        alipay: ''
      })
      this.refresh()
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '添加失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onSetDefault(e) {
    payout.setDefault(e.currentTarget.dataset.id)
    this.refresh()
    wx.showToast({ title: '已设为默认到账方式', icon: 'none' })
  },

  onRemove(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除收款账户',
      content: '删除后需要重新添加才能提现到该账户，已提交的提现单不受影响。',
      confirmText: '删除',
      confirmColor: '#C0573A',
      success: (res) => {
        if (!res.confirm) return
        try {
          payout.removeAccount(id)
          this.refresh()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
