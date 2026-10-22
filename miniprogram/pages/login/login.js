const api = require('../../utils/api')

Page({
  data: {
    loading: false,
    errorMsg: '',
    agreed: true
  },

  async onWechatLogin() {
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '' })
    try {
      const session = await api.loginWithWechat()
      const app = getApp()
      await app.onLogin(session)
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            wx.switchTab({ url: '/pages/index/index' })
          }
        })
      }, 800)
    } catch (e) {
      this.setData({ loading: false, errorMsg: api.friendlyError(e) })
    }
  },

  onAgreeChange() {
    this.setData({ agreed: !this.data.agreed })
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/index/index' })
    }
  }
})
