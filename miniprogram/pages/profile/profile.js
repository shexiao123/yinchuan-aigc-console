const api = require('../../utils/api')
const member = require('../../utils/member')
const profileApi = require('../../utils/profile')
const { yuan } = require('../../utils/util')

Page({
  data: {
    loggedIn: false,
    user: null,
    provider: null,
    isStaff: false,
    initial: '客',
    orderCount: 0,
    incomeText: '0',
    unread: 0,
    memberValue: '未开通',
    settings: null,
    myProfile: null,
    profileCompleteness: 0,
    profileMissing: '',
    profileEmpty: false
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loggedIn: false, user: null, provider: null, isStaff: false })
      return
    }
    try {
      const provider = app.globalData.provider || (await api.getMyProvider(session.user.id))
      const isStaff = app.globalData.isStaff || (await api.isStaff(session.user.id))
      app.globalData.provider = provider || null
      app.globalData.isStaff = isStaff

      // 未读消息数（失败不影响页面渲染）
      let unread = 0
      try {
        unread = await api.countUnread()
      } catch (e) {
        unread = 0
      }

      // 会员状态（失败不影响页面渲染）
      let memberValue = '未开通'
      try {
        const m = await member.getMembershipStatus(session.user.id)
        memberValue = m && m.isMember ? `${m.planName} · 剩 ${m.daysLeft} 天` : '未开通'
      } catch (e) {
        memberValue = '未开通'
      }

      // 我的资料（失败不影响页面渲染）
      let myProfile = null
      let completeness = 0
      let missing = ''
      try {
        myProfile = await profileApi.getMyProfile(session.user.id)
        // 头像存的是存储路径，显示时转签名地址
        if (myProfile && myProfile.avatar_url) {
          if (myProfile.avatar_url.startsWith('http')) {
            myProfile.avatarUrl = myProfile.avatar_url
          } else {
            const samples = require('../../utils/samples')
            myProfile.avatarUrl = await samples.signedUrl(myProfile.avatar_url, 7200)
          }
        } else if (myProfile) {
          myProfile.avatarUrl = ''
        }
        completeness = profileApi.profileCompleteness(myProfile)
        const miss = profileApi.profileMissing(myProfile)
        missing = miss.length ? `还差 ${miss.join('、')}` : ''
      } catch (e) {
        myProfile = null
      }

      let orderCount = 0
      let income = 0
      if (provider) {
        const orders = await api.listOrders({ role: 'provider', providerIds: [provider.id], limit: 100 })
        orderCount = orders.length
        income = orders
          .filter((o) => o.status === 'completed')
          .reduce((sum, o) => sum + (Number(o.amount || 0) - Number(o.platform_fee || 0)), 0)
      } else {
        const orders = await api.listOrders({ role: 'customer', uid: session.user.id, limit: 100 })
        orderCount = orders.length
      }

      const settings = app.globalData.settings || (await api.getSettings())
      this.setData({
        loggedIn: true,
        user: {
          name: session.user.name || '光影用户',
          avatarUrl: session.user.avatarUrl || ''
        },
        initial: session.user.name ? session.user.name.charAt(0) : '客',
        provider: provider
          ? { ...provider, initial: provider.nickname ? provider.nickname.charAt(0) : '影' }
          : null,
        isStaff,
        orderCount,
        incomeText: yuan(income),
        unread,
        memberValue,
        myProfile,
        profileCompleteness: completeness,
        profileMissing: missing,
        profileEmpty: !myProfile || !String(myProfile.nickname || '').trim(),
        settings
      })
    } catch (e) {
      console.error('[profile] loadData failed', JSON.stringify({ message: e.message }))
    }
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  async onLogout() {
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '退出登录',
        content: '确定要退出当前账号吗？',
        confirmText: '退出',
        confirmColor: '#C0574A',
        success: resolve
      })
    })
    if (!res || !res.confirm) return
    const app = getApp()
    await app.onLogout()
    this.setData({ loggedIn: false, user: null, provider: null, isStaff: false, orderCount: 0 })
    wx.showToast({ title: '已退出', icon: 'success' })
  },

  onOrders() {
    wx.switchTab({ url: '/pages/orders/orders' })
  },

  onNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' })
  },

  onMembership() {
    wx.navigateTo({ url: '/pages/membership/membership' })
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },

  onStudio() {
    wx.switchTab({ url: '/pages/studio/studio' })
  },

  onAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' })
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/studio-publish/studio-publish' })
  },

  /** 在线人工客服（会话式） */
  onOnlineSupport() {
    wx.navigateTo({ url: '/pages/support/support' })
  },

  onContact() {
    const phone = (this.data.settings && this.data.settings.support_phone) || ''
    if (!phone) {
      wx.showToast({ title: '暂未配置客服电话', icon: 'none' })
      return
    }
    wx.showModal({
      title: '客服电话',
      content: phone,
      confirmText: '拨打',
      success: (res) => {
        if (res.confirm) wx.makePhoneCall({ phoneNumber: phone })
      }
    })
  },

  onAbout() {
    wx.showModal({
      title: '关于银川AIGC数字文化产业基地',
      content: '银川AIGC数字文化产业基地是面向婚礼与品牌方的影视制作接单平台，由宁夏云辇文化科技有限公司运营，提供拍摄、剪辑、AI 婚礼微电影、品牌宣传片等服务。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
