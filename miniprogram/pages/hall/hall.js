const demand = require('../../utils/demand')
const wallet = require('../../utils/wallet')

const CATS = [
  { id: 0, name: '全部' },
  { id: 1, name: '婚礼跟拍' },
  { id: 2, name: '婚礼微电影' },
  { id: 3, name: '品牌宣传片' },
  { id: 4, name: '短视频剪辑' },
  { id: 5, name: '商业摄影' },
  { id: 6, name: 'AE 动画' },
  { id: 7, name: 'AI 生成' },
  { id: 8, name: '漫剧制作' }
]

const MODES = ['全部交付', '远程交付', '银川本地']
const SORTS = ['默认排序', '预算优先', '最新发布']

Page({
  data: {
    tab: 'pool',
    cats: CATS,
    activeCat: 0,
    modes: MODES,
    modeIdx: 0,
    sorts: SORTS,
    sortIdx: 0,
    loading: true,
    items: [],
    mine: [],
    wallet: null,
    source: 'local',
    expanded: ''
  },

  onShow() {
    this.refresh()
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh())
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const hall = await demand.listHall(this.data.activeCat)
      let items = hall.items
      const mode = MODES[this.data.modeIdx]
      if (mode !== '全部交付') items = items.filter((x) => (x.modeText || '').indexOf(mode.replace('交付', '')) >= 0)
      const sortIdx = this.data.sortIdx
      if (sortIdx === 1) items = items.slice().sort((a, b) => Number(b.budget || 0) - Number(a.budget || 0))
      if (sortIdx === 2) {
        items = items.slice().sort((a, b) => String(b.createdAt || b.created_at || '').localeCompare(String(a.createdAt || a.created_at || '')))
      }
      this.setData({
        items,
        source: hall.source,
        mine: demand.myTaken(),
        wallet: wallet.summary(),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '大厅加载失败', icon: 'none' })
    }
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab })
  },

  onCatTap(e) {
    const id = Number(e.currentTarget.dataset.id)
    if (id === this.data.activeCat) return
    this.setData({ activeCat: id, expanded: '' }, () => this.refresh())
  },

  onModeChange(e) {
    this.setData({ modeIdx: Number(e.detail.value) }, () => this.refresh())
  },

  onSortChange(e) {
    this.setData({ sortIdx: Number(e.detail.value) }, () => this.refresh())
  },

  onToggle(e) {
    const id = String(e.currentTarget.dataset.id)
    this.setData({ expanded: this.data.expanded === id ? '' : id })
  },

  /** 抢单：确认保证金 → 冻结 → 落状态 */
  onTake(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find((x) => String(x.id) === String(id))
    if (!item) return
    if (!item.isLocal) {
      wx.showModal({
        title: '这是一条云端需求',
        content: '云端需求需要先完成服务者认证并开通会员才能接单。要先去接单工作台看看吗？',
        confirmText: '去接单工作台',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/studio/studio' })
        }
      })
      return
    }
    wx.showModal({
      title: '接单需冻结保证金',
      content: `接「${item.title}」将冻结保证金 ${item.depositText} 元，验收通过后全额解冻。确定接单？`,
      confirmText: '确定接单',
      success: (res) => {
        if (!res.confirm) return
        try {
          demand.take(id, { name: '我' })
          wx.showToast({ title: '接单成功', icon: 'success' })
          this.setData({ tab: 'mine' })
          this.refresh()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '接单失败', icon: 'none' })
        }
      }
    })
  },

  /** 我的接单：开始制作 / 提交交付 / 验收通过 / 取消 */
  onAdvance(e) {
    const id = e.currentTarget.dataset.id
    const next = e.currentTarget.dataset.next
    const label = { producing: '开始制作', delivered: '提交交付', completed: '验收通过', cancelled: '取消订单' }[next] || next
    const tip = next === 'completed'
      ? '验收通过后预付款将结算给服务方，保证金解冻。确定完成？'
      : next === 'cancelled'
        ? '取消后预付款与保证金将全额解冻。确定取消？'
        : `确定要${label}吗？`
    wx.showModal({
      title: label,
      content: tip,
      success: (res) => {
        if (!res.confirm) return
        try {
          demand.advance(id, next)
          wx.showToast({ title: `${label}成功`, icon: 'success' })
          this.refresh()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
        }
      }
    })
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/demand-publish/demand-publish' })
  },

  onWallet() {
    wx.navigateTo({ url: '/pages/wallet/wallet' })
  }
})
