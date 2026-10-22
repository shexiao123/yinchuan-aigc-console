const api = require('../../utils/api')
const samples = require('../../utils/samples')
const member = require('../../utils/member')
const { orderStatus, yuan, yuanShort, coverTheme, fromNow } = require('../../utils/util')

Page({
  data: {
    loading: true,
    loggedIn: false,
    hasProvider: false,
    provider: null,
    application: null,
    claimable: [],
    myOrders: [],
    myServices: [],
    stats: { pending: 0, doing: 0, done: 0, income: 0 },
    memberStatus: null,
    isMember: false,
    memberPlanName: '',
    memberDaysLeft: 0,
    commissionRate: 0,
    tab: 'hall'
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
      this.setData({ loading: false, loggedIn: false })
      return
    }
    this.setData({ loggedIn: true })
    try {
      const provider = app.globalData.provider || (await api.getMyProvider(session.user.id))
      if (!provider) {
        // 未开通：查申请状态
        let application = null
        try {
          application = await api.getMyApplication(session.user.id)
        } catch (e) {
          console.error('[studio] getMyApplication failed', JSON.stringify({ message: e.message }))
        }
        this.setData({ loading: false, hasProvider: false, provider: null, application })
        return
      }
      const [claimable, myOrders, myServices, mySamples] = await Promise.all([
        api.listOpenOrders(null, 30),
        api.listOrders({ role: 'provider', providerIds: [provider.id], limit: 50 }),
        api.listMyServices(provider.id),
        api.listProviderSamples(provider.id)
      ])
      // 会员状态（决定能不能接单）
      let memberStatus = null
      try {
        memberStatus = await member.getMembershipStatus(session.user.id)
      } catch (e) {
        console.error('[studio] getMembershipStatus failed', JSON.stringify({ message: e.message }))
      }
      // 我的佣金率（按会员档位）
      let commissionRate = 0
      try {
        const settings = await api.getSettings()
        const comm = await api.getProviderCommission(provider.id, settings.commission_rate)
        commissionRate = Math.round(Number(comm.rate || 0) * 100)
      } catch (e) {
        console.error('[studio] getProviderCommission failed', JSON.stringify({ message: e.message }))
      }
      const pending = myOrders.filter((o) => o.status === 'open' || o.status === 'taken').length
      const doing = myOrders.filter((o) => o.status === 'producing' || o.status === 'delivered').length
      const done = myOrders.filter((o) => o.status === 'completed').length
      const income = myOrders
        .filter((o) => o.status === 'completed')
        .reduce((sum, o) => sum + (Number(o.amount || 0) - Number(o.platform_fee || 0)), 0)
      this.setData({
        loading: false,
        hasProvider: true,
        provider: { ...provider, initial: provider.nickname ? provider.nickname.charAt(0) : '影' },
        memberStatus: memberStatus,
        isMember: !!(memberStatus && memberStatus.isMember),
        memberPlanName: memberStatus && memberStatus.planName ? memberStatus.planName : '',
        memberDaysLeft: memberStatus && memberStatus.daysLeft ? memberStatus.daysLeft : 0,
        commissionRate,
        claimable: claimable.map((o) => {
          const st = orderStatus(o.status)
          return {
            ...o,
            statusText: st.text,
            tone: st.tone,
            amountText: yuan(o.amount),
            timeText: fromNow(o.created_at)
          }
        }),
        myOrders: myOrders.map((o) => {
          const st = orderStatus(o.status)
          return {
            ...o,
            statusText: st.text,
            tone: st.tone,
            amountText: yuan(o.amount),
            incomeText: yuan(Number(o.amount || 0) - Number(o.platform_fee || 0)),
            timeText: fromNow(o.created_at)
          }
        }),
        myServices: myServices.map((s) => ({
          ...s,
          priceText: yuanShort(s.price),
          coverClass: coverTheme(s.id),
          statusText: s.status === 'on' ? '已上架' : '已下架',
          sampleCount: mySamples.filter((x) => x.service_id === s.id).length
        })),
        stats: { pending, doing, done, income }
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab })
  },

  /** 接单：把公开需求指派给自己 */
  async onClaim(e) {
    const id = Number(e.currentTarget.dataset.id)
    const app = getApp()
    const session = app.globalData.session
    const provider = this.data.provider
    if (!provider || !session) return
    // 会员门槛：未开通会员不能接单
    if (!this.data.isMember) {
      wx.showModal({
        title: '需要开通会员',
        content: '开通会员后才能接单。会员按月付费，可降低平台佣金并获得更多曝光。',
        confirmText: '去开通',
        cancelText: '再看看',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/membership/membership' })
        }
      })
      return
    }
    wx.showModal({
      title: '确认接单',
      content: '接单后客户会看到你的服务信息，请在承诺时间内联系客户沟通细节。',
      confirmText: '确认接单',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.takeOrder(id, provider.id, session.user.id)
          wx.showToast({ title: '接单成功', icon: 'success' })
          await this.loadData()
        } catch (err) {
          if (err && err.code === 'NEED_MEMBER') {
            wx.showModal({
              title: '需要开通会员',
              content: '开通会员后才能接单。',
              confirmText: '去开通',
              success: (r2) => { if (r2.confirm) wx.navigateTo({ url: '/pages/membership/membership' }) }
            })
            return
          }
          wx.showToast({ title: api.friendlyError(err), icon: 'none' })
        }
      }
    })
  },

  onGoMembership() {
    wx.navigateTo({ url: '/pages/membership/membership' })
  },

  onOrderTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` })
  },

  onServiceTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` })
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/studio-publish/studio-publish' })
  },

  onBecomeProvider() {
    wx.navigateTo({ url: '/pages/studio-publish/studio-publish?mode=identity' })
  },

  /**
   * 上传宣传样片：选视频或图片，存到云存储并登记到 service_samples。
   */
  onUploadSample(e) {
    const serviceId = Number(e.currentTarget.dataset.id)
    const app = getApp()
    const session = app.globalData.session
    if (!session || !session.user) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const provider = this.data.provider
    if (!provider) return

    wx.showActionSheet({
      itemList: ['上传视频样片', '上传图片样片'],
      success: (res) => {
        if (res.tapIndex === 0) this.pickAndUploadVideo(serviceId, provider, session.user.id)
        else this.pickAndUploadImage(serviceId, provider, session.user.id)
      }
    })
  },

  async pickAndUploadVideo(serviceId, provider, uid) {
    let picked
    try {
      picked = await samples.chooseVideo()
    } catch (e) {
      if (e.message !== '已取消') wx.showToast({ title: e.message, icon: 'none' })
      return
    }
    wx.showLoading({ title: '上传中…' })
    try {
      const record = await samples.uploadVideo(picked.tempFilePath, {
        serviceId,
        providerId: provider.id,
        providerOwnerId: uid,
        name: picked.name,
        size: picked.size,
        duration: picked.duration
      })
      await api.createSample(record)
      wx.hideLoading()
      wx.showToast({ title: '上传成功', icon: 'success' })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  async pickAndUploadImage(serviceId, provider, uid) {
    let pickedList
    try {
      pickedList = await samples.chooseImages(9)
    } catch (e) {
      if (e.message !== '已取消') wx.showToast({ title: e.message, icon: 'none' })
      return
    }
    if (!pickedList.length) return
    wx.showLoading({ title: '上传中…' })
    let ok = 0
    try {
      for (let i = 0; i < pickedList.length; i++) {
        const record = await samples.uploadImage(pickedList[i].tempFilePath, {
          serviceId,
          providerId: provider.id,
          providerOwnerId: uid,
          name: pickedList[i].name,
          size: pickedList[i].size,
          sortOrder: i
        })
        await api.createSample(record)
        ok++
      }
      wx.hideLoading()
      wx.showToast({ title: `成功上传 ${ok} 张`, icon: 'success' })
      this.loadData()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: api.friendlyError(e), icon: 'none' })
    }
  },

  /** 上架 / 下架切换 */
  async onToggleService(e) {
    const id = Number(e.currentTarget.dataset.id)
    const next = e.currentTarget.dataset.next
    try {
      await api.toggleServiceStatus(id, next)
      wx.showToast({ title: next === 'on' ? '已上架' : '已下架', icon: 'success' })
      await this.loadData()
    } catch (err) {
      wx.showToast({ title: api.friendlyError(err), icon: 'none' })
    }
  },

  onClaimTap() {
    this.setData({ tab: 'hall' })
  }
})
