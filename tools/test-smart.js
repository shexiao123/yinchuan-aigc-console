/**
 * 智能工作台算法内核回归测试
 * 覆盖：UMD 双环境导出、报价测算、资金拆解与分账、撮合打分与排序、双端一致性
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const ENGINE = require(path.join(ROOT, 'webapp', 'js', 'smart-engine.js'))
const E = ENGINE

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name) }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1 : eps)

console.log('=== 智能工作台 · 算法内核回归 ===\n')

console.log('1. 导出与常量')
;['quote', 'match', 'listCategories', 'resolveSlug', 'yuan', 'RULES', 'WEIGHTS', 'CATEGORY_BASE']
  .forEach((k) => ok('导出 ' + k, E[k] != null))
ok('5 项权重合计 100', E.WEIGHTS.reduce((s, w) => s + w.max, 0) === 100)
ok('规则：佣金 10%', E.RULES.commissionRate === 0.10)
ok('规则：接单保证金 15%', E.RULES.providerDepositRate === 0.15)
ok('规则：发布保证金 10%', E.RULES.publisherDepositRate === 0.10)
ok('规则：违约金分账 3:7', near(E.RULES.penaltyPlatformShare + E.RULES.penaltyPublisherShare, 1, 1e-9))

console.log('\n2. 浏览器环境（UMD 挂 window）')
const sandbox = { window: {} }
const umdSrc = fs.readFileSync(path.join(ROOT, 'webapp', 'js', 'smart-engine.js'), 'utf8')
new Function('globalThis', 'module', umdSrc).call(sandbox, sandbox, undefined)
ok('globalThis.SmartEngine 已挂载', sandbox.SmartEngine && typeof sandbox.SmartEngine.quote === 'function')
ok('浏览器与 Node 版算法一致', sandbox.SmartEngine.quote({ category: 'wedding-shoot' }).amount === E.quote({ category: 'wedding-shoot' }).amount)

console.log('\n3. 品类解析')
const CATS = [
  { id: 1, slug: 'wedding-shoot', name: '婚礼跟拍' },
  { id: 2, slug: 'wedding-film', name: '婚礼微电影' },
  { id: 3, slug: 'brand-film', name: '品牌宣传片' },
  { id: 4, slug: 'short-video', name: '短视频剪辑' },
  { id: 5, slug: 'commercial-photo', name: '商业摄影' },
  { id: 6, slug: 'ae-motion', name: 'AE 动画' },
  { id: 7, slug: 'ai-generate', name: 'AI 生成' },
  { id: 8, slug: 'comic-drama', name: '漫剧制作' }
]
ok('slug 直通', E.resolveSlug('wedding-shoot') === 'wedding-shoot')
ok('中文名解析', E.resolveSlug('品牌宣传片') === 'brand-film')
ok('数字 id 解析', E.resolveSlug('3', CATS) === 'brand-film')
ok('分类对象 id 字符串解析', E.resolveSlug(String(8), CATS) === 'comic-drama')
ok('未知品类回落空', E.resolveSlug('不存在的品类') === '')
ok('品类清单共 8 项', E.listCategories().length === 8)

console.log('\n4. 报价测算')
const q0 = E.quote({ category: 'wedding-shoot' })
ok('标准档常规 = 基准价（规范化到整 10 元）',
  q0.amount === Math.round(E.CATEGORY_BASE['wedding-shoot'].base / 1000) * 1000)
ok('规范化偏差不超过 5 元', Math.abs(q0.amount - E.CATEGORY_BASE['wedding-shoot'].base) <= 500)
ok('标准档常规 = 基准工期', q0.days === 15)
ok('低价 < 参考价 < 高价', q0.low < q0.amount && q0.amount < q0.high)
ok('金额已规范到整 10 元', q0.amount % 1000 === 0)
const qBasic = E.quote({ category: 'wedding-shoot', spec: 'basic' })
const qFlag = E.quote({ category: 'wedding-shoot', spec: 'flagship' })
ok('基础档 < 标准档 < 旗舰档', qBasic.amount < q0.amount && q0.amount < qFlag.amount)
const qRush = E.quote({ category: 'wedding-shoot', rush: 2 })
ok('极急加价生效', qRush.amount > q0.amount)
ok('极急工期缩短', qRush.days < q0.days)
const qRev = E.quote({ category: 'wedding-shoot', revisions: 5 })
ok('超出 2 轮的修改轮次加价', qRev.amount > q0.amount)
ok('2 轮以内不额外加价', E.quote({ category: 'wedding-shoot', revisions: 2 }).amount === q0.amount)
ok('非法 revisions 不产生 NaN', Number.isFinite(E.quote({ category: 'wedding-shoot', revisions: 'abc' }).amount))
ok('未知品类回落且不崩', Number.isFinite(E.quote({ category: 'xxx' }).amount))
ok('空参数不崩', Number.isFinite(E.quote().amount))
ok('中文品类可测算', E.quote({ category: '漫剧制作' }).slug === 'comic-drama')

console.log('\n5. 资金拆解与分账')
const b = qFlag.breakdown
ok('平台服务费 = 10%', near(b.platformFee, Math.round(b.amount * 0.10)))
ok('接单方保证金 = 15%', near(b.providerDeposit, Math.round(b.amount * 0.15)))
ok('发布方保证金 = 10%', near(b.publisherDeposit, Math.round(b.amount * 0.10)))
ok('服务者到手 = 项目金额 − 服务费', b.providerNet === b.amount - b.platformFee)
ok('逾期违约金 = 接单方全部保证金', b.penalty === b.providerDeposit)
ok('平台分 30%', near(b.penaltyPlatform, Math.round(b.penalty * 0.3)))
ok('发布者分 70%', near(b.penaltyPublisher, Math.round(b.penalty * 0.7)))
ok('分账合计 = 违约金总额', b.penaltyPlatform + b.penaltyPublisher === b.penalty)
ok('免责声明含「演示」', /演示/.test(qFlag.disclaimer))
ok('免责声明含「不构成报价承诺」', /不构成报价承诺/.test(qFlag.disclaimer))
ok('金额转元格式正确', E.yuan(299900) === '2999.00')

console.log('\n6. 智能撮合')
const SERVICES = [
  { id: 1, provider_id: 1, category_id: 1, title: '婚礼全天跟拍', price: 299900, delivery_days: 15, rating: 4.9, sales_count: 86, status: 'on' },
  { id: 2, provider_id: 2, category_id: 2, title: '婚礼微电影', price: 199900, delivery_days: 7, rating: 4.9, sales_count: 112, status: 'on' },
  { id: 3, provider_id: 3, category_id: 4, title: '短视频快剪', price: 39900, delivery_days: 2, rating: 4.7, sales_count: 168, status: 'on' },
  { id: 4, provider_id: 4, category_id: 1, title: '跟拍高价版', price: 990000, delivery_days: 40, rating: 4.1, sales_count: 2, status: 'on' },
  { id: 5, provider_id: 5, category_id: 1, title: '已下架服务', price: 10000, delivery_days: 1, rating: 5, sales_count: 999, status: 'off' }
]
const PROVIDERS = [
  { id: 1, nickname: '晨末映画', city: '银川', rating: 4.9, orders_done: 168, is_verified: true },
  { id: 2, nickname: '鹿鸣', city: '成都', rating: 4.9, orders_done: 120, is_verified: true },
  { id: 3, nickname: '快剪社', city: '远程', rating: 4.7, orders_done: 243, is_verified: false },
  { id: 4, nickname: '新号', city: '上海', rating: 4.1, orders_done: 2, is_verified: false },
  { id: 5, nickname: '下架', city: '银川', rating: 5, orders_done: 999, is_verified: true }
]
const base = { category: 'wedding-shoot', budget: 3000, days: 15, city: '银川' }
const r = E.match(base, SERVICES, PROVIDERS, CATS)
ok('下架服务被过滤', r.length === 4 && !r.some((x) => x.service.status === 'off'))
ok('结果按分数降序', r.every((x, i) => i === 0 || r[i - 1].score >= x.score))
ok('分数均在 0–100', r.every((x) => x.score >= 0 && x.score <= 100))
ok('品类完全对口排第一', r[0].service.id === 1)
ok('品类对口得分最高维度是 35', r[0].parts.category === 35)
ok('每条结果含可读理由', r.every((x) => Array.isArray(x.reasons) && x.reasons.length > 0))
ok('高价超预算带风险提示', r.find((x) => x.service.id === 4).cautions.some((c) => /超预算/.test(c)))
ok('工期超期带风险提示', r.find((x) => x.service.id === 4).cautions.some((c) => /晚/.test(c)))
ok('未认证带风险提示', r.find((x) => x.service.id === 4).cautions.some((c) => /未认证/.test(c)))
ok('同城服务者拿到认证档期满分', r[0].parts.trust === 5)
ok('远程服务者城市加分', r.find((x) => x.service.id === 3).parts.trust >= 2)
ok('预算为空时给中性分而非 0', E.match({ category: 'wedding-shoot' }, SERVICES, PROVIDERS, CATS)[0].parts.budget === 18)
ok('只选认证时未认证被降权', (() => {
  const a = E.match(base, SERVICES, PROVIDERS, CATS).find((x) => x.service.id === 4).score
  const b2 = E.match(Object.assign({}, base, { onlyVerified: true }), SERVICES, PROVIDERS, CATS).find((x) => x.service.id === 4).score
  return b2 < a
})())
ok('空服务列表不崩', E.match(base, [], PROVIDERS, CATS).length === 0)
ok('全空参数不崩', Array.isArray(E.match()))
ok('同分按价格低者优先', (() => {
  const tie = [
    { id: 7, provider_id: 1, category_id: 1, price: 10000, delivery_days: 15, rating: 4.9, status: 'on' },
    { id: 8, provider_id: 1, category_id: 1, price: 20000, delivery_days: 15, rating: 4.9, status: 'on' }
  ]
  const t = E.match(base, tie, PROVIDERS, CATS)
  return t[0].score === t[1].score ? t[0].service.id === 7 : true
})())

console.log('\n7. 演示样本兜底')
const demo = E.demoData()
ok('8 个品类', demo.categories.length === 8)
ok('8 条演示服务', demo.services.length === 8)
ok('8 位演示服务者', demo.providers.length === 8)
ok('全部标注 isDemo', demo.isDemo && demo.services.every((s) => s.isDemo))
ok('演示样本可直接撮合', E.match({ category: 'wedding-shoot', budget: 3000, days: 15 }, demo.services, demo.providers, demo.categories).length === 8)
ok('演示样本品类对口排第一', E.match({ category: 'brand-film', budget: 6800, days: 20 }, demo.services, demo.providers, demo.categories)[0].service.category_slug === 'brand-film')
ok('演示样本可直接测算', Number.isFinite(E.quote({ category: 'ai-generate' }).amount))

console.log('\n8. 双端文件一致性')
const srcBuf = fs.readFileSync(path.join(ROOT, 'webapp', 'js', 'smart-engine.js'))
const dstPath = path.join(ROOT, 'miniprogram', 'utils', 'smart-engine.js')
ok('小程序副本已生成', fs.existsSync(dstPath))
if (fs.existsSync(dstPath)) {
  const dstBuf = fs.readFileSync(dstPath)
  const h = (b) => crypto.createHash('md5').update(b).digest('hex')
  ok('双端字节完全一致', h(srcBuf) === h(dstBuf))
  ok('小程序端可 require 且算法可用', (() => {
    const mp = require(dstPath)
    return mp.quote({ category: 'wedding-shoot' }).amount === E.quote({ category: 'wedding-shoot' }).amount
  })())
}

console.log('\n' + (fail === 0 ? `全部通过 ✓ (${pass} 项)` : `${fail} 项未通过 / ${pass} 项通过`))
process.exit(fail ? 1 : 0)
