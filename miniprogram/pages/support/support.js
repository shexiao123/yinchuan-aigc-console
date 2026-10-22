const support = require('../../utils/support')
const { fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    loggedIn: false,
    isStaff: false,
    conversation: null,
    messages: [],
    conversations: [],
    input: '',
    sending: false,
    scrollTo: '',
    staffMode: false
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0)
    this.conversationId = id || 0
    this.loadData()
  },

  onShow() {
    if (this.data.conversation) this.loadData()
  },

  async loadData() {
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      this.setData({ loading: false, loggedIn: false })
      return
    }
    try {
      const isStaff = await support.isSupportStaff()
      let conversationId = this.conversationId

      // 客服模式：打开的是会话列表
      if (isStaff && !conversationId) {
        const list = await support.listAllConversations('open')
        this.setData({
          loading: false,
          loggedIn: true,
          isStaff: true,
          staffMode: true,
          conversations: list.map((c) => ({
            ...c,
            timeText: fromNow(c.last_message_at || c.created_at),
            customerInitial: (c.customer_name || '客').charAt(0)
          }))
        })
        return
      }

      // 客户模式：没有会话就建一个
      if (!conversationId) {
        const conv = await support.createConversation()
        if (!conv) {
          this.setData({ loading: false, loggedIn: true })
          return
        }
        conversationId = conv.id
        this.conversationId = conv.id
      }

      const detail = await support.getConversation(conversationId)
      if (!detail) {
        this.setData({ loading: false, loggedIn: true })
        return
      }

      const messages = detail.messages.map((m) => ({
        ...m,
        timeText: fromNow(m.created_at),
        mine: m.sender_role === (this.data.isStaff ? 'staff' : 'customer')
      }))

      await support.markConversationRead(conversationId, this.data.isStaff ? 'staff' : 'customer')

      this.setData({
        loading: false,
        loggedIn: true,
        isStaff,
        staffMode: false,
        conversation: {
          ...detail.conversation,
          timeText: fromNow(detail.conversation.created_at)
        },
        messages,
        scrollTo: `msg-${messages.length ? messages[messages.length - 1].id : 0}`
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  async onSend() {
    const content = (this.data.input || '').trim()
    if (!content || this.data.sending) return
    this.setData({ sending: true, input: '' })
    try {
      const role = this.data.isStaff ? 'staff' : 'customer'
      await support.sendMessage(this.conversationId, content, role)
      await this.loadData()
    } catch (e) {
      this.setData({ input: content })
      wx.showToast({ title: e.message || '发送失败', icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  },

  async onPickConversation(e) {
    const id = Number(e.currentTarget.dataset.id)
    this.conversationId = id
    this.setData({ staffMode: false, messages: [], conversation: null })
    this.loadData()
  },

  async onClose() {
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '结束会话',
        content: '结束后客服将无法继续回复，如需再次咨询可重新发起。',
        confirmText: '结束会话',
        confirmColor: '#C0574A',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return
    try {
      await support.closeConversation(this.conversationId)
      wx.showToast({ title: '会话已结束', icon: 'success' })
      setTimeout(() => {
        this.conversationId = 0
        this.setData({ conversation: null, messages: [] })
        this.loadData()
      }, 800)
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  }
})
