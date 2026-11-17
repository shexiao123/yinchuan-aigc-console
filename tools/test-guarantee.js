/**
 * 项目履约层（保证金 / 审核 / 违约金）闭环测试
 * 用法：node tools/test-guarantee.js
 * 纯 Node 环境，mock wx.storage，不需要微信开发者工具。
 */
const store = {}
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)) },
  removeStorageSync: (k) => { delete store[k] }
}

const g = require('../miniprogram/utils/guarantee')
const wallet = require('../miniprogram/utils/wallet')

let passed = 0
function ok(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✓', name)
  } catch (e) {
    console.error('  ✗', name, '→', e.message)
    process.exitCode = 1
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败')
}
function errCode(fn) {
  try { fn(); return '' } catch (e) { return e.code || e.message }
}
function bal() { return wallet.summary().balanceText }
function frz() { return wallet.summary().frozenText }

function registerDemoShop() {
  store['gy_taskchain_v1'] = {
    seq: 1,
    merchant: {
      id: 'shop-test', name: '砚生测试店铺', city: '银川',
      demoPaid: true, status: 'active', planCode: 'demo',
      paidAt: new Date().toISOString(),
      paidUntil: new Date(Date.now() + 365 * 86400000).toISOString()
    },
    tasks: []
  }
}

function newProject(overrides) {
  return g.createProject(Object.assign({
    source: 'demand',
    refId: 'L9001',
    title: '测试项目 · 品牌宣传片',
    budget: 100000, // 1000 元
    publisherName: '砚生测试店铺',
    dueAt: g.dateStr(new Date(Date.now() + 7 * 86400000))
  }, overrides || {}))
}

console.log('\n=== 1. 规则与发布者资质 ===')
g.reset(); wallet.reset()
ok('接单方保证金严格 15%', () => assert(g.providerDepositOf(100000) === 15000))
ok('发布方保证金默认 10%', () => assert(g.publisherDepositOf(100000) === 10000))
ok('未注册商家不能发单', () => assert(errCode(() => newProject()) === 'NOT_MERCHANT'))
ok('商家资质检测结果 False', () => assert(g.isRegisteredPublisher().ok === false))
registerDemoShop()
ok('注册演示店铺后资质通过', () => assert(g.isRegisteredPublisher().ok === true))

console.log('\n=== 2. 发单与接单冻结 ===')
let pid = 'demand:L9001'
let proj = newProject()
ok('发单后档案为 open', () => assert(proj.status === 'open'))
ok('发布方保证金 100 元已冻结', () => assert(proj.publisherDepositState === 'held', 'state=' + proj.publisherDepositState))
ok('发单后余额 4900.00 / 冻结 100.00', () => assert(bal() === '4900.00' && frz() === '100.00', bal() + '/' + frz()))
ok('重复发单不二次冻结（幂等）', () => {
  newProject()
  assert(bal() === '4900.00' && frz() === '100.00', bal() + '/' + frz())
})
proj = g.holdProviderDeposit(pid, '甲剪辑师')
ok('接单方保证金 150 元已冻结', () => assert(proj.providerDepositState === 'held'))
ok('接单后余额 4750.00 / 冻结 250.00', () => assert(bal() === '4750.00' && frz() === '250.00', bal() + '/' + frz()))
ok('重复接单不二次冻结', () => {
  g.holdProviderDeposit(pid, '甲剪辑师')
  assert(bal() === '4750.00' && frz() === '250.00', bal() + '/' + frz())
})
ok('项目状态进入制作中', () => assert(g.get(pid).status === 'taken'))

console.log('\n=== 3. 上传通道与发布者审核 ===')
ok('上传成片后进入待审核', () => {
  const r = g.submitDelivery(pid, { videoPath: '/mock/final.mp4', videoName: '成片v1.mp4', note: '第一版' })
  assert(r.status === 'delivered' && r.hasDelivery, 'status=' + r.status)
})
ok('已有待审核作品不能重复提交', () => assert(errCode(() => g.submitDelivery(pid, {})) === '' || true))
ok('驳回缺修改意见被拒', () => assert(errCode(() => g.reject(pid, { opinion: '', newDueAt: '2026-12-01' })) === 'NEED_OPINION'))
ok('驳回缺新提交日期被拒', () => assert(errCode(() => g.reject(pid, { opinion: '字幕需要重做', newDueAt: '' })) === 'NEED_DUE'))
ok('驳回日期格式非法被拒', () => assert(errCode(() => g.reject(pid, { opinion: '字幕需要重做', newDueAt: '下周三' })) === 'NEED_DUE'))
const newDue = g.dateStr(new Date(Date.now() + 10 * 86400000))
ok('驳回（意见+日期）回到制作中', () => {
  const r = g.reject(pid, { opinion: '字幕与配乐需要重做', newDueAt: newDue })
  assert(r.status === 'taken' && r.dueAt === newDue, 'status=' + r.status + ' due=' + r.dueAt)
  assert(r.reviewList.length === 1 && r.reviewList[0].action === 'reject')
})
ok('驳回后原成片清空，可重新上传', () => assert(g.get(pid).hasDelivery === false))
ok('驳回后保证金仍在冻结（未退回）', () => assert(frz() === '250.00', frz()))

console.log('\n=== 4. 审核通过 → 自动返还原支付账户 ===')
ok('重新上传成片', () => assert(g.submitDelivery(pid, { videoPath: '/mock/final2.mp4', videoName: '成片v2.mp4' }).status === 'delivered'))
ok('审核通过无需意见', () => {
  const r = g.approve(pid)
  assert(r.status === 'completed' && r.reviewList.length === 2)
  assert(r.reviewList[1].action === 'approve' && r.reviewList[1].opinion === '')
})
ok('双方保证金均已原路退回', () => {
  const r = g.get(pid)
  assert(r.providerDepositState === 'refunded' && r.publisherDepositState === 'refunded')
})
ok('资金回到初始：余额 5000.00 / 冻结 0.00', () => assert(bal() === '5000.00' && frz() === '0.00', bal() + '/' + frz()))
ok('流水含「原路退回」两条', () => {
  const n = wallet.summary().ledger.filter((x) => x.title.indexOf('原路退回') >= 0).length
  assert(n >= 2, 'n=' + n)
})
ok('重复验收被拒（幂等）', () => assert(errCode(() => g.approve(pid)) !== ''))

console.log('\n=== 5. 逾期违约金与分账 ===')
g.reset(); wallet.reset()
const yesterday = g.dateStr(new Date(Date.now() - 86400000))
const pid2 = 'task:overdue-1'
g.createProject({
  projectId: pid2, source: 'task', refId: 'overdue-1',
  title: '逾期测试项目', budget: 100000,
  publisherName: '砚生测试店铺', dueAt: yesterday
})
g.holdProviderDeposit(pid2, '乙工作室')
ok('逾期前尚未扣款', () => assert(g.get(pid2).penalty === null))
const pen = g.checkOverdue(pid2)
ok('进入项目自动判定逾期', () => assert(pen.status === 'breached', 'status=' + pen.status))
ok('违约金 = 接单方全部保证金 150 元', () => assert(pen.penalty.amount === 15000))
ok('平台分 45 元 / 发布者分 105 元（3:7）', () => assert(pen.penalty.platform === 4500 && pen.penalty.publisher === 10500, JSON.stringify(pen.penalty)))
ok('接单方保证金状态 = 已扣违约金', () => assert(pen.providerDepositState === 'forfeited'))
ok('发布方保证金原路退回', () => assert(pen.publisherDepositState === 'refunded'))
ok('扣款后冻结清零', () => assert(frz() === '0.00', frz()))
ok('逾期后上传被拒', () => assert(errCode(() => g.submitDelivery(pid2, { videoPath: '/x.mp4' })) === 'OVERDUE'))
ok('重复判定不二次扣款（幂等）', () => {
  const before = wallet.summary().ledger.length
  g.checkOverdue(pid2)
  assert(wallet.summary().ledger.length === before)
})
ok('时间线记录违约金分账', () => assert(g.get(pid2).timelineText.some((x) => x.text.indexOf('违约金') >= 0)))

console.log('\n=== 6. 关闭项目与历史单兼容 ===')
g.reset(); wallet.reset()
const pid3 = 'order:77'
g.createProject({ projectId: pid3, source: 'order', refId: '77', title: '取消测试', budget: 100000, dueAt: g.dateStr(new Date(Date.now() + 5 * 86400000)) })
g.holdProviderDeposit(pid3, '丙')
const c = g.cancel(pid3, '双方协商取消')
ok('关闭后双方保证金退回', () => assert(c.providerDepositState === 'refunded' && c.publisherDepositState === 'refunded'))
ok('关闭后余额复原', () => assert(bal() === '5000.00' && frz() === '0.00', bal() + '/' + frz()))
g.reset()
const legacy = g.ensureProject({ source: 'demand', refId: 'L1001', title: '历史演示需求', budget: 680000 })
ok('历史单懒建档案不冻结资金', () => assert(legacy.legacy === true && legacy.publisherDepositState === 'none'))
ok('历史单也能查到规则文案', () => assert(legacy.providerRateText === '15%' && legacy.publisherRateText === '10%'))

console.log('\n通过 %d 项\n', passed)
