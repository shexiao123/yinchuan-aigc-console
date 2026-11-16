/**
 * 接单大厅数据层：需求池 + 抢单流转 + 资金冻结联动
 *
 * 两层数据：
 * 1) 云端 orders 表里 status=open 且 provider_id 为空的公开需求（真实订单池）
 * 2) 本地演示需求池：测试号 / 断网 / 云端不可达时，大厅也要有单可看可抢，
 *    否则页面永远是空的。本地单带 isLocal 标记，抢单与流转全程走本地 + 钱包记账。
 *
 * 资金规则（先用记账替代真实支付）：
 * - 需求方发单：冻结预算全额作为预付款
 * - 服务方抢单：冻结预算 10%（最低 100 元）作为履约保证金
 * - 验收通过：预付款结算划出，保证金解冻，服务方余额入账（扣平台服务费）
 * - 取消/争议：预付款解冻退回，保证金解冻
 */

const api = require('./api')
const wallet = require('./wallet')

const KEY = 'gy_demand_v1'
const DEPOSIT_RATE = 0.1
const DEPOSIT_MIN = 10000 // 100.00 元
const FEE_RATE = 0.08 // 平台服务费，真实值以 settings.commission_rate 为准

const DEMO = [
  {
    title: '银川葡萄酒庄园 · 品牌宣传片 3 分钟',
    categoryId: 3,
    categoryName: '品牌宣传片',
    budget: 680000,
    deadline: '7 天内',
    requirement: '需要航拍葡萄园全景 + 酿酒车间特写，访谈 2 位酿酒师，成片 3 分钟，含字幕与配乐。',
    customerName: '贺兰山酒庄'
  },
  {
    title: '婚礼跟拍 · 双机位全天（10 月 26 日）',
    categoryId: 1,
    categoryName: '婚礼跟拍',
    budget: 320000,
    deadline: '3 天内定档',
    requirement: '早上 7 点新娘家集合，全天跟拍至晚宴结束，需双机位，当天出 9 张精修。',
    customerName: '马先生'
  },
  {
    title: '短视频代运营 · 每周 5 条口播',
    categoryId: 4,
    categoryName: '短视频剪辑',
    budget: 400000,
    deadline: '长期合作',
    requirement: '竖屏口播剪辑，含动态字幕、封面设计与统一调色，每周 5 条，按月结算。',
    customerName: '宁小杞食品'
  },
  {
    title: '电商主图与详情页 · 20 款枸杞产品',
    categoryId: 5,
    categoryName: '商业摄影',
    budget: 260000,
    deadline: '10 天内',
    requirement: '棚拍静物，白底 5 张/款 + 场景图 2 张/款，含精修与详情页切图。',
    customerName: '中宁枸杞旗舰店'
  },
  {
    title: 'AI 生成 · 文旅海报套组 8 张',
    categoryId: 7,
    categoryName: 'AI 生成',
    budget: 90000,
    deadline: '5 天内',
    requirement: '以西夏陵、镇北堡、沙湖为主题生成海报，需商用授权，含 2 轮修改。',
    customerName: '宁夏文旅推广中心'
  },
  {
    title: '漫剧制作 · 12 集竖屏短剧整案',
    categoryId: 8,
    categoryName: '漫剧制作',
    budget: 1200000,
    deadline: '30 天内',
    requirement: '剧本已定，需要分镜、画格、配音对接与成片剪辑，每集 90 秒。',
    customerName: '西夏幻影工作室'
  }
]

/* ------------------------------------------------------------------ 本地存储 */

function load() {
  try {
    const v = wx.getStorageSync(KEY)
    if (v && typeof v === 'object' && Array.isArray(v.items)) return v
  } catch (e) {
    console.error('[demand] load failed', e && e.message)
  }
  return { seq: 1, items: [] }
}

function save(d) {
  try {
    wx.setStorageSync(KEY, d)
  } catch (e) {
    console.error('[demand] save failed', e && e.message)
  }
}

/** 首次进入灌入演示需求，之后以用户自己的数据为准 */
function seed() {
  const d = load()
  if (d.items.length) return d
  const now = Date.now()
  DEMO.forEach((x, i) => {
    d.items.push({
      ...x,
      id: 'L' + (1001 + i),
      status: 'open',
      isLocal: true,
      createdAt: new Date(now - (i + 1) * 3600 * 1000).toISOString(),
      timeline: [{ key: 'open', text: '需求已发布，等待服务者接单', at: new Date(now - (i + 1) * 3600 * 1000).toISOString() }]
    })
  })
  d.seq = 1001 + DEMO.length
  save(d)
  return d
}

/* ------------------------------------------------------------------ 视图模型 */

function yuanText(cents) {
  const n = Number(cents || 0) / 100
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

function depositOf(budget) {
  return Math.max(Math.round((Number(budget) || 0) * DEPOSIT_RATE), DEPOSIT_MIN)
}

/** 时限：优先取 hours，其次从「7 天内 / 长期合作」这类交期文案里换算 */
function hoursText(x) {
  if (x.hours) return x.hours + ' 小时'
  const m = String(x.deadline || '').match(/(\d+)\s*天/)
  if (m) return Number(m[1]) * 24 + ' 小时'
  if (/长期|沟通|待定/.test(String(x.deadline || ''))) return '长期'
  return '待沟通'
}

function decorate(x) {
  const st = {
    open: { text: '待接单', tone: 'pending' },
    taken: { text: '已接单', tone: 'busy' },
    producing: { text: '制作中', tone: 'busy' },
    delivered: { text: '待验收', tone: 'delivered' },
    completed: { text: '已完成', tone: 'done' },
    cancelled: { text: '已取消', tone: 'cancelled' }
  }[x.status] || { text: x.status || '未知', tone: 'pending' }
  return {
    ...x,
    statusText: st.text,
    tone: st.tone,
    budgetText: yuanText(x.budget || x.amount),
    depositText: yuanText(depositOf(x.budget || x.amount)),
    modeText: x.mode || '远程交付',
    hoursText: hoursText(x),
    timeText: (x.createdAt || x.created_at || '').slice(5, 16).replace('T', ' ')
  }
}

/** 云端订单 → 大厅结构 */
function fromCloud(o) {
  return decorate({
    id: o.id,
    title: o.title,
    requirement: o.requirement,
    budget: o.amount,
    deadline: o.shoot_date || '',
    categoryName: o.category_name || '综合服务',
    categoryId: o.category_id || 0,
    customerName: o.customer_name || '平台用户',
    status: o.status,
    isLocal: false,
    createdAt: o.created_at,
    timeline: o.timeline || []
  })
}

/* ------------------------------------------------------------------ 读取 */

/** 大厅列表：云端优先，取不到就（并）上本地池，保证永远有单 */
async function listHall(categoryId) {
  let cloud = []
  try {
    const rows = await api.listOpenOrders(categoryId || undefined, 30)
    cloud = (rows || []).map(fromCloud)
  } catch (e) {
    console.warn('[demand] cloud pool unavailable, fallback to local')
  }
  const d = seed()
  const local = d.items
    .filter((x) => x.status === 'open')
    .filter((x) => !categoryId || Number(x.categoryId) === Number(categoryId))
    .map(decorate)
  const items = cloud.concat(local)
  return { items, source: cloud.length ? 'cloud' : 'local', cloudCount: cloud.length, localCount: local.length }
}

/** 我接的单（本地池里被我抢下的） */
function myTaken() {
  const d = load()
  return d.items.filter((x) => x.status !== 'open').map(decorate)
}

function getLocal(id) {
  const d = load()
  return d.items.find((x) => String(x.id) === String(id)) || null
}

/* ------------------------------------------------------------------ 写操作 */

/** 发单：冻结预算全额作为预付款 */
function publish(payload) {
  const d = seed()
  const budget = Math.round(Number(payload.budget || 0))
  if (budget < 10000) {
    const e = new Error('预算不能低于 100 元')
    e.code = 'BAD_BUDGET'
    throw e
  }
  const id = 'L' + d.seq++
  wallet.freeze(budget, '需求预付款冻结 · ' + payload.title, id)
  const item = {
    id,
    title: payload.title,
    categoryId: Number(payload.categoryId) || 0,
    categoryName: payload.categoryName || '综合服务',
    budget,
    deadline: payload.deadline || '待沟通',
    requirement: payload.requirement || '',
    customerName: payload.customerName || '我',
    status: 'open',
    isLocal: true,
    mine: true,
    createdAt: new Date().toISOString(),
    timeline: [{ key: 'open', text: '需求已发布，预付款已冻结', at: new Date().toISOString() }]
  }
  d.items.unshift(item)
  save(d)
  return decorate(item)
}

/** 抢单：冻结履约保证金，本地单直接落状态 */
function take(id, opts = {}) {
  const dict = {
    open: '需求已发布，等待服务者接单',
    taken: '服务者已接单，保证金已冻结',
    producing: '开始制作',
    delivered: '成片已交付，等待验收',
    completed: '验收通过，预付款已结算',
    cancelled: '订单取消，资金已解冻'
  }
  const d = load()
  const item = d.items.find((x) => String(x.id) === String(id))
  if (!item) {
    const e = new Error('该需求不在本地池，请到订单页操作')
    e.code = 'NOT_LOCAL'
    throw e
  }
  if (item.status !== 'open') {
    const e = new Error('这单已经被接走了')
    e.code = 'ALREADY_TAKEN'
    throw e
  }
  const deposit = depositOf(item.budget)
  wallet.freeze(deposit, '接单保证金冻结 · ' + item.title, item.id)
  item.status = 'taken'
  item.deposit = deposit
  item.takenBy = (opts && opts.name) || '我'
  item.timeline = (item.timeline || []).concat({
    key: 'taken',
    text: `服务者已接单，保证金 ${yuanText(deposit)} 元已冻结`,
    at: new Date().toISOString()
  })
  save(d)
  return decorate(item)
}

/** 推进状态：producing → delivered → completed / cancelled */
function advance(id, next) {
  const text = {
    producing: '开始制作',
    delivered: '成片已交付，等待验收',
    completed: '验收通过，预付款已结算，保证金已解冻',
    cancelled: '订单取消，资金已全额解冻'
  }[next] || next
  const d = load()
  const item = d.items.find((x) => String(x.id) === String(id))
  if (!item) {
    const e = new Error('订单不存在')
    e.code = 'NOT_FOUND'
    throw e
  }
  const budget = Number(item.budget || 0)
  const deposit = Number(item.deposit || depositOf(budget))

  if (next === 'completed') {
    const fee = Math.round(budget * FEE_RATE)
    wallet.settle(budget, '预付款结算 · ' + item.title, item.id)
    wallet.unfreeze(deposit, '保证金解冻 · ' + item.title, item.id)
    wallet.earn(budget - fee, `接单收入（扣平台服务费 ${yuanText(fee)} 元）· ` + item.title, item.id)
  } else if (next === 'cancelled') {
    // 需求方取消：预付款退回；已接单则保证金也解冻
    wallet.unfreeze(budget, '预付款解冻 · ' + item.title, item.id)
    if (item.status !== 'open') wallet.unfreeze(deposit, '保证金解冻 · ' + item.title, item.id)
  }

  item.status = next
  item.timeline = (item.timeline || []).concat({ key: next, text, at: new Date().toISOString() })
  save(d)
  return decorate(item)
}

function reset() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {
    console.error('[demand] reset failed', e && e.message)
  }
}

module.exports = {
  DEMO,
  seed,
  listHall,
  myTaken,
  getLocal,
  publish,
  take,
  advance,
  decorate,
  depositOf,
  yuanText,
  reset
}
