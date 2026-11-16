/**
 * 接单框架数据层闭环测试（不需要微信环境）
 * 用法：node tools/test-demand.js
 * 覆盖：发单冻结预付款 → 大厅可见 → 抢单冻结保证金 → 制作/交付/验收 → 结算入账
 */
const Module = require('module')
const path = require('path')

const DEMAND_FILE = path.resolve(__dirname, '../miniprogram/utils/demand.js')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === './api' && parent && parent.filename === DEMAND_FILE) {
    return {
      listOpenOrders: async () => {
        throw new Error('offline test')
      }
    }
  }
  return origLoad.apply(this, arguments)
}

const store = {}
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => {
    store[k] = v
  },
  removeStorageSync: (k) => {
    delete store[k]
  }
}

const demand = require('../miniprogram/utils/demand')
const wallet = require('../miniprogram/utils/wallet')

const ok = []
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
  } else {
    ok.push(msg)
  }
}

async function main() {
  let w = wallet.summary()
  assert(w.balanceText === '5000.00', '初始余额 5000.00，实际 ' + w.balanceText)

  // 1. 发单：冻结预算全额
  const item = demand.publish({
    title: '测试需求 · 银川文旅宣传片',
    budget: 100000, // 1000 元
    requirement: '需要航拍与访谈，成片 2 分钟，含字幕',
    deadline: '7 天内',
    categoryId: 3,
    categoryName: '品牌宣传片'
  })
  w = wallet.summary()
  assert(w.balanceText === '4000.00', '发单后可用余额 4000.00，实际 ' + w.balanceText)
  assert(w.frozenText === '1000.00', '发单后冻结 1000.00，实际 ' + w.frozenText)

  // 2. 大厅可见
  const hall = await demand.listHall(0)
  assert(hall.items.some((x) => String(x.id) === String(item.id)), '新发需求出现在大厅')
  assert(hall.source === 'local', '云端不可达时标记本地池，实际 ' + hall.source)

  // 3. 抢单：冻结 10% 保证金（1000×10%=100）
  demand.take(item.id, { name: '测试服务者' })
  w = wallet.summary()
  assert(w.balanceText === '3900.00', '抢单后可用余额 3900.00，实际 ' + w.balanceText)
  assert(w.frozenText === '1100.00', '抢单后冻结 1100.00（预付 1000 + 保证金 100），实际 ' + w.frozenText)

  // 4. 重复抢单应被拒
  let dup = ''
  try {
    demand.take(item.id, {})
  } catch (e) {
    dup = e.code
  }
  assert(dup === 'ALREADY_TAKEN', '重复抢单被拒（ALREADY_TAKEN），实际 ' + dup)

  // 5. 状态推进
  demand.advance(item.id, 'producing')
  demand.advance(item.id, 'delivered')
  const done = demand.advance(item.id, 'completed')
  assert(done.statusText === '已完成', '流转到已完成，实际 ' + done.statusText)

  // 6. 结算：预付款划出、保证金解冻、扣 8% 服务费入账
  w = wallet.summary()
  assert(w.frozenText === '0.00', '结算后冻结清零，实际 ' + w.frozenText)
  // 3900 + 100(保证金解冻) + 920(1000 - 80 服务费) = 4920
  assert(w.balanceText === '4920.00', '结算后余额 4920.00，实际 ' + w.balanceText)

  // 7. 余额不足保护
  let noBal = ''
  try {
    demand.publish({
      title: '超额需求测试单',
      budget: 900000,
      requirement: '预算远超余额，应当被拒绝',
      categoryId: 3,
      categoryName: '品牌宣传片'
    })
  } catch (e) {
    noBal = e.code
  }
  assert(noBal === 'NO_BALANCE', '余额不足时拒绝发单（NO_BALANCE），实际 ' + noBal)

  console.log('\n通过 %d 项：', ok.length)
  ok.forEach((x) => console.log('  ✓', x))
  console.log('\n流水：')
  wallet.summary().ledger.forEach((x) => console.log('  ', x.at, x.typeText, x.sign + x.amountText, x.title))
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(1)
})
