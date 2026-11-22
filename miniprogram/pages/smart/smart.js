/**
 * 智能工作台 · AI 撮合 + 报价测算（小程序端）
 * ------------------------------------------------------------------
 * 算法内核 require ../../utils/smart-engine.js，与网页端 byte 级同源。
 * 数据源：优先云端真实在架服务；云端不可达（测试号 / 未备案 / 离线）
 * 自动降级到 kernel 内置的「演示样本」，并显式标注，不伪装真实交易。
 *
 * 合规：本页所有金额均为本机测算与演示记账，不产生真实资金往来。
 * 以微信官方最新审核规范为准，提审版本需保留演示标识。
 */
const E = require('../../utils/smart-engine.js')

let api = null
try {
  api = require('../../utils/api.js')
} catch (e) {
  api = null
}

const CITIES = ['不限', '银川', '北京', '上海', '广州', '深圳', '杭州', '成都', '西安', '武汉', '远程']

function money(cents) {
  const s = (Number(cents || 0) / 100).toFixed(2)
  return '¥' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

Page({
  data: {
    tab: 'match',
    isDemo: true,
    catNames: [], catSlugs: [], catIndex: 0, quoteCatIndex: 0,
    cityNames: CITIES, cityIndex: 0,
    specNames: [], specKeys: [], specIndex: 1,
    rushNames: [], rushKeys: [], rushIndex: 0,
    budget: '3000', days: '15', revisions: '2',
    onlyVerified: false,
    weights: [],
    results: [],
    quote: null,
    resultTitle: ''
  },

  onLoad() {
    // 输入框的值存在实例上而非 setData，避免每次输入触发整页重渲染导致光标跳动
    this.form = { budget: 3000, days: 15, revisions: 2 }
    const cats = E.listCategories()
    const specKeys = Object.keys(E.SPEC_FACTOR)
    const rushKeys = Object.keys(E.RUSH_FACTOR)
    this.setData({
      catNames: cats.map((c) => c.name),
      catSlugs: cats.map((c) => c.slug),
      specKeys: specKeys,
      specNames: specKeys.map((k) => E.SPEC_LABEL[k]),
      rushKeys: rushKeys,
      rushNames: rushKeys.map((k) => E.RUSH_LABEL[k]),
      weights: E.WEIGHTS.map((w) => ({ label: w.label, max: w.max }))
    })
    // 渐进增强：先用演示样本同步渲染首屏，绝不等待云端；
    // 云端真实数据到达后再静默覆盖。云端挂起 / 测试号 / 离线都不影响可用性。
    this.raw = E.demoData()
    this.setData({ isDemo: true })
    this.runMatch()
    this.runQuote()
    this.upgradeFromCloud()
  },

  async upgradeFromCloud() {
    if (!api) return
    try {
      const withTimeout = (p, ms) => Promise.race([
        Promise.resolve(p),
        new Promise((_, reject) => setTimeout(() => reject(new Error('cloud timeout')), ms))
      ])
      const [cats, svcs, provs] = await withTimeout(Promise.all([
        api.listCategories(), api.listServices({ limit: 200 }), api.listProviders()
      ]), 4000)
      if (!(Array.isArray(svcs) && svcs.length && Array.isArray(cats) && cats.length)) return
      this.raw = {
        categories: cats,
        services: svcs,
        providers: Array.isArray(provs) ? provs : [],
        isDemo: false
      }
      const slugs = cats.map((c) => c.slug).filter(Boolean)
      this.setData(slugs.length
        ? { catNames: cats.map((c) => c.name), catSlugs: slugs, catIndex: 0, quoteCatIndex: 0, isDemo: false }
        : { isDemo: false })
      this.runMatch()
      this.runQuote()
    } catch (e) {
      // 云端不可用 / 超时：保留首屏演示样本，不抛错、不白屏
    }
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  onCatChange(e) { this.setData({ catIndex: Number(e.detail.value) }) },
  onQuoteCatChange(e) { this.setData({ quoteCatIndex: Number(e.detail.value) }) },
  onCityChange(e) { this.setData({ cityIndex: Number(e.detail.value) }) },
  onSpecChange(e) { this.setData({ specIndex: Number(e.detail.value) }) },
  onRushChange(e) { this.setData({ rushIndex: Number(e.detail.value) }) },
  onBudgetInput(e) { this.form.budget = Number(e.detail.value) || 0 },
  onDaysInput(e) { this.form.days = Number(e.detail.value) || 0 },
  onRevisionsInput(e) { this.form.revisions = Number(e.detail.value) || 0 },
  onVerifiedChange(e) { this.setData({ onlyVerified: !!e.detail.value }) },

  runMatch() {
    if (!this.raw) return
    const d = this.data
    const p = {
      category: d.catSlugs[d.catIndex] || '',
      budget: Number(this.form.budget) || 0,
      days: Number(this.form.days) || 0,
      city: d.cityNames[d.cityIndex] || '不限',
      onlyVerified: d.onlyVerified
    }
    const rows = E.match(p, this.raw.services, this.raw.providers, this.raw.categories).slice(0, 6)
    const results = rows.map((r, i) => ({
      key: String(r.service.id),
      rank: i + 1,
      score: r.score,
      title: r.service.title || r.service.name || '未命名服务',
      meta: (r.provider && r.provider.nickname ? r.provider.nickname : '平台服务者') +
        ' · ' + (r.provider && r.provider.city ? r.provider.city : '远程') +
        ' · ' + (r.service.delivery_days || '–') + ' 天交付',
      price: money(r.service.price),
      serviceId: r.service.id,
      isDemo: !!(r.service.isDemo || this.raw.isDemo),
      bars: E.WEIGHTS.map((w) => {
        const val = r.parts[w.key] || 0
        return {
          key: w.key, label: w.label, val: val, max: w.max,
          pct: Math.max(0, Math.min(100, Math.round(val / w.max * 100)))
        }
      }),
      reasons: r.reasons.slice(0, 3),
      cautions: r.cautions.slice(0, 2)
    }))
    this.setData({
      results: results,
      resultTitle: '为你匹配到 ' + results.length + ' 个方案' + (this.raw.isDemo ? '（演示样本）' : '')
    })
  },

  runQuote() {
    const d = this.data
    const r = E.quote({
      category: d.catSlugs[d.quoteCatIndex] || '',
      spec: d.specKeys[d.specIndex] || 'standard',
      rush: Number(d.rushKeys[d.rushIndex]) || 0,
      revisions: Number(this.form.revisions) || 0,
      categories: this.raw && this.raw.categories
    })
    const b = r.breakdown
    const line = (label, note, val) => ({ label: label, note: note, val: money(val) })
    this.setData({
      quote: {
        name: r.name,
        low: money(r.low),
        high: money(r.high),
        amount: money(r.amount),
        days: r.days,
        specLabel: r.factors.specLabel,
        rushLabel: r.factors.rushLabel,
        revisions: r.factors.revisions,
        lines: [
          line('项目金额', '测算基准', b.amount),
          line('平台服务费', '10%', b.platformFee),
          line('服务者到手', '扣除服务费', b.providerNet),
          line('接单方保证金', '15% · 验收后原路退回', b.providerDeposit),
          line('发布方保证金', '10% · 须为注册商家', b.publisherDeposit),
          line('逾期违约金', '没收接单方全部保证金', b.penalty),
          line('　└ 平台分成', '30%', b.penaltyPlatform),
          line('　└ 发布者分成', '70%', b.penaltyPublisher)
        ],
        disclaimer: r.disclaimer
      }
    })
  },

  onOpenService(e) {
    const id = e.currentTarget.dataset.id
    if (String(id).indexOf('demo-') === 0) {
      wx.showToast({ title: '演示样本，暂无真实服务详情', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/service-detail/service-detail?id=' + encodeURIComponent(id) })
  },

  onGoPublish() {
    wx.navigateTo({ url: '/pages/demand-publish/demand-publish' })
  }
})
