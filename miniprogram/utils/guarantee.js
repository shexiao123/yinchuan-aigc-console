/**
 * 项目履约 · 保证金 / 交付审核 / 违约金（演示记账版，未接真实支付）
 *
 * 规则来源（2026-11-17 舍先生需求）：
 *  1. 每个单子都有上传项目通道，交付后由发布者审核
 *  2. 审核通过无需写意见；审核不通过必须填「修改意见 + 新的提交日期」
 *  3. 截止日期前未交付作品 → 扣除相应违约金，由平台与发布者按规则分账
 *  4. 每个接单的人缴纳项目金额 15% 的保证金（明确值）
 *  5. 项目交付完成后，保证金自动返还「原支付账户」
 *  6. 发布者也需缴纳保证金，且发布者必须是已注册商家
 *
 * 默认值（需求未给定，集中在 RULES，改一处即可，不散落在页面里）：
 *  - 发布方保证金 10%
 *  - 逾期违约金 = 没收接单方全部保证金
 *  - 违约金分账：平台 30% / 发布者 70%
 *  以上三项是演示默认值，需舍先生拍板后再定稿。
 *
 * ⚠️ 合规红线：真实的冻结、分账、原路退回都需要微信支付服务商/分账资质，
 *    本模块全部走 wx.storage 冻结记账（wallet.js），不产生任何真实付款。
 *    「原支付账户」在演示态只记录渠道名称，真实退款由后端按支付单原路退回。
 *
 * 覆盖三套单子：本地需求池(source=demand) / 商家任务(source=task) / 云端订单(source=order)。
 * 项目 id 统一 `source:原id`，避免三套体系的主键撞车。
 */
const wallet = require('./wallet')

const KEY = 'gy_guarantee_v1'
const PUB_KEY = 'gy_publisher_v1'

const RULES = {
  providerDepositRate: 0.15,   // 接单方 15% —— 需求明确值
  publisherDepositRate: 0.10,  // 发布方 10% —— 默认，待拍板
  overduePenaltyRate: 1.0,     // 逾期没收接单方全部保证金 —— 默认，待拍板
  penaltySplit: { platform: 0.3, publisher: 0.7 }, // 违约金分账 —— 默认，待拍板
  minOpinionLength: 4,         // 驳回修改意见至少 4 个字
  demo: true
}

const STATE_TEXT = {
  none: '未缴纳',
  held: '已冻结',
  refunded: '已原路退回',
  forfeited: '已扣违约金'
}

function emptyState() {
  return { seq: 1, projects: {} }
}

function load() {
  try {
    const s = wx.getStorageSync(KEY)
    if (s && typeof s === 'object' && s.projects && typeof s.projects === 'object') return s
  } catch (e) {
    console.warn('[guarantee] load failed', e && e.message)
  }
  return emptyState()
}

function save(s) {
  try {
    wx.setStorageSync(KEY, s)
  } catch (e) {
    console.warn('[guarantee] save failed', e && e.message)
  }
  return s
}

function now() {
  return new Date().toISOString()
}

function stampText(iso) {
  return String(iso || '').slice(5, 16).replace('T', ' ')
}

function yuan(cents) {
  const n = Number(cents || 0) / 100
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

function dateStr(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function defaultDueAt() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return dateStr(d)
}

/** 截止日按当天 23:59:59 计，避免「当天交付被判逾期」 */
function dueMs(dueAt) {
  if (!dueAt) return 0
  const t = new Date(String(dueAt) + 'T23:59:59').getTime()
  return isNaN(t) ? 0 : t
}

function projectId(source, id) {
  return String(source || 'task') + ':' + String(id)
}

/* -------------------------------------------------- 发布者资质 */

/**
 * 发布者必须是已注册商家。
 * 本机演示态：gy_taskchain_v1 里有店铺资料且处于有效（付费/演示）状态即视为已注册。
 * 云端正式商家由页面层异步用 merchant.getMyMerchant() 兜底，本函数只做同步判定。
 */
function localMerchant() {
  try {
    const s = wx.getStorageSync('gy_taskchain_v1')
    const m = s && s.merchant
    if (m && m.name) {
      const active = !!(m.demoPaid || m.status === 'active') &&
        (!m.paidUntil || new Date(m.paidUntil).getTime() > Date.now())
      if (active) return m
    }
  } catch (e) {}
  // 云端正式商家：merchant-console 拿到云端店铺后登记到本地，避免付费商家被本地门槛挡住
  try {
    const p = wx.getStorageSync(PUB_KEY)
    if (p && p.registered && p.name) return { name: p.name, status: 'active', source: p.source || 'cloud' }
  } catch (e) {}
  return null
}

/** 登记云端正式商家身份（由 merchant-console 在拿到云端店铺时调用） */
function registerPublisher(name, meta) {
  const m = meta || {}
  try {
    wx.setStorageSync(PUB_KEY, {
      name: String(name || '已注册商家').trim(),
      registered: true,
      source: m.source || 'cloud',
      at: now()
    })
  } catch (e) {
    console.warn('[guarantee] registerPublisher failed', e && e.message)
  }
}

function isRegisteredPublisher() {
  const m = localMerchant()
  if (m) return { ok: true, name: m.name, demo: !!m.demoPaid && m.status !== 'cloud-paid' }
  return { ok: false, name: '', demo: false, reason: '发布项目需先注册企业商家并完成入驻' }
}

function assertPublisher() {
  const r = isRegisteredPublisher()
  if (!r.ok) {
    const e = new Error(r.reason || '发布者必须是已注册商家')
    e.code = 'NOT_MERCHANT'
    throw e
  }
  return r
}

/* -------------------------------------------------- 金额规则 */

function providerDepositOf(budget) {
  return Math.max(0, Math.round((Number(budget) || 0) * RULES.providerDepositRate))
}

function publisherDepositOf(budget) {
  return Math.max(0, Math.round((Number(budget) || 0) * RULES.publisherDepositRate))
}

function payChannelLabel() {
  // 演示态默认微信零钱；真实版由后端按支付单返回原渠道
  return '微信零钱（演示）'
}

function rulesText() {
  return {
    providerRateText: Math.round(RULES.providerDepositRate * 100) + '%',
    publisherRateText: Math.round(RULES.publisherDepositRate * 100) + '%',
    splitText: `平台 ${Math.round(RULES.penaltySplit.platform * 100)}% / 发布者 ${Math.round(RULES.penaltySplit.publisher * 100)}%`,
    channelText: payChannelLabel(),
    demo: RULES.demo
  }
}

/* -------------------------------------------------- 档案读写 */

function blankProject(pid, p) {
  const budget = Math.max(0, Math.round(Number(p.budget) || 0))
  return {
    id: pid,
    source: String(p.source || 'task'),
    refId: String(p.refId != null ? p.refId : ''),
    title: String(p.title || '项目').trim(),
    budget,
    publisherName: String(p.publisherName || '发布商家').trim(),
    publisherDeposit: publisherDepositOf(budget),
    publisherDepositState: 'none',
    providerName: String(p.providerName || '').trim(),
    providerDeposit: providerDepositOf(budget),
    providerDepositState: 'none',
    payChannel: p.payChannel || payChannelLabel(),
    dueAt: p.dueAt || defaultDueAt(),
    originalDueAt: p.dueAt || defaultDueAt(),
    deliveredAt: '',
    deliveryVideoPath: '',
    deliveryVideoName: '',
    deliveryNote: '',
    reviewHistory: [],
    penalty: null,
    status: 'open', // open / taken / delivered / completed / breached / cancelled
    timeline: [],
    legacy: !!p.legacy,
    isDemo: true,
    createdAt: now(),
    updatedAt: now()
  }
}

function pushTimeline(p, text) {
  p.timeline = Array.isArray(p.timeline) ? p.timeline : []
  p.timeline.push({ text, at: now() })
}

function mutate(pid, fn) {
  const s = load()
  const p = s.projects[pid]
  if (!p) throw new Error('项目履约档案不存在')
  fn(p, s)
  p.updatedAt = now()
  s.projects[pid] = p
  save(s)
  return decorate(p)
}

/** 懒建档案：老数据/历史单第一次进入时自动补一份（不冻结资金，标 legacy） */
function ensureProject(opts) {
  const p = opts || {}
  const pid = p.projectId || projectId(p.source, p.refId)
  const s = load()
  if (s.projects[pid]) return decorate(s.projects[pid])
  const proj = blankProject(pid, { ...p, legacy: p.legacy !== false })
  pushTimeline(proj, p.legacy === false ? '项目已创建，等待发布者保证金冻结' : '历史项目补建履约档案（演示）')
  s.projects[pid] = proj
  save(s)
  return decorate(proj)
}

/**
 * 发单：校验发布者是注册商家 → 冻结发布方保证金。
 * 幂等：重复调用不会二次冻结。
 */
function createProject(opts) {
  const p = opts || {}
  const pid = p.projectId || projectId(p.source, p.refId)
  // 「发布项目/任务」必须校验商家资质；「下单购买已上架服务」属于消费行为，
  // 由调用方显式传 requireMerchant:false 跳过（订单资金以云端为准，本地只做演示记账）。
  if (p.requireMerchant !== false) assertPublisher()
  const s = load()
  let proj = s.projects[pid]
  if (!proj) {
    proj = blankProject(pid, { ...p, legacy: false })
    s.projects[pid] = proj
  }
  if (proj.publisherDepositState === 'none' && proj.publisherDeposit > 0) {
    wallet.freeze(proj.publisherDeposit, `发布方保证金冻结（${Math.round(RULES.publisherDepositRate * 100)}%）· ${proj.title}`, pid)
    proj.publisherDepositState = 'held'
    pushTimeline(proj, `发布方保证金 ${yuan(proj.publisherDeposit)} 元已冻结，原支付账户：${proj.payChannel}`)
  }
  proj.publisherName = String(p.publisherName || proj.publisherName || '发布商家').trim()
  proj.status = proj.status === 'open' ? 'open' : proj.status
  proj.updatedAt = now()
  save(s)
  return decorate(proj)
}

/** 接单：冻结项目金额 15% 作为履约保证金 */
function holdProviderDeposit(pid, providerName) {
  return mutate(pid, (proj) => {
    if (proj.status === 'breached' || proj.status === 'cancelled') throw new Error('项目已关闭，不能接单')
    if (proj.providerDepositState === 'none') {
      if (proj.providerDeposit > 0) {
        wallet.freeze(proj.providerDeposit, `接单保证金冻结（15%）· ${proj.title}`, pid)
        proj.providerDepositState = 'held'
        pushTimeline(proj, `接单方 ${providerName || '服务者'} 缴纳保证金 ${yuan(proj.providerDeposit)} 元（15%），原支付账户：${proj.payChannel}`)
      } else {
        proj.providerDepositState = 'held'
      }
    }
    proj.providerName = String(providerName || proj.providerName || '服务者').trim()
    if (proj.status === 'open') proj.status = 'taken'
  })
}

/* -------------------------------------------------- 逾期与违约金 */

function isOverdue(proj) {
  if (proj.status !== 'taken' || proj.deliveredAt) return false
  const ms = dueMs(proj.dueAt)
  return ms > 0 && Date.now() > ms
}

/**
 * 逾期未交付：从接单方保证金中扣除违约金，按规则分给平台与发布者。
 * 演示记账：settle 划出冻结款，再用两条 earn 流水表达分账归属（单账户演示）。
 * 真实版必须由后端按支付单执行分账与退款。
 */
function applyPenalty(proj, reason) {
  const amount = proj.providerDepositState === 'held' ? proj.providerDeposit : 0
  const platform = Math.round(amount * RULES.penaltySplit.platform)
  const publisher = amount - platform
  if (amount > 0) {
    wallet.settle(amount, `逾期违约金扣除 · ${proj.title}`, proj.id)
    if (platform > 0) wallet.earn(platform, `平台违约金收入（演示记账）· ${proj.title}`, proj.id)
    if (publisher > 0) wallet.earn(publisher, `发布者违约金补偿（演示记账）· ${proj.title}`, proj.id)
    proj.providerDepositState = 'forfeited'
  }
  // 项目因违约关闭，发布方保证金原路退回
  if (proj.publisherDepositState === 'held') {
    wallet.unfreeze(proj.publisherDeposit, `发布方保证金原路退回至${proj.payChannel} · ${proj.title}`, proj.id)
    proj.publisherDepositState = 'refunded'
  }
  proj.penalty = {
    amount,
    platform,
    publisher,
    reason: reason || '截止日期前未交付作品',
    at: now()
  }
  proj.status = 'breached'
  pushTimeline(proj, `逾期未交付：扣除违约金 ${yuan(amount)} 元（平台 ${yuan(platform)} / 发布者 ${yuan(publisher)}），发布方保证金已原路退回`)
  return proj.penalty
}

/** 进入项目时自动判定：超时且未交付 → 立即扣违约金（幂等） */
function checkOverdue(pid) {
  const s = load()
  const proj = s.projects[pid]
  if (!proj) return null
  if (!isOverdue(proj)) return decorate(proj)
  applyPenalty(proj)
  proj.updatedAt = now()
  save(s)
  return decorate(proj)
}

/* -------------------------------------------------- 交付与审核 */

/** 承接方上传成片（每个单子都有此通道），并记录是否逾期 */
function submitDelivery(pid, payload) {
  const p = payload || {}
  // 先做逾期判定（会落库扣违约金），避免「钱包已扣款但档案没保存」的不一致
  const checked = checkOverdue(pid)
  if (checked && checked.status === 'breached') {
    const e = new Error('已超过交付截止日期，项目按违约处理')
    e.code = 'OVERDUE'
    throw e
  }
  return mutate(pid, (proj) => {
    if (proj.status === 'completed' || proj.status === 'breached' || proj.status === 'cancelled') {
      throw new Error('项目已结束，不能交付作品')
    }
    if (proj.status === 'delivered') throw new Error('已有待审核作品，请先等发布者审核')
    if (isOverdue(proj)) {
      // 扣款已由 checkOverdue 落库，这里只拦截，避免重复动账
      const e = new Error('已超过交付截止日期，项目按违约处理')
      e.code = 'OVERDUE'
      throw e
    }
    proj.deliveryVideoPath = String(p.videoPath || p.videoTempPath || '').trim()
    proj.deliveryVideoName = String(p.videoName || '成片.mp4').trim()
    proj.deliveryNote = String(p.note || '').trim().slice(0, 500)
    proj.deliveredAt = now()
    proj.status = 'delivered'
    pushTimeline(proj, `作品已提交：${proj.deliveryVideoName}${proj.deliveryNote ? ' · ' + proj.deliveryNote : ''}（截止 ${proj.dueAt}）`)
  })
}

/**
 * 发布者审核通过：无需写意见，自动把双方保证金原路退回原支付账户。
 * 幂等：重复验收不会二次解冻。
 */
function approve(pid) {
  return mutate(pid, (proj) => {
    if (proj.status !== 'delivered') throw new Error('当前没有待审核的作品')
    proj.reviewHistory.push({ action: 'approve', opinion: '', newDueAt: '', at: now() })
    if (proj.providerDepositState === 'held') {
      if (proj.providerDeposit > 0) {
        wallet.unfreeze(proj.providerDeposit, `接单保证金原路退回至${proj.payChannel} · ${proj.title}`, proj.id)
      }
      proj.providerDepositState = 'refunded'
    }
    if (proj.publisherDepositState === 'held') {
      if (proj.publisherDeposit > 0) {
        wallet.unfreeze(proj.publisherDeposit, `发布方保证金原路退回至${proj.payChannel} · ${proj.title}`, proj.id)
      }
      proj.publisherDepositState = 'refunded'
    }
    proj.status = 'completed'
    pushTimeline(proj, '发布者审核通过（无需填写意见），双方保证金已自动返还原支付账户')
  })
}

/**
 * 发布者审核不通过：必须填写修改意见 + 新的提交日期。
 * 缺任一项都拒绝，避免「打回但不给方向」。
 */
function reject(pid, payload) {
  const p = payload || {}
  const opinion = String(p.opinion || '').trim()
  const newDueAt = String(p.newDueAt || '').trim()
  if (opinion.length < RULES.minOpinionLength) {
    const e = new Error(`审核不通过必须填写修改意见（至少 ${RULES.minOpinionLength} 个字）`)
    e.code = 'NEED_OPINION'
    throw e
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueAt)) {
    const e = new Error('审核不通过必须指定新的提交日期')
    e.code = 'NEED_DUE'
    throw e
  }
  if (dueMs(newDueAt) < Date.now() - 86400000) {
    const e = new Error('新的提交日期不能早于今天')
    e.code = 'BAD_DUE'
    throw e
  }
  return mutate(pid, (proj) => {
    if (proj.status !== 'delivered') throw new Error('当前没有待审核的作品')
    proj.reviewHistory.push({ action: 'reject', opinion: opinion.slice(0, 500), newDueAt, at: now() })
    proj.dueAt = newDueAt
    proj.deliveredAt = ''
    proj.deliveryVideoPath = ''
    proj.deliveryVideoName = ''
    proj.deliveryNote = ''
    proj.status = 'taken'
    pushTimeline(proj, `审核不通过 · 修改意见：${opinion.slice(0, 100)} · 新提交日期：${newDueAt}`)
  })
}

/** 项目关闭/取消：未违约时双方保证金全额原路退回 */
function cancel(pid, reason) {
  return mutate(pid, (proj) => {
    if (proj.status === 'completed' || proj.status === 'breached') throw new Error('已结束的项目不能取消')
    if (proj.providerDepositState === 'held') {
      if (proj.providerDeposit > 0) wallet.unfreeze(proj.providerDeposit, `接单保证金原路退回至${proj.payChannel} · ${proj.title}`, proj.id)
      proj.providerDepositState = 'refunded'
    }
    if (proj.publisherDepositState === 'held') {
      if (proj.publisherDeposit > 0) wallet.unfreeze(proj.publisherDeposit, `发布方保证金原路退回至${proj.payChannel} · ${proj.title}`, proj.id)
      proj.publisherDepositState = 'refunded'
    }
    proj.status = 'cancelled'
    pushTimeline(proj, '项目已关闭，双方保证金原路退回' + (reason ? ' · ' + reason : ''))
  })
}

/* -------------------------------------------------- 展示模型 */

function decorate(proj) {
  const ms = dueMs(proj.dueAt)
  const leftMs = ms - Date.now()
  const overdue = isOverdue(proj)
  const reviewList = (proj.reviewHistory || []).map((r) => ({
    ...r,
    actionText: r.action === 'approve' ? '审核通过' : '审核不通过',
    timeText: stampText(r.at)
  }))
  const penalty = proj.penalty || null
  return {
    ...proj,
    providerDepositText: yuan(proj.providerDeposit),
    publisherDepositText: yuan(proj.publisherDeposit),
    budgetText: yuan(proj.budget),
    providerStateText: STATE_TEXT[proj.providerDepositState] || proj.providerDepositState,
    publisherStateText: STATE_TEXT[proj.publisherDepositState] || proj.publisherDepositState,
    providerRateText: rulesText().providerRateText,
    publisherRateText: rulesText().publisherRateText,
    splitText: rulesText().splitText,
    channelText: proj.payChannel || payChannelLabel(),
    dueText: proj.dueAt || '待定',
    overdue,
    remainText: overdue ? '已逾期' : leftMs > 0 ? `剩余 ${Math.max(1, Math.ceil(leftMs / 86400000))} 天` : '今日截止',
    statusText: ({
      open: '待接单', taken: '制作中', delivered: '待发布者审核',
      completed: '已完成', breached: '违约已扣款', cancelled: '已关闭'
    })[proj.status] || proj.status,
    reviewList,
    hasReview: reviewList.length > 0,
    penaltyText: penalty ? yuan(penalty.amount) : '',
    penaltyPlatformText: penalty ? yuan(penalty.platform) : '',
    penaltyPublisherText: penalty ? yuan(penalty.publisher) : '',
    hasPenalty: !!penalty,
    hasDelivery: !!proj.deliveryVideoPath,
    canUpload: proj.status === 'taken',
    canReview: proj.status === 'delivered',
    canCancel: proj.status === 'open' || proj.status === 'taken',
    timelineText: (proj.timeline || []).map((t) => ({ ...t, timeText: stampText(t.at) })).reverse(),
    isDemo: true
  }
}

function get(pid) {
  const s = load()
  const p = s.projects[pid]
  return p ? decorate(p) : null
}

function list() {
  const s = load()
  return Object.keys(s.projects).map((k) => decorate(s.projects[k]))
}

function reset() {
  save(emptyState())
}

module.exports = {
  KEY,
  RULES,
  rulesText,
  projectId,
  defaultDueAt,
  dateStr,
  dueMs,
  isRegisteredPublisher,
  assertPublisher,
  registerPublisher,
  providerDepositOf,
  publisherDepositOf,
  payChannelLabel,
  ensureProject,
  createProject,
  holdProviderDeposit,
  submitDelivery,
  approve,
  reject,
  checkOverdue,
  cancel,
  get,
  list,
  decorate,
  reset
}
