/**
 * 智能工作台 · 算法内核（双端唯一真源）
 * ------------------------------------------------------------------
 * 纯函数，不依赖 DOM / wx / 云服务，网页端与小程序端共用同一份文件。
 * 小程序端副本由 `node tools/sync-smart-engine.js` 从本文件复制生成，
 * 请勿单独修改副本。
 *
 * 两个能力：
 *   1. quote()  —— 按品类/规格/加急/修改轮次测算参考价与完整资金拆解
 *   2. match()  —— 按品类/预算/交期/城市对在架服务做可解释的加权撮合
 *
 * 所有金额一律用「分」为单位，与 seed-data.js / guarantee.js 保持一致。
 * 本模块只做测算与排序，不产生任何真实资金往来（演示记账）。
 */
;(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.SmartEngine = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /** 履约规则：与 miniprogram/utils/guarantee.js 的 RULES 对齐，改一处要同步另一处 */
  var RULES = {
    commissionRate: 0.10,        // 平台服务费（platform_settings.commission_rate）
    providerDepositRate: 0.15,   // 接单方保证金
    publisherDepositRate: 0.10,  // 发布方保证金
    penaltyPlatformShare: 0.30, // 逾期违约金平台分成
    penaltyPublisherShare: 0.70 // 逾期违约金发布者分成
  }

  /**
   * 8 品类基准价（分）与基准交付天数。
   * 取值依据：seed-data.js 各品类在架服务价格中位数取整，
   * 无在架服务的品类按相邻品类估算。仅供测算参考，不是平台定价。
   */
  var CATEGORY_BASE = {
    'wedding-shoot': { name: '婚礼跟拍', base: 299900, days: 15, group: 'shoot' },
    'wedding-film': { name: '婚礼微电影', base: 199900, days: 7, group: 'shoot' },
    'brand-film': { name: '品牌宣传片', base: 680000, days: 20, group: 'film' },
    'short-video': { name: '短视频剪辑', base: 39900, days: 2, group: 'post' },
    'commercial-photo': { name: '商业摄影', base: 260000, days: 3, group: 'shoot' },
    'ae-motion': { name: 'AE 动画', base: 129900, days: 5, group: 'post' },
    'ai-generate': { name: 'AI 生成', base: 69900, days: 2, group: 'ai' },
    'comic-drama': { name: '漫剧制作', base: 1500000, days: 30, group: 'ai' }
  }

  var SPEC_FACTOR = { basic: 0.85, standard: 1.0, flagship: 1.45 }
  var SPEC_LABEL = { basic: '基础档', standard: '标准档', flagship: '旗舰档' }
  var RUSH_FACTOR = { 0: 1.0, 1: 1.2, 2: 1.45 }
  var RUSH_LABEL = { 0: '常规排期', 1: '加急', 2: '极急' }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }
  function round(n) { return Math.round(n) }
  /** 金额规范化到整 10 元（1000 分），避免出现 1234.56 这种难读数字 */
  function tidy(n) { return Math.round(n / 1000) * 1000 }

  /** slug / 中文名 / 数字 id 统一收口成 slug */
  function resolveSlug(category, categories) {
    if (!category) return ''
    var s = String(category)
    if (CATEGORY_BASE[s]) return s
    var list = categories || []
    for (var i = 0; i < list.length; i++) {
      var c = list[i]
      if (String(c.id) === s || c.slug === s || c.name === s) return c.slug || ''
    }
    for (var k in CATEGORY_BASE) {
      if (CATEGORY_BASE[k].name === s) return k
    }
    return ''
  }

  function categoryIdToSlug(id, categories) {
    var list = categories || []
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i].slug || ''
    }
    return ''
  }

  /** 品类列表（供表单下拉，按固定顺序，稳定可测） */
  function listCategories() {
    return Object.keys(CATEGORY_BASE).map(function (slug) {
      return { slug: slug, name: CATEGORY_BASE[slug].name, base: CATEGORY_BASE[slug].base, days: CATEGORY_BASE[slug].days }
    })
  }

  /**
   * 报价测算
   * @param {object} p { category, spec, rush, revisions }
   * @returns {object} { slug, name, amount, low, high, days, factors, breakdown, rules, disclaimer }
   */
  function quote(p) {
    p = p || {}
    var slug = resolveSlug(p.category, p.categories)
    var meta = CATEGORY_BASE[slug] || CATEGORY_BASE['wedding-shoot']
    var spec = SPEC_FACTOR[p.spec] != null ? p.spec : 'standard'
    var rush = RUSH_FACTOR[p.rush] != null ? Number(p.rush) : 0
    var revisions = clamp(Number(p.revisions) || 0, 0, 8)

    var specF = SPEC_FACTOR[spec]
    var rushF = RUSH_FACTOR[rush]
    // 基础含 2 轮修改，每多一轮按 3% 计
    var extraRevision = Math.max(0, revisions - 2) * 0.03
    var raw = meta.base * specF * rushF * (1 + extraRevision)
    var amount = tidy(raw)
    var low = tidy(amount * 0.90)
    var high = tidy(amount * 1.15)
    var days = Math.max(1, Math.round(meta.days / (1 + (rushF - 1) * 1.8)))

    var platformFee = round(amount * RULES.commissionRate)
    var providerNet = amount - platformFee
    var providerDeposit = round(amount * RULES.providerDepositRate)
    var publisherDeposit = round(amount * RULES.publisherDepositRate)
    // 逾期没收接单方全部保证金，按 3:7 分账
    var penalty = providerDeposit
    var penaltyPlatform = round(penalty * RULES.penaltyPlatformShare)
    var penaltyPublisher = penalty - penaltyPlatform

    return {
      slug: slug,
      name: meta.name,
      amount: amount,
      low: low,
      high: high,
      days: days,
      factors: {
        spec: spec, specLabel: SPEC_LABEL[spec], specFactor: specF,
        rush: rush, rushLabel: RUSH_LABEL[rush], rushFactor: rushF,
        revisions: revisions, extraRevisionRate: extraRevision
      },
      breakdown: {
        amount: amount,
        platformFee: platformFee,
        providerNet: providerNet,
        providerDeposit: providerDeposit,
        publisherDeposit: publisherDeposit,
        penalty: penalty,
        penaltyPlatform: penaltyPlatform,
        penaltyPublisher: penaltyPublisher
      },
      rules: RULES,
      disclaimer: '演示测算，不构成报价承诺；保证金、违约金均为本机演示记账，不产生真实资金往来。'
    }
  }

  /** 金额（分）→ 元，保留两位，供 UI 直接展示 */
  function yuan(cents) {
    return (Number(cents) / 100).toFixed(2)
  }

  /** 单个维度得分 → 中文理由 */
  function reasonsFor(parts, ctx) {
    var out = []
    if (parts.category >= 30) out.push('品类完全对口，代表作为' + (ctx.categoryName || '本品类'))
    else if (parts.category > 0) out.push('同属' + (ctx.groupName || '相近') + '制作线，可承接此类需求')
    if (parts.budget >= 22) out.push('报价落在预算内，规格吻合度高')
    else if (parts.budget >= 12) out.push('报价与预算接近，可微调规格')
    else if (ctx.budget > 0) out.push('报价超出预算，需下调规格或提高预算')
    if (parts.delivery >= 19) out.push('交付周期短于你的期望工期')
    else if (parts.delivery < 12) out.push('交付周期偏长，建议提前排期')
    if (parts.reputation >= 12) out.push('评分与历史完成单量表现突出')
    if (parts.trust >= 4) out.push('已认证服务者，档期可对接')
    return out.slice(0, 4)
  }

  function cautionsFor(parts, ctx, service, provider) {
    var out = []
    if (ctx.budget > 0 && Number(service.price) > ctx.budget) {
      out.push('超预算 ¥' + yuan(Number(service.price) - ctx.budget))
    }
    if (ctx.days > 0 && Number(service.delivery_days) > ctx.days) {
      out.push('比期望晚 ' + (Number(service.delivery_days) - ctx.days) + ' 天')
    }
    if (provider && !provider.is_verified) out.push('该服务者暂未认证')
    return out
  }

  /**
   * 智能撮合：对在架服务逐条打分，返回可解释的排序结果
   * @param {object} p { category, budget(元), days(天), city, onlyVerified }
   * @param {array} services 在架服务
   * @param {array} providers 服务者
   * @param {array} categories 分类（用于 id→slug）
   */
  function match(p, services, providers, categories) {
    p = p || {}
    var slug = resolveSlug(p.category, categories)
    var meta = CATEGORY_BASE[slug] || null
    var budgetCents = clamp(Number(p.budget) || 0, 0, 100000000) * 100
    var needDays = clamp(Number(p.days) || 0, 0, 365)
    var city = p.city && p.city !== '不限' ? String(p.city) : ''
    var svcs = Array.isArray(services) ? services : []
    var provs = Array.isArray(providers) ? providers : []
    var provMap = {}
    provs.forEach(function (v) { provMap[String(v.id)] = v })

    var results = svcs.filter(function (s) {
      if (s && s.status && s.status !== 'on') return false
      return !!s
    }).map(function (s) {
      var sSlug = categoryIdToSlug(s.category_id, categories) || s.category_slug || ''
      var sMeta = CATEGORY_BASE[sSlug] || null
      var prov = provMap[String(s.provider_id)] || null

      // 1) 品类契合 35
      var catScore
      if (slug && sSlug === slug) catScore = 35
      else if (slug && sMeta && meta && sMeta.group === meta.group) catScore = 13
      else catScore = slug ? 0 : 20
      if (p.onlyVerified && prov && !prov.is_verified) catScore = Math.max(0, catScore - 6)

      // 2) 预算吻合 25（price 为分）
      var price = Number(s.price) || 0
      var budgetScore
      if (!budgetCents) budgetScore = 18
      else if (price <= budgetCents) {
        var under = 1 - price / budgetCents
        budgetScore = 25 - Math.min(10, under * 18)
      } else {
        budgetScore = Math.max(0, 25 - (price / budgetCents - 1) * 45)
      }

      // 3) 交付周期 20
      var deliveryDays = Number(s.delivery_days) || 0
      var deliveryScore
      if (!needDays || !deliveryDays) deliveryScore = 14
      else if (deliveryDays <= needDays) deliveryScore = 20
      else deliveryScore = Math.max(0, 20 - (deliveryDays - needDays) * 2.5)

      // 4) 口碑与履约 15
      var rating = clamp(Number(s.rating) || (prov && Number(prov.rating)) || 0, 0, 5)
      var done = Math.max(0, Number((prov && prov.orders_done) || s.sales_count) || 0)
      var ratingScore = clamp((rating - 4) / 1, 0, 1) * 8
      var volumeScore = clamp(Math.log10(done + 1) / Math.log10(301), 0, 1) * 7
      var reputationScore = ratingScore + volumeScore

      // 5) 认证与城市 5
      var trustScore = 0
      if (prov && prov.is_verified) trustScore += 3
      if (city && prov && prov.city) {
        if (prov.city === city || prov.city === '远程') trustScore += 2
      } else if (!city) trustScore += 2

      var parts = {
        category: round(catScore), budget: round(budgetScore),
        delivery: round(deliveryScore), reputation: round(reputationScore),
        trust: round(trustScore)
      }
      var score = clamp(round(catScore + budgetScore + deliveryScore + reputationScore + trustScore), 0, 100)
      var groupName = sMeta ? ({ shoot: '拍摄制作', post: '后期剪辑', ai: 'AI 创作' })[sMeta.group] : ''
      var ctx = {
        categoryName: meta ? meta.name : '',
        groupName: groupName,
        budget: budgetCents,
        days: needDays
      }
      return {
        service: s,
        provider: prov,
        score: score,
        parts: parts,
        reasons: reasonsFor(parts, ctx),
        cautions: cautionsFor(parts, ctx, s, prov),
        priceCents: price,
        priceYuan: yuan(price)
      }
    })

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score
      if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents
      return String(a.service.id).localeCompare(String(b.service.id))
    })
    return results
  }

  /**
   * 演示样本：云端不可达时的最后兜底（小程序端 / Pages 离线模式通用）。
   * 数据由品类基准表派生，全部标注 isDemo，UI 必须显式提示「演示样本」，
   * 不得让使用者误以为是平台真实在架服务。
   */
  function demoData() {
    var cats = []
    var services = []
    var providers = []
    var slugs = Object.keys(CATEGORY_BASE)
    var cities = ['银川', '北京', '成都', '远程', '上海', '远程', '杭州', '西安']
    var nicknames = ['晨末映画', '阿银工作室', '鹿鸣剪辑社', '像素造物 AI',
      '双木商业摄影', '远山动效', '星野数字', '贺兰漫剧组']
    slugs.forEach(function (slug, i) {
      var meta = CATEGORY_BASE[slug]
      cats.push({ id: i + 1, slug: slug, name: meta.name, description: meta.name + ' · 演示样本' })
      services.push({
        id: 'demo-' + (i + 1), provider_id: i + 1, category_id: i + 1, category_slug: slug,
        title: meta.name + ' · 演示服务', subtitle: '演示样本，非真实在架服务',
        price: meta.base, delivery_days: meta.days,
        rating: 4.6 + (i % 4) * 0.1, sales_count: 10 + i * 6,
        status: 'on', tags: ['演示'], isDemo: true
      })
      providers.push({
        id: i + 1, nickname: nicknames[i] || ('演示服务者 ' + (i + 1)),
        city: cities[i] || '远程', rating: 4.6 + (i % 4) * 0.1,
        orders_done: 20 + i * 18, is_verified: i % 3 !== 2, isDemo: true
      })
    })
    return { categories: cats, services: services, providers: providers, isDemo: true }
  }

  /** 权重说明，供 UI 展示「为什么这么排」 */
  var WEIGHTS = [
    { key: 'category', label: '品类契合', max: 35 },
    { key: 'budget', label: '预算吻合', max: 25 },
    { key: 'delivery', label: '交付周期', max: 20 },
    { key: 'reputation', label: '口碑履约', max: 15 },
    { key: 'trust', label: '认证档期', max: 5 }
  ]

  return {
    RULES: RULES,
    CATEGORY_BASE: CATEGORY_BASE,
    SPEC_FACTOR: SPEC_FACTOR,
    SPEC_LABEL: SPEC_LABEL,
    RUSH_FACTOR: RUSH_FACTOR,
    RUSH_LABEL: RUSH_LABEL,
    WEIGHTS: WEIGHTS,
    listCategories: listCategories,
    resolveSlug: resolveSlug,
    quote: quote,
    match: match,
    demoData: demoData,
    yuan: yuan
  }
})
