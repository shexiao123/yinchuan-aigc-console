/**
 * 小程序智能工作台页面逻辑 E2E（Node 模拟 Page 生命周期）
 * 不依赖微信开发者工具：mock wx / Page / setData，直接跑页面 JS。
 * 覆盖：初始化、演示样本降级、撮合结果结构、报价拆解、交互重算、Tab 切换。
 */
const path = require('path')

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')) }
}

let pageObj = null
global.Page = (o) => { pageObj = o }
global.wx = {
  showToast: () => {},
  navigateTo: () => {},
  switchTab: () => {},
  getStorageSync: () => null,
  setStorageSync: () => {}
}
global.getApp = () => ({ globalData: {} })

const PAGE = path.resolve(__dirname, '..', 'miniprogram', 'pages', 'smart', 'smart.js')
require(PAGE)

console.log('=== 小程序智能工作台 · 页面逻辑 E2E ===\n')

ok('Page 已注册', !!pageObj && typeof pageObj.data === 'object')

// 构造可运行的页面实例：data 深拷贝 + setData 合并 + 方法绑定
const ctx = Object.assign({}, pageObj)
ctx.data = JSON.parse(JSON.stringify(pageObj.data))
ctx.setData = function (obj) { Object.assign(ctx.data, obj) }
Object.keys(pageObj).forEach((k) => {
  if (typeof pageObj[k] === 'function') ctx[k] = pageObj[k].bind(ctx)
})

console.log('\n1. 初始化')
// 只测首屏确定性逻辑；云端覆盖走异步，单独由超时保护，不纳入本 E2E
ctx.upgradeFromCloud = () => {}
ctx.onLoad()
ok('8 个品类已载入', ctx.data.catNames.length === 8)
ok('规格 / 排期下拉已构建', ctx.data.specNames.length === 3 && ctx.data.rushNames.length === 3)
ok('5 项权重已载入', ctx.data.weights.length === 5)
ok('云端不可用时降级为演示样本', ctx.data.isDemo === true)
ok('演示样本标注在结果标题里', /演示样本/.test(ctx.data.resultTitle))

console.log('\n2. 撮合结果结构')
ok('匹配出 6 条结果', ctx.data.results.length === 6, 'len=' + ctx.data.results.length)
ok('结果按分数降序', ctx.data.results.every((r, i) => i === 0 || ctx.data.results[i - 1].score >= r.score))
ok('分数在 0–100', ctx.data.results.every((r) => r.score >= 0 && r.score <= 100))
ok('每条含 5 个维度条', ctx.data.results.every((r) => r.bars.length === 5))
ok('维度条百分比合法', ctx.data.results.every((r) => r.bars.every((b) => b.pct >= 0 && b.pct <= 100)))
ok('每条含推荐理由', ctx.data.results.every((r) => r.reasons.length > 0))
ok('金额已格式化为 ¥', /^¥/.test(ctx.data.results[0].price))
ok('演示服务带 isDemo 标记', ctx.data.results[0].isDemo === true)

console.log('\n3. 报价拆解')
ok('报价对象已生成', !!ctx.data.quote)
ok('拆解共 8 行', ctx.data.quote.lines.length === 8, 'len=' + ctx.data.quote.lines.length)
ok('区间金额格式正确', /^¥/.test(ctx.data.quote.low) && /^¥/.test(ctx.data.quote.high))
ok('低价低于建议预算', parseFloat(ctx.data.quote.low.replace(/[^\d.]/g, '')) < parseFloat(ctx.data.quote.amount.replace(/[^\d.]/g, '')))
ok('高价高于建议预算', parseFloat(ctx.data.quote.high.replace(/[^\d.]/g, '')) > parseFloat(ctx.data.quote.amount.replace(/[^\d.]/g, '')))
ok('含平台服务费 10%', ctx.data.quote.lines.some((l) => /平台服务费/.test(l.label) && /10%/.test(l.note)))
ok('含 3:7 违约金分账', ctx.data.quote.lines.some((l) => /平台分成/.test(l.label)) && ctx.data.quote.lines.some((l) => /发布者分成/.test(l.label)))
ok('免责声明含「演示」', /演示/.test(ctx.data.quote.disclaimer))

console.log('\n4. 交互重算')
const before = ctx.data.results[0].score
ctx.form.budget = 200
ctx.runMatch()
const after = ctx.data.results[0].score
ok('预算变化后重新撮合', after !== before || ctx.data.results[0].score !== before, before + ' → ' + after)
ok('低预算触发超预算提示', ctx.data.results.some((r) => r.cautions.length > 0))
ctx.form.budget = 3000
ctx.onRushChange({ detail: { value: 2 } })
ctx.onSpecChange({ detail: { value: 2 } })
ctx.runQuote()
ok('极急 + 旗舰档报价上浮',
  parseFloat(ctx.data.quote.amount.replace(/[^\d.]/g, '')) > 3000,
  ctx.data.quote.amount)
ok('极急工期缩短', ctx.data.quote.days < 15, 'days=' + ctx.data.quote.days)
ctx.onTab({ currentTarget: { dataset: { tab: 'quote' } } })
ok('可切换到报价 Tab', ctx.data.tab === 'quote')
ctx.onTab({ currentTarget: { dataset: { tab: 'match' } } })
ok('可切回撮合 Tab', ctx.data.tab === 'match')

console.log('\n' + (fail === 0 ? `全部通过 ✓ (${pass} 项)` : `${fail} 项未通过 / ${pass} 项通过`))
process.exit(fail ? 1 : 0)
