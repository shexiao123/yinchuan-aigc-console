/**
 * 统一任务链数据层闭环测试（Node 环境，用 mock wx 跑）
 * 运行：node tools/test-taskchain.js
 *
 * 覆盖：入驻 → 演示开通 → 发布任务/视频 → 报名 → 选定 → 交付 → 打回 → 重交 → 验收
 *      以及统计口径、公开池过滤、非法状态迁移拦截。
 */
const path = require('path')
const assert = require('assert')

// ---------- mock 小程序运行时 ----------
const store = {}
let currentUid = 'user-a'

global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)) },
  env: { USER_DATA_PATH: '/mock/usr' },
  getFileSystemManager: () => ({
    saveFileSync: (temp, target) => target
  })
}
global.getApp = () => ({
  globalData: {
    session: { user: { id: currentUid, nickname: currentUid === 'user-a' ? '甲剪辑师' : '乙工作室' } }
  }
})

const chain = require(path.join(__dirname, '../miniprogram/utils/taskchain'))

let passed = 0
function ok(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✓ ' + name)
  } catch (e) {
    console.error('  ✗ ' + name + ' → ' + e.message)
    process.exitCode = 1
  }
}

console.log('\n统一任务链闭环测试\n')

chain.reset()
ok('初始态为空', () => {
  assert.strictEqual(chain.listTasks().length, 0)
  assert.strictEqual(chain.isDemoActive(), false)
})

ok('保存商家资料需校验名称', () => {
  assert.throws(() => chain.saveMerchant({ name: 'A' }), /至少 2 个字/)
  const m = chain.saveMerchant({ name: '贺兰山视觉', city: '银川', planCode: 'pro' })
  assert.strictEqual(m.name, '贺兰山视觉')
})

ok('演示开通后进入有效状态', () => {
  chain.activateDemo('pro')
  assert.strictEqual(chain.isDemoActive(), true)
  const info = chain.paidInfo()
  assert.strictEqual(info.demo, true)
  assert.ok(info.daysLeft > 300)
})

let taskId = ''
ok('发布任务并保存参考视频', () => {
  const t = chain.publishTask({
    title: '连锁餐饮 30 秒宣传片',
    description: '需要竖屏 + 横屏两版',
    budget: 800000,
    category_slug: 'brand-film',
    videoTempPath: '/tmp/ref.mp4',
    videoName: '参考.mp4',
    videoSize: 1024
  })
  taskId = t.id
  assert.strictEqual(t.status, 'open')
  assert.strictEqual(t.statusText, '招募中')
  assert.ok(t.videoUrl.indexOf('/mock/usr/tc_ref_') === 0, '参考视频应落本地永久路径')
  assert.strictEqual(t.budgetText, '¥8000')
  assert.strictEqual(t.hasVideo, true)
})

ok('任务进入公开在招池', () => {
  assert.strictEqual(chain.listTasks({ publicOnly: true }).length, 1)
})

ok('报名 + 重复报名拦截', () => {
  chain.applyTask(taskId, '做过同类品牌片')
  assert.strictEqual(chain.getTask(taskId).applicantCount, 1)
  assert.throws(() => chain.applyTask(taskId, '再来一次'), /已经报名过/)
})

ok('第二个服务者报名', () => {
  currentUid = 'user-b'
  chain.applyTask(taskId, '有婚礼跟拍团队')
  assert.strictEqual(chain.getTask(taskId).applicantCount, 2)
})

let appAId = ''
ok('商家选定承接方 → 制作中，其余报名标记未入选', () => {
  const t = chain.getTask(taskId)
  appAId = t.applications.filter((a) => a.applicantId === 'user-a')[0].id
  const next = chain.selectApplicant(taskId, appAId)
  assert.strictEqual(next.status, 'taken')
  assert.strictEqual(next.selectedApplicant, '甲剪辑师')
  const states = next.applications.map((a) => a.status).sort().join(',')
  assert.strictEqual(states, 'rejected,selected')
})

ok('完成后不能再报名', () => {
  assert.throws(() => chain.applyTask(taskId, '还能报吗'), /已停止招募/)
})

ok('承接方交付成片', () => {
  const t = chain.deliverTask(taskId, {
    videoTempPath: '/tmp/final.mp4',
    videoName: '成片v1.mp4',
    note: '第一版'
  })
  assert.strictEqual(t.status, 'delivered')
  assert.ok(t.deliveryUrl.indexOf('/mock/usr/tc_delivery_') === 0)
  assert.strictEqual(t.deliveryVideoName, '成片v1.mp4')
})

ok('商家打回重做 → 回到制作中', () => {
  const t = chain.rejectDelivery(taskId, '片头字幕要改')
  assert.strictEqual(t.status, 'taken')
  assert.ok(t.timeline.some((x) => x.text.indexOf('打回') >= 0))
})

ok('重新交付后商家验收通过', () => {
  chain.deliverTask(taskId, { videoTempPath: '/tmp/final2.mp4', videoName: '成片v2.mp4' })
  const t = chain.acceptTask(taskId, '验收通过')
  assert.strictEqual(t.status, 'completed')
  assert.strictEqual(t.statusText, '已完成')
  assert.ok(t.timeline.length >= 6, '时间线应记录完整流转')
})

ok('已完成任务不能再推进', () => {
  assert.throws(() => chain.cancelTask(taskId), /不能关闭/)
  assert.throws(() => chain.deliverTask(taskId, { videoTempPath: '/tmp/x.mp4' }), /不能交付/)
})

ok('6 宫格统计口径', () => {
  const s = chain.statsFrom([
    { status: 'open' }, { status: 'taken' }, { status: 'producing' },
    { status: 'delivered' }, { status: 'completed' }, { status: 'cancelled' },
    { status: 'refund' }
  ])
  assert.deepStrictEqual(s, { pending: 1, doing: 2, check: 1, refund: 1, done: 1, closed: 1 })
})

ok('云端/本地/商家三源合并统计', () => {
  const s = chain.mergeStats(
    [{ status: 'open' }, { status: 'completed' }],
    [{ status: 'producing' }],
    [{ status: 'delivered' }]
  )
  assert.deepStrictEqual(s, { pending: 1, doing: 1, check: 1, refund: 0, done: 1, closed: 0 })
})

ok('公开池不再含已完成任务', () => {
  assert.strictEqual(chain.listTasks({ publicOnly: true }).length, 0)
  assert.strictEqual(chain.listTasks().length, 1)
})

ok('reset 清空数据', () => {
  chain.reset()
  assert.strictEqual(chain.listTasks().length, 0)
  assert.strictEqual(chain.isDemoActive(), false)
})

console.log(`\n通过 ${passed} 项\n`)
