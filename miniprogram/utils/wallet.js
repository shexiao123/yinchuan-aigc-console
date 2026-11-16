/**
 * 冻结记账钱包（演示版 / 未接真实支付）
 *
 * 为什么是「记账」不是「支付」：平台代收代付在微信支付体系里属于二清，
 * 需要服务商分账资质。这里先把两道资金流（需求方预付款、服务方保证金）
 * 用冻结记账完整跑通，界面与交互跟真支付一致，后期接微信支付只换这一层实现。
 *
 * 约定：
 * - 金额一律用「分」，展示时再转元
 * - 余额 / 冻结 / 流水全部落 wx.storage，杀掉小程序也不丢
 * - freeze 只能从可用余额划到冻结；unfreeze 反向；settle 是冻结款直接划出（付给服务方）
 */

const KEY = 'gy_wallet_v1'
const INIT_BALANCE = 500000 // 5000.00 元演示余额

function defaults() {
  return { balance: INIT_BALANCE, frozen: 0, seq: 1, ledger: [] }
}

function load() {
  try {
    const v = wx.getStorageSync(KEY)
    if (v && typeof v === 'object' && typeof v.balance === 'number') return v
  } catch (e) {
    console.error('[wallet] load failed', e && e.message)
  }
  return defaults()
}

function save(w) {
  try {
    wx.setStorageSync(KEY, w)
  } catch (e) {
    console.error('[wallet] save failed', e && e.message)
  }
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function push(w, type, amount, title, ref) {
  w.ledger.unshift({
    id: 'T' + w.seq++,
    type,
    amount: Math.round(amount),
    title: title || '',
    ref: ref || '',
    at: stamp()
  })
  if (w.ledger.length > 120) w.ledger.length = 120
}

function need(amount) {
  const n = Math.round(Number(amount) || 0)
  if (n <= 0) {
    const e = new Error('金额不合法')
    e.code = 'BAD_AMOUNT'
    throw e
  }
  return n
}

/** 冻结：可用 → 冻结 */
function freeze(amount, title, ref) {
  const n = need(amount)
  const w = load()
  if (w.balance < n) {
    const e = new Error('可用余额不足，请先充值')
    e.code = 'NO_BALANCE'
    throw e
  }
  w.balance -= n
  w.frozen += n
  push(w, 'freeze', n, title, ref)
  save(w)
  return w
}

/** 解冻：冻结 → 可用 */
function unfreeze(amount, title, ref) {
  const n = need(amount)
  const w = load()
  const back = Math.min(n, w.frozen)
  w.frozen -= back
  w.balance += back
  push(w, 'unfreeze', back, title, ref)
  save(w)
  return w
}

/** 结算：冻结款直接划出（平台扣除服务费后付给服务方） */
function settle(amount, title, ref) {
  const n = need(amount)
  const w = load()
  const out = Math.min(n, w.frozen)
  w.frozen -= out
  push(w, 'settle', out, title, ref)
  save(w)
  return w
}

/** 收入：验收完成后服务方到账 */
function earn(amount, title, ref) {
  const n = need(amount)
  const w = load()
  w.balance += n
  push(w, 'earn', n, title, ref)
  save(w)
  return w
}

/** 提现：可用余额划出（真实打款由后端处理，这里只记账） */
function withdraw(amount, title, ref) {
  const n = need(amount)
  const w = load()
  if (w.balance < n) {
    const e = new Error('可提现余额不足')
    e.code = 'NO_BALANCE'
    throw e
  }
  w.balance -= n
  push(w, 'withdraw', n, title, ref)
  save(w)
  return w
}

/** 演示充值（真实版这里接微信支付下单） */
function recharge(amount = 500000) {
  const n = need(amount)
  const w = load()
  w.balance += n
  push(w, 'recharge', n, '演示充值（未接真实支付）', '')
  save(w)
  return w
}

function typeText(t) {
  return ({
    freeze: '冻结',
    unfreeze: '解冻',
    settle: '支付',
    earn: '收入',
    recharge: '充值',
    withdraw: '提现'
  })[t] || t
}

/** 页面用：直接返回可展示的文案，避免每个页面重复写转换 */
function summary() {
  const w = load()
  const yuan = (c) => (Number(c || 0) / 100).toFixed(2)
  const earned = w.ledger.filter((x) => x.type === 'earn').reduce((a, b) => a + b.amount, 0)
  const earnedCount = w.ledger.filter((x) => x.type === 'earn').length
  const settledOut = w.ledger.filter((x) => x.type === 'settle').reduce((a, b) => a + b.amount, 0)
  return {
    balance: w.balance,
    frozen: w.frozen,
    balanceText: yuan(w.balance),
    frozenText: yuan(w.frozen),
    totalText: yuan(w.balance + w.frozen),
    earnedText: yuan(earned),
    earnedCount,
    settledText: yuan(settledOut),
    avgText: earnedCount ? yuan(Math.round(earned / earnedCount)) : '0.00',
    ledger: w.ledger.map((x) => ({
      ...x,
      amountText: yuan(x.amount),
      typeText: typeText(x.type),
      sign: x.type === 'freeze' || x.type === 'settle' || x.type === 'withdraw' ? '-' : '+'
    }))
  }
}

function reset() {
  save(defaults())
}

module.exports = {
  load,
  freeze,
  unfreeze,
  settle,
  earn,
  withdraw,
  recharge,
  summary,
  reset
}
