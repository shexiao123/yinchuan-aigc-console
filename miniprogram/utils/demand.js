/**
 * 接单大厅数据层：需求池 + 抢单流转 + 资金冻结联动
 *
 * 两层数据：
 * 1) 云端 orders 表里 status=open 且 provider_id 为空的公开需求（真实订单池）
 * 2) 本地演示需求池：测试号 / 断网 / 云端不可达时，大厅也要有单可看可抢，
 *    否则页面永远是空的。本地单带 isLocal 标记，抢单与流转全程走本地 + 钱包记账。
 *
 * 资金规则（先用记账替代真实支付，2026-11-17 起按项目履约层统一）：
 * - 需求方发单：必须是已注册商家；冻结预算全额作为预付款 + 发布方保证金（默认 10%）
 * - 服务方抢单：冻结项目金额 15% 作为履约保证金（不再有 10%/最低 100 元旧规则）
 * - 交付需上传成片，由发布者审核；审核不通过需填修改意见 + 新提交日期
 * - 逾期未交付：从接单方保证金扣违约金，平台/发布者按 3:7 分账（默认值）
 * - 验收通过：双方保证金自动返还原支付账户；预付款结算，服务方入账（扣平台服务费）
 * - 取消：预付款与双方保证金全额解冻
 * 保证金/审核/违约金的唯一规则真源是 utils/guarantee.js，本文件只负责联动。
 */

const api = require('./api')
const wallet = require('./wallet')
const reqTpl = require('./requirement-templates')
const guarantee = require('./guarantee')

const KEY = 'gy_demand_v1'
const FEE_RATE = 0.08 // 平台服务费，真实值以 settings.commission_rate 为准

/* 演示需求也按「品类专属字段」填写：规范文本 `【标签】值` 逐行，
   展示端 buildRows 会反解析成键值行；老页面读到的是一段可读需求。 */
const DEMO = [
  {
    title: '银川葡萄酒庄园 · 品牌宣传片 3 分钟',
    categoryId: 3,
    categoryName: '品牌宣传片',
    reqCatId: 3,
    budget: 680000,
    deadline: '7 天内',
    requirement: [
      '【成片时长】3 分钟',
      '【拍摄内容】航拍葡萄园全景 + 酿酒车间特写',
      '【脚本分镜】需服务方策划',
      '【访谈人数】1-2 位',
      '【字幕】中文字幕',
      '【配乐】商用授权配乐',
      '【交付格式】横竖双版本',
      '【修改轮次】2 轮',
      '【补充说明】需体现贺兰山东麓产区特色，成片用于展会大屏与官网。'
    ].join('\n'),
    customerName: '贺兰山酒庄'
  },
  {
    title: '婚礼跟拍 · 双机位全天（10 月 26 日）',
    categoryId: 1,
    categoryName: '婚礼跟拍',
    reqCatId: 1,
    budget: 320000,
    deadline: '3 天内定档',
    requirement: [
      '【拍摄日期】2026-10-26',
      '【拍摄地点】银川 · 新娘家 + 阅海宾馆宴会厅',
      '【机位要求】双机位',
      '【服务时长】全天 + 晚宴',
      '【精修张数】9 张',
      '【交付物】底片 + 精修 + 当日快剪',
      '【风格倾向】纪实自然',
      '【补充说明】早上 7 点新娘家集合，希望多记录自然互动，当天出 9 张精修。'
    ].join('\n'),
    customerName: '马先生'
  },
  {
    title: '短视频代运营 · 每周 5 条口播',
    categoryId: 4,
    categoryName: '短视频剪辑',
    reqCatId: 4,
    budget: 400000,
    deadline: '长期合作',
    requirement: [
      '【视频条数】每周 5 条',
      '【单条时长】60 秒',
      '【画幅】竖屏 9:16',
      '【动态字幕】需要',
      '【封面设计】需要',
      '【统一调色】需要',
      '【素材来源】客户提供',
      '【结算方式】按月结算',
      '【补充说明】宁小杞食品品牌号，需统一片头片尾与字体规范，按月结算。'
    ].join('\n'),
    customerName: '宁小杞食品'
  },
  {
    title: '电商主图与详情页 · 20 款枸杞产品',
    categoryId: 5,
    categoryName: '商业摄影',
    reqCatId: 5,
    budget: 260000,
    deadline: '10 天内',
    requirement: [
      '【产品款数】20 款枸杞产品',
      '【每款张数】白底 + 场景 7 张',
      '【拍摄方式】组合方案',
      '【是否含精修】含精修',
      '【详情页切图】需要',
      '【交付格式】RAW + JPG',
      '【商用授权】需要商用授权',
      '【补充说明】棚拍静物，白底 5 张/款 + 场景图 2 张/款，需详情页切图。'
    ].join('\n'),
    customerName: '中宁枸杞旗舰店'
  },
  {
    title: 'AI 生成 · 文旅海报套组 8 张',
    categoryId: 7,
    categoryName: 'AI 生成',
    reqCatId: 7,
    budget: 90000,
    deadline: '5 天内',
    requirement: [
      '【生成主题】西夏陵、镇北堡、沙湖文旅海报',
      '【生成数量】8 张',
      '【画幅尺寸】竖版海报',
      '【视觉风格】国潮',
      '【商用授权】需要商用授权',
      '【含文字排版】需要',
      '【修改轮次】2 轮',
      '【补充说明】需适配线下展板与公众号头图两种版式，交付可编辑源文件。'
    ].join('\n'),
    customerName: '宁夏文旅推广中心'
  },
  {
    title: '漫剧制作 · 12 集竖屏短剧整案',
    categoryId: 8,
    categoryName: '漫剧制作',
    reqCatId: 8,
    budget: 1200000,
    deadline: '30 天内',
    requirement: [
      '【集数】12 集',
      '【每集时长】90 秒',
      '【剧本状态】剧本已定',
      '【画风】国漫',
      '【配音】需配音对接',
      '【交付范围】整案到成片',
      '【更新节奏】按周更新',
      '【补充说明】需要分镜、画格、配音对接与成片剪辑，人物设定需保持跨集一致。'
    ].join('\n'),
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
  if (d.items.length) {
    // 一次性升级：把早期只有纯文本 requirement 的演示项换成规范文本，
    // 只匹配演示 id（L1001~L1006），绝不改动用户自己发布的需求。
    if (!d.reqMigrated) {
      DEMO.forEach((demo, i) => {
        const old = d.items.filter((x) => String(x.id) === 'L' + (1001 + i))[0]
        if (old && !old.reqCatId) {
          old.requirement = demo.requirement
          old.reqCatId = demo.reqCatId
          old.reqCatName = demo.categoryName
        }
      })
      d.reqMigrated = true
      save(d)
    }
    return d
  }
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
  d.reqMigrated = true
  save(d)
  return d
}

/* ------------------------------------------------------------------ 视图模型 */

function yuanText(cents) {
  const n = Number(cents || 0) / 100
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

/** 接单保证金：项目金额 15%（规则真源在 guarantee.js） */
function depositOf(budget) {
  return guarantee.providerDepositOf(budget)
}

/** 项目履约档案 id：三套单子统一 source:原id */
function guaranteeId(id) {
  return guarantee.projectId('demand', id)
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
  const brief = reqTpl.briefRows(x, 2)
  const rows = reqTpl.buildRows(x)
  return {
    ...x,
    statusText: st.text,
    tone: st.tone,
    budgetText: yuanText(x.budget || x.amount),
    depositText: yuanText(depositOf(x.budget || x.amount)),
    modeText: x.mode || '远程交付',
    hoursText: hoursText(x),
    timeText: (x.createdAt || x.created_at || '').slice(5, 16).replace('T', ' '),
    // 结构化需求：新数据走 reqFields，老数据自动降级为「需求说明」单行
    reqRows: rows,
    reqBriefRows: brief.rows,
    reqMoreCount: Math.max(0, rows.length - brief.rows.length),
    hasReqRows: rows.length > 0,
    // 履约信息：保证金比例、交付截止日、是否已逾期
    guaranteeId: x.guaranteeId || guaranteeId(x.id),
    guaranteeText: '接单保证金 15%（¥' + yuanText(depositOf(x.budget || x.amount)) + '）',
    dueText: x.dueAt || hoursText(x),
    deliveryVideoPath: x.deliveryVideoPath || ''
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

/** 交付截止日：优先取页面日历，其次从「7 天内」这类交期文案换算 */
function dueAtFrom(deadline, explicit) {
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(String(explicit))) return String(explicit)
  const m = String(deadline || '').match(/(\d+)\s*天/)
  const dt = new Date()
  dt.setDate(dt.getDate() + (m ? Number(m[1]) : 7))
  return guarantee.dateStr(dt)
}

/** 发单：发布者须为已注册商家 → 冻结预算全额 + 发布方保证金 */
function publish(payload) {
  const d = seed()
  const budget = Math.round(Number(payload.budget || 0))
  if (budget < 10000) {
    const e = new Error('预算不能低于 100 元')
    e.code = 'BAD_BUDGET'
    throw e
  }
  // 资金预检：避免「保证金冻结成功、预付款冻结失败」造成半截账
  const pubDeposit = guarantee.publisherDepositOf(budget)
  if (wallet.load().balance < budget + pubDeposit) {
    const e = new Error('可用余额不足（需覆盖预付款与发布方保证金），请先充值')
    e.code = 'NO_BALANCE'
    throw e
  }
  const pid = guarantee.projectId('demand', 'L' + d.seq)
  const dueAt = dueAtFrom(payload.deadline, payload.dueAt)
  // 内部校验商家资质 + 冻结发布方保证金（幂等）
  guarantee.createProject({
    projectId: pid,
    source: 'demand',
    refId: 'L' + d.seq,
    title: payload.title,
    budget,
    publisherName: payload.customerName || '我',
    dueAt
  })
  const id = 'L' + d.seq++
  wallet.freeze(budget, '需求预付款冻结 · ' + payload.title, id)
  const item = {
    id,
    title: payload.title,
    categoryId: Number(payload.categoryId) || 0,
    categoryName: payload.categoryName || '综合服务',
    budget,
    deadline: payload.deadline || '待沟通',
    dueAt,
    guaranteeId: pid,
    // 规范文本 `【标签】值` 逐行，云端/老页面读到的仍是一段可读需求
    requirement: payload.requirement || payload.reqText || '',
    // 结构化副本，仅本地池保存，供键值渲染
    reqCatId: Number(payload.reqCatId) || Number(payload.categoryId) || 0,
    reqCatName: payload.reqCatName || payload.categoryName || '',
    reqFields: payload.reqFields || null,
    customerName: payload.customerName || '我',
    status: 'open',
    isLocal: true,
    mine: true,
    createdAt: new Date().toISOString(),
    timeline: [{ key: 'open', text: '需求已发布，预付款与发布方保证金已冻结', at: new Date().toISOString() }]
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
  const pid = item.guaranteeId || guaranteeId(item.id)
  // 历史演示单没有履约档案：懒建一份（不重复冻结发布方保证金）
  if (!item.guaranteeId) {
    guarantee.ensureProject({
      projectId: pid, source: 'demand', refId: item.id,
      title: item.title, budget: item.budget,
      publisherName: item.customerName || '发布商家',
      dueAt: item.dueAt || dueAtFrom(item.deadline)
    })
    item.guaranteeId = pid
  }
  const takenBy = (opts && opts.name) || '我'
  // 冻结 15% 履约保证金（幂等，资金动作由 guarantee 统一执行）
  guarantee.holdProviderDeposit(pid, takenBy)
  item.status = 'taken'
  item.deposit = deposit
  item.takenBy = takenBy
  item.timeline = (item.timeline || []).concat({
    key: 'taken',
    text: `服务者已接单，保证金 ${yuanText(deposit)} 元（15%）已冻结`,
    at: new Date().toISOString()
  })
  save(d)
  return decorate(item)
}

/** 上传成片（每个单子都有此通道）：同步履约档案 + 需求池状态 */
function deliver(id, opts) {
  const p = opts || {}
  const d = load()
  const item = d.items.find((x) => String(x.id) === String(id))
  if (!item) {
    const e = new Error('订单不存在')
    e.code = 'NOT_FOUND'
    throw e
  }
  const pid = item.guaranteeId || guaranteeId(item.id)
  if (!guarantee.get(pid)) {
    guarantee.ensureProject({
      projectId: pid, source: 'demand', refId: item.id,
      title: item.title, budget: item.budget,
      publisherName: item.customerName || '发布商家',
      dueAt: item.dueAt || dueAtFrom(item.deadline)
    })
    item.guaranteeId = pid
  }
  guarantee.submitDelivery(pid, {
    videoPath: p.videoPath || '',
    videoName: p.videoName || '成片.mp4',
    note: p.note || ''
  })
  item.deliveryVideoPath = p.videoPath || ''
  item.deliveryVideoName = p.videoName || ''
  item.deliveryNote = p.note || ''
  item.status = 'delivered'
  item.timeline = (item.timeline || []).concat({
    key: 'delivered', text: '作品已上传，等待发布者审核', at: new Date().toISOString()
  })
  save(d)
  return decorate(item)
}

/** 发布者审核：通过（无需意见，自动返还保证金）/ 驳回（必须意见 + 新提交日期） */
function review(id, action, payload) {
  const p = payload || {}
  const d = load()
  const item = d.items.find((x) => String(x.id) === String(id))
  if (!item) {
    const e = new Error('订单不存在')
    e.code = 'NOT_FOUND'
    throw e
  }
  const pid = item.guaranteeId || guaranteeId(item.id)
  const budget = Number(item.budget || 0)
  if (action === 'approve') {
    guarantee.approve(pid) // 双方保证金原路退回原支付账户
    const fee = Math.round(budget * FEE_RATE)
    wallet.settle(budget, '预付款结算 · ' + item.title, item.id)
    wallet.earn(budget - fee, `接单收入（扣平台服务费 ${yuanText(fee)} 元）· ` + item.title, item.id)
    item.status = 'completed'
    item.timeline = (item.timeline || []).concat({
      key: 'completed', text: '发布者审核通过，双方保证金已返还原支付账户', at: new Date().toISOString()
    })
  } else {
    const r = guarantee.reject(pid, { opinion: p.opinion, newDueAt: p.newDueAt })
    item.status = 'taken'
    item.dueAt = r.dueAt
    item.deliveryVideoPath = ''
    item.timeline = (item.timeline || []).concat({
      key: 'taken', text: `审核不通过：${String(p.opinion || '').trim()} · 新提交日期 ${r.dueAt}`, at: new Date().toISOString()
    })
  }
  save(d)
  return decorate(item)
}

/** 兼容旧的状态推进入口；资金动作统一由 guarantee 承担，避免重复解冻 */
function advance(id, next, opts) {
  if (next === 'delivered') return deliver(id, opts)
  if (next === 'completed') return review(id, 'approve', opts)
  const text = {
    producing: '开始制作',
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
  if (next === 'cancelled') {
    const pid = item.guaranteeId || guaranteeId(item.id)
    if (guarantee.get(pid)) guarantee.cancel(pid, '需求取消')
    wallet.unfreeze(budget, '预付款解冻 · ' + item.title, item.id)
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
  deliver,
  review,
  advance,
  decorate,
  depositOf,
  guaranteeId,
  dueAtFrom,
  yuanText,
  reset
}
