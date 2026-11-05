const group = require('../../utils/group')
const { fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    loggedIn: false,
    group: null,
    messages: [],
    memberCount: 0,
    input: '',
    sending: false,
    scrollTo: '',
    tip: '消息每 5 秒自动刷新'
  },

  onLoad(options) {
    this.groupId = Number((options && options.id) || 0)
    this.uid = group.currentUid()
    this.lastId = 0
    this.loadData()
  },

  onShow() {
    if (this.data.group) {
      this.loadData()
      this.startPolling()
    }
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
  },

  startPolling() {
    this.stopPolling()
    this.poller = setInterval(() => this.refresh(), 5000)
  },

  stopPolling() {
    if (this.poller) {
      clearInterval(this.poller)
      this.poller = null
    }
  },

  async loadData() {
    const app = getApp()
    const session = app && app.globalData ? app.globalData.session : null
    const loggedIn = !!(session && session.user)
    this.uid = group.currentUid()
    try {
      const g = await group.getGroup(this.groupId)
      if (!g) {
        this.setData({ loading: false, loggedIn })
        wx.showToast({ title: '群聊不存在或已停用', icon: 'none' })
        return
      }
      wx.setNavigationBarTitle({ title: (g.icon || '💬') + ' ' + g.name })

      if (this.uid) await group.joinGroup(this.groupId).catch(() => null)
      const [messages, members] = await Promise.all([
        group.listMessages(this.groupId, 60),
        group.listMembers(this.groupId)
      ])
      if (this.uid) group.markRead(this.groupId).catch(() => null)

      this.setData({ loading: false, loggedIn, group: g, memberCount: members.length })
      this.paintMessages(messages)
      this.startPolling()
    } catch (e) {
      this.setData({ loading: false, loggedIn })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  /** 只在新消息到达时重绘，避免打断输入 */
  async refresh() {
    try {
      const list = await group.listMessages(this.groupId, 60)
      const newest = list.length ? list[list.length - 1].id : 0
      if (newest <= this.lastId) return
      this.paintMessages(list)
    } catch (e) {
      // 轮询失败静默重试
    }
  },

  paintMessages(list) {
    const myId = this.uid || ''
    const messages = list.map((m) => ({
      ...m,
      mine: !!myId && m.sender_id === myId,
      isSystem: m.sender_role === 'system',
      hidden: !!(m.status && m.status !== 'normal'),
      timeText: fromNow(m.created_at),
      initial: String(m.sender_name || '群').charAt(0)
    }))
    const last = list.length ? list[list.length - 1].id : 0
    this.lastId = last
    this.setData({ messages, scrollTo: 'msg-' + last })
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  async onSend() {
    const content = (this.data.input || '').trim()
    if (!content || this.data.sending) return
    this.setData({ sending: true, input: '' })
    try {
      await group.sendMessage(this.groupId, content)
      const list = await group.listMessages(this.groupId, 60)
      this.paintMessages(list)
    } catch (e) {
      this.setData({ input: content })
      wx.showToast({ title: e.message || '发送失败', icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  }
})
