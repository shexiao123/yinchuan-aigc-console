const group = require('../../utils/group')
const { fromNow } = require('../../utils/util')

const ACCENTS = ['#0EA5E9', '#4F7DF3', '#7C5CF0', '#22B8A6', '#F59E0B', '#FF6B9A', '#8B5CF6', '#34D399']

Page({
  data: {
    loading: true,
    loggedIn: false,
    groups: [],
    showCreate: false,
    creating: false,
    formName: '',
    formIcon: '💬',
    formDesc: ''
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    if (!this.data.loading) this.loadData()
  },

  async onPullDownRefresh() {
    await this.loadData()
    wx.stopPullDownRefresh()
  },

  async loadData() {
    const app = getApp()
    const session = app && app.globalData ? app.globalData.session : null
    try {
      const list = await group.listGroups()
      this.setData({
        loading: false,
        loggedIn: !!(session && session.user),
        groups: list.map((g, i) => {
          const accent = ACCENTS[i % ACCENTS.length]
          return {
            ...g,
            accent,
            iconBg: accent + '1A',
            lastText: g.last
              ? (g.last.sender_name || '成员') + '：' + String(g.last.content || '').slice(0, 42)
              : '还没有消息，来发第一条',
            timeText: g.last ? fromNow(g.last.created_at) : '',
            isOfficial: g.owner_id === 'platform'
          }
        })
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '群聊加载失败', icon: 'none' })
    }
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/group/group?id=' + id })
  },

  onShowCreate() {
    if (!this.data.loggedIn) {
      wx.showToast({ title: '请先登录后再建群', icon: 'none' })
      setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 700)
      return
    }
    this.setData({ showCreate: true })
  },

  onHideCreate() {
    if (!this.data.creating) this.setData({ showCreate: false })
  },

  noop() {},

  onFormName(e) {
    this.setData({ formName: e.detail.value })
  },
  onFormIcon(e) {
    this.setData({ formIcon: e.detail.value })
  },
  onFormDesc(e) {
    this.setData({ formDesc: e.detail.value })
  },

  async onCreate() {
    const name = (this.data.formName || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写群名称', icon: 'none' })
      return
    }
    this.setData({ creating: true })
    try {
      const g = await group.createGroup({
        name,
        icon: (this.data.formIcon || '').trim() || '💬',
        description: (this.data.formDesc || '').trim()
      })
      if (!g || !g.id) throw new Error('创建失败，请稍后重试')
      this.setData({ showCreate: false, creating: false, formName: '', formDesc: '' })
      wx.showToast({ title: '群聊已创建', icon: 'success' })
      await this.loadData()
      setTimeout(() => wx.navigateTo({ url: '/pages/group/group?id=' + g.id }), 500)
    } catch (e) {
      this.setData({ creating: false })
      wx.showToast({ title: e.message || '创建失败', icon: 'none' })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  }
})
