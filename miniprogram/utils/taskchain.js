/**
 * 统一任务链 · 本地任务池（小程序端）
 *
 * 背景：项目里原来并行跑着三套互不连通的任务体系
 *   ① 云端 orders（下单 → 接单 → 制作 → 交付 → 完成）
 *   ② 本地 gy_demand_v1（演示需求池）
 *   ③ 云端 merchant_tasks（商家任务，报名后无后续流转）
 * 本模块把「商家入驻 → 发布任务/上传视频 → 报名 → 选定 → 交付 → 验收」
 * 做成一条完整、断网也能跑通的闭环，同时供首页/订单/后台统一统计口径。
 *
 * 说明：所有写操作先落本地池，云端由页面层尽力同步（失败不影响本地可用）。
 * 真实支付、后台审核、跨设备同步仍需服务端，本地池明确标注「演示」。
 */
const reqTpl = require('./requirement-templates')
const KEY = 'gy_taskchain_v1'

const STATUS = {
  open: { text: '招募中', tone: 'open' },
  taken: { text: '制作中', tone: 'doing' },
  delivered: { text: '待验收', tone: 'check' },
  completed: { text: '已完成', tone: 'done' },
  cancelled: { text: '已关闭', tone: 'closed' }
}

const FLOW_LABEL = {
  open: '任务已发布',
  taken: '已选定承接方，开始制作',
  delivered: '成片已交付，等待商家验收',
  completed: '商家验收通过，任务完成',
  cancelled: '任务已关闭'
}

const ALLOWED = {
  open: ['taken', 'cancelled'],
  taken: ['delivered', 'cancelled'],
  delivered: ['completed', 'taken', 'cancelled'],
  completed: [],
  cancelled: []
}

function emptyState() {
  return { seq: 1, merchant: null, tasks: [] }
}

function load() {
  try {
    const s = wx.getStorageSync(KEY)
    if (s && typeof s === 'object' && Array.isArray(s.tasks)) {
      return { seq: Number(s.seq) || 1, merchant: s.merchant || null, tasks: s.tasks }
    }
  } catch (e) {
    console.warn('[taskchain] load failed', e)
  }
  return emptyState()
}

function save(state) {
  try {
    wx.setStorageSync(KEY, state)
  } catch (e) {
    console.warn('[taskchain] save failed', e)
  }
  return state
}

function nextId(state, prefix) {
  const n = state.seq++
  return prefix + '-' + Date.now().toString(36) + '-' + n
}

function now() {
  return new Date().toISOString()
}

function fmtMoney(cents) {
  const n = Number(cents || 0) / 100
  return n > 0 ? '¥' + (n % 1 === 0 ? String(n) : n.toFixed(2)) : '面议'
}

function currentUser() {
  try {
    const app = getApp()
    const s = app && app.globalData && app.globalData.session
    const u = s && s.user
    if (u) return { id: u.id || 'me', name: u.nickname || u.nickName || u.name || '小程序用户' }
  } catch (e) {}
  return { id: 'local-user', name: '本机演示用户' }
}

/** 演示开通：不产生真实付款，也不改变云端审核状态 */
function activateDemo(planCode) {
  const state = load()
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  state.merchant = state.merchant || {}
  state.merchant.demoPaid = true
  state.merchant.planCode = planCode || 'demo'
  state.merchant.paidAt = now()
  state.merchant.paidUntil = d.toISOString()
  state.merchant.status = 'active'
  return save(state).merchant
}

function isDemoActive() {
  const m = load().merchant
  if (!m || !m.demoPaid) return false
  return !m.paidUntil || new Date(m.paidUntil).getTime() > Date.now()
}

function saveMerchant(payload) {
  const state = load()
  const p = payload || {}
  const name = String(p.name || '').trim()
  if (name.length < 2) throw new Error('店铺名称至少 2 个字')
  const prev = state.merchant || {}
  state.merchant = {
    ...prev,
    id: prev.id || nextId(state, 'shop'),
    name,
    city: String(p.city || '银川').trim(),
    intro: String(p.intro || '').trim().slice(0, 500),
    contact_name: String(p.contact_name || p.contact || '').trim(),
    contact_phone: String(p.contact_phone || p.phone || '').trim(),
    category_slug: String(p.category_slug || '').trim(),
    planCode: p.planCode || prev.planCode || '',
    updatedAt: now()
  }
  save(state)
  return state.merchant
}

function getMerchant() {
  return load().merchant
}

function paidInfo() {
  const m = load().merchant
  const active = isDemoActive()
  const until = m && m.paidUntil ? new Date(m.paidUntil).getTime() : 0
  return {
    active,
    demo: !!(m && m.demoPaid),
    paidUntil: m && m.paidUntil ? String(m.paidUntil).slice(0, 10) : '',
    daysLeft: active && until ? Math.ceil((until - Date.now()) / 86400000) : 0,
    planCode: (m && m.planCode) || '',
    videoLimitMb: 100,
    taskLimit: 0
  }
}

/**
 * 把临时视频落成本地永久文件，返回可播放路径。
 * 保存失败时退回临时路径（本次会话内仍可播放）。
 */
function persistVideo(tempFilePath, tag) {
  if (!tempFilePath) return ''
  const ext = (String(tempFilePath).match(/\.([a-z0-9]{2,5})$/i) || [])[1] || 'mp4'
  const target = `${wx.env.USER_DATA_PATH}/tc_${tag || 'v'}_${Date.now()}.${ext.toLowerCase()}`
  try {
    const saved = wx.getFileSystemManager().saveFileSync(tempFilePath, target)
    return saved || target
  } catch (e) {
    console.warn('[taskchain] persist video fallback to temp', e)
    return tempFilePath
  }
}

function decorate(t) {
  const st = STATUS[t.status] || STATUS.open
  const rows = reqTpl.buildRows(t)
  const brief = reqTpl.briefRows(t, 2)
  return {
    ...t,
    isLocal: true,
    statusText: st.text,
    tone: st.tone,
    budgetText: fmtMoney(t.budget),
    hasVideo: !!t.referenceVideoPath,
    videoUrl: t.referenceVideoPath || t.referenceVideoUrl || '',
    deliveryUrl: t.deliveryVideoPath || '',
    merchantName: t.merchantName || '我的店铺',
    dateText: String(t.createdAt || '').slice(0, 10),
    applicantCount: (t.applications || []).length,
    reqRows: rows,
    reqBriefRows: brief.rows,
    reqMoreCount: Math.max(0, rows.length - brief.rows.length),
    hasReqRows: rows.length > 0
  }
}

function pushTimeline(t, key, note) {
  t.timeline = Array.isArray(t.timeline) ? t.timeline : []
  t.timeline.push({
    key,
    text: note ? `${FLOW_LABEL[key] || key} · ${note}` : (FLOW_LABEL[key] || key),
    at: now()
  })
}

/** 发布任务（含参考视频） */
function publishTask(payload) {
  const state = load()
  const p = payload || {}
  const title = String(p.title || '').trim()
  if (title.length < 4) throw new Error('任务标题至少 4 个字')
  const m = state.merchant || {}
  const t = {
    id: nextId(state, 'task'),
    title,
    // 规范文本写回原 description 字段，保证云端商家任务/老页面仍可读
    description: String(p.description || p.reqText || '').trim().slice(0, 2000),
    category_slug: String(p.category_slug || p.reqCategorySlug || '').trim(),
    reqCatId: Number(p.reqCatId) || 0,
    reqCatName: String(p.reqCatName || '').trim(),
    reqFields: p.reqFields || null,
    budget: Math.max(0, Math.round(Number(p.budget) || 0)),
    deadline: p.deadline || '',
    referenceVideoPath: p.videoTempPath ? persistVideo(p.videoTempPath, 'ref') : '',
    referenceVideoUrl: String(p.reference_video_path || p.videoUrl || '').trim(),
    referenceVideoName: String(p.videoName || '').trim(),
    referenceVideoSize: Number(p.videoSize) || 0,
    deliveryVideoPath: '',
    deliveryVideoName: '',
    deliveryNote: '',
    status: 'open',
    applications: [],
    selectedApplicant: '',
    merchantName: m.name || '我的店铺',
    ownerId: m.id || 'local-shop',
    createdAt: now(),
    updatedAt: now(),
    timeline: []
  }
  pushTimeline(t, 'open')
  state.tasks.unshift(t)
  save(state)
  return decorate(t)
}

function listTasks(opts) {
  const o = opts || {}
  let rows = load().tasks.slice()
  if (o.publicOnly) rows = rows.filter((t) => t.status === 'open')
  if (o.status) rows = rows.filter((t) => t.status === o.status)
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return rows.map(decorate)
}

function getTask(id) {
  if (!id) return null
  const t = load().tasks.filter((x) => String(x.id) === String(id))[0]
  return t ? decorate(t) : null
}

function isLocalId(id) {
  return /^(task|local)-/.test(String(id || ''))
}

function mutate(id, fn) {
  const state = load()
  const t = state.tasks.filter((x) => String(x.id) === String(id))[0]
  if (!t) throw new Error('任务不存在')
  fn(t, state)
  t.updatedAt = now()
  save(state)
  return decorate(t)
}

/** 服务者报名 */
function applyTask(id, message) {
  const u = currentUser()
  return mutate(id, (t) => {
    if (t.status !== 'open') throw new Error('该任务已停止招募')
    t.applications = t.applications || []
    if (t.applications.some((a) => String(a.applicantId) === String(u.id))) {
      throw new Error('你已经报名过这个任务了')
    }
    t.applications.push({
      id: 'app-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      applicantId: u.id,
      applicantName: u.name,
      message: String(message || '').trim().slice(0, 500),
      status: 'pending',
      at: now()
    })
  })
}

function myApplication(id) {
  const t = getTask(id)
  if (!t) return null
  const uid = currentUser().id
  return (t.applications || []).filter((a) => String(a.applicantId) === String(uid))[0] || null
}

/** 商家选定承接方 → 制作中 */
function selectApplicant(id, appId) {
  return mutate(id, (t) => {
    if (t.status !== 'open') throw new Error('当前状态不能选定承接方')
    const a = (t.applications || []).filter((x) => String(x.id) === String(appId))[0]
    if (!a) throw new Error('报名记录不存在')
    ;(t.applications || []).forEach((x) => { x.status = String(x.id) === String(appId) ? 'selected' : 'rejected' })
    t.selectedApplicant = a.applicantName
    t.selectedApplicantId = a.applicantId
    t.status = 'taken'
    pushTimeline(t, 'taken', '承接方：' + a.applicantName)
  })
}

/** 承接方交付成片（上传视频或填链接） */
function deliverTask(id, payload) {
  const p = payload || {}
  return mutate(id, (t) => {
    if (!ALLOWED[t.status] || ALLOWED[t.status].indexOf('delivered') < 0) {
      throw new Error('当前状态不能交付成片')
    }
    t.deliveryVideoPath = p.videoTempPath ? persistVideo(p.videoTempPath, 'delivery') : (p.videoUrl || '')
    t.deliveryVideoName = String(p.videoName || '成片.mp4').trim()
    t.deliveryNote = String(p.note || '').trim().slice(0, 500)
    t.status = 'delivered'
    pushTimeline(t, 'delivered', t.deliveryNote)
  })
}

/** 商家验收通过 / 打回重做 */
function acceptTask(id, note) {
  return mutate(id, (t) => {
    if (t.status !== 'delivered') throw new Error('请等待承接方交付成片')
    t.status = 'completed'
    pushTimeline(t, 'completed', note)
  })
}

function rejectDelivery(id, note) {
  return mutate(id, (t) => {
    if (t.status !== 'delivered') throw new Error('当前没有待验收的成片')
    t.status = 'taken'
    pushTimeline(t, 'taken', '成片打回重做：' + String(note || '需要修改').trim().slice(0, 200))
  })
}

function cancelTask(id, note) {
  return mutate(id, (t) => {
    if (!ALLOWED[t.status] || ALLOWED[t.status].indexOf('cancelled') < 0) {
      throw new Error('当前状态不能关闭任务')
    }
    t.status = 'cancelled'
    pushTimeline(t, 'cancelled', note)
  })
}

/** 6 宫格统一统计：任何来源的任务列表都能算，口径与订单页一致 */
function statsFrom(list) {
  const rows = list || []
  const count = (fn) => rows.filter(fn).length
  return {
    pending: count((x) => x.status === 'open'),
    doing: count((x) => x.status === 'taken' || x.status === 'producing'),
    check: count((x) => x.status === 'delivered'),
    refund: count((x) => x.status === 'refund'),
    done: count((x) => x.status === 'completed'),
    closed: count((x) => x.status === 'cancelled')
  }
}

/** 把云端订单 + 本地演示需求 + 商家任务合成一条统计数据源 */
function mergeStats(cloudOrders, localDemands, merchantTasks) {
  const all = []
    .concat(cloudOrders || [])
    .concat(localDemands || [])
    .concat(merchantTasks || [])
    .map((x) => ({ status: x.status }))
  return statsFrom(all)
}

function reset() {
  save(emptyState())
}

module.exports = {
  KEY,
  STATUS,
  FLOW_LABEL,
  load,
  save,
  activateDemo,
  isDemoActive,
  paidInfo,
  saveMerchant,
  getMerchant,
  persistVideo,
  publishTask,
  listTasks,
  getTask,
  isLocalId,
  applyTask,
  myApplication,
  selectApplicant,
  deliverTask,
  acceptTask,
  rejectDelivery,
  cancelTask,
  statsFrom,
  mergeStats,
  fmtMoney,
  reset
}
