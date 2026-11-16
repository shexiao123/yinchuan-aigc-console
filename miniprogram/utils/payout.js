/**
 * 提现与收款账户（前端演示层）
 *
 * 合规说明（重要）：
 * - 微信零钱提现需企业主体 + 微信支付商户号开通「企业付款到零钱」，且平台代收代付涉及二清风险，
 *   真实上线需走服务商分账或持牌机构；本文件只做前端流程与记账。
 * - 支付宝、银行卡提现属于「后端出款」，小程序内不得跳转支付宝、不得内嵌支付宝 SDK。
 * - 银行卡号不存明文：只保留脱敏尾号用于展示，完整卡号应提交后端加密存 token。
 *
 * 金额一律用「分」。
 */

const KEY = 'gy_payout_v1'
const wallet = require('./wallet')

const MIN_WITHDRAW = 1000 // 10.00 元起提
const DAILY_LIMIT = 5000000 // 50000.00 元/日（演示限额，真实值以后端风控为准）
const DAY_MS = 24 * 3600 * 1000

function defaults() {
  return {
    seq: 1,
    accounts: [
      {
        id: 'W1',
        type: 'wechat',
        label: '微信零钱',
        sub: '当前微信账号',
        holder: '',
        masked: '',
        isDefault: true,
        removable: false
      }
    ],
    records: []
  }
}

function load() {
  try {
    const v = wx.getStorageSync(KEY)
    if (v && typeof v === 'object' && Array.isArray(v.accounts)) return v
  } catch (e) {
    console.error('[payout] load failed', e && e.message)
  }
  return defaults()
}

function save(d) {
  try {
    wx.setStorageSync(KEY, d)
  } catch (e) {
    console.error('[payout] save failed', e && e.message)
  }
}

function stamp(ts) {
  const d = new Date(ts || Date.now())
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function yuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2)
}

/* ---------------------------------------------------------------- 脱敏 */

/** 银行卡：只留后 4 位，前面按 4 位一组打星 */
function maskBank(cardNo) {
  const s = String(cardNo || '').replace(/\s+/g, '')
  const tail = s.slice(-4)
  return '**** **** **** ' + tail
}

/** 支付宝：邮箱保留前 2 位与域名；手机号保留前 3 后 4 */
function maskAlipay(account) {
  const s = String(account || '')
  if (s.indexOf('@') > 0) {
    const [name, domain] = s.split('@')
    const head = name.slice(0, 2)
    return head + '***@' + domain
  }
  if (/^\d{11}$/.test(s)) return s.slice(0, 3) + '****' + s.slice(-4)
  return s.slice(0, 2) + '***'
}

function typeLabel(type) {
  return ({ wechat: '微信零钱', alipay: '支付宝', bank: '银行卡' })[type] || type
}

function arriveText(type) {
  // 到账时效以支付渠道实际规则为准，此处只给通用说明
  if (type === 'wechat') return '预计 2 小时内到账'
  if (type === 'alipay') return '预计 T+1 到账'
  return '预计 1-2 个工作日到账'
}

/* ---------------------------------------------------------------- 账户 */

function listAccounts() {
  const d = load()
  return d.accounts.map((a) => ({
    ...a,
    typeText: typeLabel(a.type),
    arriveText: arriveText(a.type)
  }))
}

/** 银行卡校验：只做长度与数字校验，真实性由后端四要素/鉴权验证 */
function addBank({ cardNo, bankName, holder, phone }) {
  const no = String(cardNo || '').replace(/\s+/g, '')
  if (!/^\d{16,19}$/.test(no)) {
    const e = new Error('银行卡号需 16-19 位数字')
    e.code = 'BAD_CARD'
    throw e
  }
  if (!bankName || !bankName.trim()) {
    const e = new Error('请填写开户银行')
    e.code = 'BAD_BANK'
    throw e
  }
  if (!holder || holder.trim().length < 2) {
    const e = new Error('请填写持卡人姓名（须与实名一致）')
    e.code = 'BAD_HOLDER'
    throw e
  }
  if (!/^\d{11}$/.test(String(phone || ''))) {
    const e = new Error('请填写银行预留手机号')
    e.code = 'BAD_PHONE'
    throw e
  }
  const d = load()
  if (d.accounts.some((a) => a.type === 'bank' && a.tail === no.slice(-4) && a.bankName === bankName)) {
    const e = new Error('这张卡已经添加过了')
    e.code = 'DUP_CARD'
    throw e
  }
  const acc = {
    id: 'B' + d.seq++,
    type: 'bank',
    label: bankName.trim(),
    bankName: bankName.trim(),
    sub: '储蓄卡',
    holder: holder.trim(),
    masked: maskBank(no),
    tail: no.slice(-4),
    isDefault: d.accounts.length === 0,
    removable: true
  }
  d.accounts.push(acc)
  save(d)
  return acc
}

function addAlipay({ account, holder }) {
  const s = String(account || '').trim()
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || /^\d{11}$/.test(s)
  if (!ok) {
    const e = new Error('请填写正确的支付宝账号（邮箱或手机号）')
    e.code = 'BAD_ALIPAY'
    throw e
  }
  if (!holder || holder.trim().length < 2) {
    const e = new Error('请填写实名姓名（须与支付宝一致）')
    e.code = 'BAD_HOLDER'
    throw e
  }
  const d = load()
  const acc = {
    id: 'A' + d.seq++,
    type: 'alipay',
    label: '支付宝',
    sub: '个人账号',
    holder: holder.trim(),
    masked: maskAlipay(s),
    isDefault: d.accounts.length === 0,
    removable: true
  }
  d.accounts.push(acc)
  save(d)
  return acc
}

function removeAccount(id) {
  const d = load()
  const idx = d.accounts.findIndex((a) => a.id === id)
  if (idx < 0) return
  if (!d.accounts[idx].removable) {
    const e = new Error('微信零钱为默认到账方式，不可删除')
    e.code = 'NOT_REMOVABLE'
    throw e
  }
  const wasDefault = d.accounts[idx].isDefault
  d.accounts.splice(idx, 1)
  if (wasDefault && d.accounts.length) d.accounts[0].isDefault = true
  save(d)
}

function setDefault(id) {
  const d = load()
  d.accounts.forEach((a) => {
    a.isDefault = a.id === id
  })
  save(d)
}

/* ---------------------------------------------------------------- 提现 */

function todayUsed() {
  const d = load()
  const since = Date.now() - DAY_MS
  return d.records
    .filter((r) => r.ts > since && r.status !== 'failed')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
}

/**
 * 提交提现申请：校验 → 扣减可用余额 → 生成处理中记录
 * 真实环境下这一步应该是：请求后端创建提现单 → 后端调渠道打款 → 回调改状态
 */
function submitWithdraw({ amount, accountId }) {
  const n = Math.round(Number(amount) || 0)
  if (n < MIN_WITHDRAW) {
    const e = new Error('单笔最低提现 ' + yuan(MIN_WITHDRAW) + ' 元')
    e.code = 'TOO_SMALL'
    throw e
  }
  const d = load()
  const acc = d.accounts.find((a) => a.id === accountId)
  if (!acc) {
    const e = new Error('请选择到账方式')
    e.code = 'NO_ACCOUNT'
    throw e
  }
  const w = wallet.load()
  if (n > w.balance) {
    const e = new Error('可提现余额不足')
    e.code = 'NO_BALANCE'
    throw e
  }
  if (todayUsed() + n > DAILY_LIMIT) {
    const e = new Error('超出单日提现限额（' + yuan(DAILY_LIMIT) + ' 元）')
    e.code = 'OVER_LIMIT'
    throw e
  }

  const fee = 0 // 演示：不收费；真实费率以支付渠道为准，不要写死
  const record = {
    id: 'R' + d.seq++,
    amount: n,
    fee,
    net: n - fee,
    accountId: acc.id,
    accountType: acc.type,
    accountLabel: acc.type === 'bank' ? acc.label + ' ' + acc.masked.slice(-4) : acc.label + ' ' + acc.masked,
    status: 'processing',
    statusText: '处理中',
    ts: Date.now(),
    at: stamp()
  }

  wallet.withdraw(n, '提现到' + acc.label + (acc.type === 'bank' ? '（尾号 ' + acc.tail + '）' : ''), record.id)

  d.records.unshift(record)
  if (d.records.length > 50) d.records.length = 50
  save(d)
  // 返回带展示文案的对象，页面直接用
  return {
    ...record,
    amountText: yuan(record.amount),
    netText: yuan(record.net),
    typeText: typeLabel(record.accountType)
  }
}

function listRecords() {
  return load().records.map((r) => ({
    ...r,
    amountText: yuan(r.amount),
    netText: yuan(r.net),
    typeText: typeLabel(r.accountType)
  }))
}

function rules() {
  return {
    minText: yuan(MIN_WITHDRAW),
    dailyText: yuan(DAILY_LIMIT),
    todayUsedText: yuan(todayUsed())
  }
}

function reset() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {
    console.error('[payout] reset failed', e && e.message)
  }
}

module.exports = {
  MIN_WITHDRAW,
  listAccounts,
  addBank,
  addAlipay,
  removeAccount,
  setDefault,
  submitWithdraw,
  listRecords,
  rules,
  maskBank,
  maskAlipay,
  reset
}
