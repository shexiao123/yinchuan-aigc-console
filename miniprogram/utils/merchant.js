/**
 * 企业商家 · 店铺 / 任务（小程序端）
 *
 * 小程序连的是独立库，表结构与网页端一致，数据各自维护。
 * 参考视频：wx.chooseMedia 拿到临时路径 → 读成 ArrayBuffer → 云存储 → 签名播放地址。
 */
const { cloud } = require('./cloud')

const MAX_VIDEO_MB = 100
const SITE_BASE = 'https://guangying-web.app.workbuddy.host/'
const ORDER_STATUS = { pending: '待审核', paid: '已收款', rejected: '已驳回', cancelled: '已取消' }

function fmtMoney(cents) {
  const n = Number(cents || 0) / 100
  return '¥' + (n % 1 === 0 ? String(n) : n.toFixed(2))
}

/** 店铺是否处于有效缴费期 */
function paidInfo(shop) {
  const s = shop || {}
  const until = s.paid_until ? new Date(s.paid_until).getTime() : 0
  const paid = s.payment_status === 'paid' && until > Date.now()
  return {
    paid,
    expired: s.payment_status === 'paid' && until > 0 && until <= Date.now(),
    paidUntil: s.paid_until ? String(s.paid_until).slice(0, 10) : '',
    daysLeft: paid ? Math.ceil((until - Date.now()) / 86400000) : 0,
    taskLimit: Number(s.task_limit) || 0,
    planCode: s.plan_code || ''
  }
}

function unwrap(res) {
  if (res && res.error) throw new Error(res.error.message || '数据加载失败')
  return (res && res.data) || []
}

function randomId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

async function currentUid() {
  try {
    const res = await cloud.auth.getSession()
    const s = res && res.data
    return s && s.user ? s.user.id : ''
  } catch (e) {
    return ''
  }
}

/** 媒体路径 → 可播放地址 */
async function resolveMedia(path) {
  const p = String(path || '')
  if (!p) return ''
  if (/^https?:\/\//i.test(p)) return p
  if (p.indexOf('assets/') === 0) return SITE_BASE + p
  try {
    const res = await cloud.storage.createSignedUrl(p, 7200)
    if (res && res.error) return ''
    const d = res && res.data
    return (d && (d.url || d.signedUrl)) || (typeof d === 'string' ? d : '')
  } catch (e) {
    return ''
  }
}

async function listMerchants() {
  const res = await cloud.database
    .from('merchants')
    .select('*')
    .eq('status', 'active')
    .order('id', { ascending: true })
    .limit(100)
  const shops = unwrap(res)
  const tRes = await cloud.database.from('merchant_tasks').select('merchant_id, status').limit(500)
  const counts = {}
  unwrap(tRes).forEach((t) => {
    if (t.status === 'open') counts[t.merchant_id] = (counts[t.merchant_id] || 0) + 1
  })
  return shops.map((m) => ({
    ...m,
    initial: String(m.name || '商').charAt(0),
    openTaskCount: counts[m.id] || 0
  }))
}

async function getMerchant(id) {
  if (!id) return null
  const res = await cloud.database.from('merchants').select('*').eq('id', id).maybeSingle()
  const m = (res && res.data) || null
  if (!m) return null
  return { ...m, initial: String(m.name || '商').charAt(0) }
}

async function listTasks(opts) {
  const o = opts || {}
  let q = cloud.database.from('merchant_tasks').select('*')
  if (o.merchantId) q = q.eq('merchant_id', o.merchantId)
  const res = await q.order('created_at', { ascending: false }).limit(o.limit || 100)
  let rows = unwrap(res)
  if (o.publicOnly) rows = rows.filter((t) => t.status === 'open')
  if (!rows.length) return []
  const mRes = await cloud.database.from('merchants').select('id, name, slug, city, is_verified, status').limit(200)
  const map = {}
  unwrap(mRes).forEach((m) => { map[m.id] = m })
  return rows.map((t) => ({
    ...t,
    merchantName: (map[t.merchant_id] || {}).name || '企业商家',
    budgetText: Number(t.budget) > 0 ? '¥' + (Number(t.budget) / 100) : '面议',
    hasVideo: !!t.reference_video_path
  }))
}

async function getTask(id) {
  if (!id) return null
  const res = await cloud.database.from('merchant_tasks').select('*').eq('id', id).maybeSingle()
  const t = (res && res.data) || null
  if (!t) return null
  const merchant = (await getMerchant(t.merchant_id)) || { name: '企业商家', city: '银川' }
  const videoUrl = t.reference_video_path ? await resolveMedia(t.reference_video_path) : ''
  return {
    ...t,
    merchant,
    videoUrl,
    budgetText: Number(t.budget) > 0 ? '¥' + (Number(t.budget) / 100) : '面议'
  }
}

async function getMyMerchant() {
  const uid = await currentUid()
  if (!uid) return null
  const res = await cloud.database.from('merchants').select('*').eq('owner_id', uid).maybeSingle()
  return (res && res.data) || null
}

async function saveMerchant(payload) {
  const uid = await currentUid()
  if (!uid) throw new Error('请先登录后再开通店铺')
  const p = payload || {}
  const name = String(p.name || '').trim()
  if (name.length < 2) throw new Error('店铺名称至少 2 个字')
  const row = {
    name,
    category_slug: String(p.category_slug || '').trim(),
    city: String(p.city || '').trim().slice(0, 20),
    intro: String(p.intro || '').trim().slice(0, 500),
    contact_name: String(p.contact_name || '').trim().slice(0, 20),
    contact_phone: String(p.contact_phone || '').trim().slice(0, 30),
    updated_at: new Date().toISOString()
  }
  let res
  if (p.id) {
    res = await cloud.database.from('merchants').update(row).eq('id', p.id).eq('owner_id', uid).select()
  } else {
    // 新店铺一律「待缴费」，由平台确认到账后激活；前端改 status 也会被数据库触发器拦下
    res = await cloud.database.from('merchants').insert({
      ...row,
      owner_id: uid,
      slug: 'mp-' + randomId(),
      status: 'pending_payment'
    }).select()
  }
  const rows = unwrap(res)
  if (!rows.length) throw new Error('保存失败，请确认登录状态')
  return rows[0]
}

/** 上传参考视频，返回 { path, name, size } */
async function uploadVideo(tempFilePath, size, name, maxMb) {
  const bytes = Number(size) || 0
  const limit = Math.max(1, Number(maxMb) || MAX_VIDEO_MB)
  if (bytes > limit * 1024 * 1024) throw new Error(`参考视频不能超过 ${limit}MB，可升级入驻套餐`)
  const uid = await currentUid()
  const ext = (String(name || '').match(/\.([a-z0-9]{2,5})$/i) || [])[1] || 'mp4'
  const path = `shared/${uid || 'platform'}/merchant-tasks/${randomId()}.${ext.toLowerCase()}`
  const buffer = await new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: tempFilePath,
      success: (r) => resolve(r.data),
      fail: (e) => reject(new Error(e.errMsg || '视频读取失败'))
    })
  })
  const res = await cloud.storage.upload(path, buffer, {
    contentType: 'video/mp4',
    cacheControl: '3600',
    upsert: false,
    metadata: { purpose: 'merchant_task_reference' }
  })
  if (res && res.error) throw new Error(res.error.message || '视频上传失败')
  return { path, name: name || '参考视频.mp4', size: bytes }
}

async function saveTask(payload) {
  const uid = await currentUid()
  if (!uid) throw new Error('请先登录后再发布任务')
  const shop = await getMyMerchant()
  if (!shop) throw new Error('请先开通店铺')
  const info = paidInfo(shop)
  if (!info.paid) throw new Error('店铺尚未完成入驻缴费，请先完成付款并等待平台确认')
  const p = payload || {}
  const title = String(p.title || '').trim()
  if (title.length < 4) throw new Error('任务标题至少 4 个字')
  if (!p.id && info.taskLimit > 0) {
    const cRes = await cloud.database.from('merchant_tasks').select('id').eq('merchant_id', shop.id).limit(500)
    const count = unwrap(cRes).length
    if (count >= info.taskLimit) throw new Error(`当前套餐每年最多发布 ${info.taskLimit} 个任务，请升级套餐`)
  }

  let videoPath = String(p.reference_video_path || '').trim()
  let videoName = String(p.reference_video_name || '').trim()
  let videoSize = Number(p.reference_video_size) || 0
  if (p.videoTempPath) {
    const up = await uploadVideo(p.videoTempPath, p.videoSize, p.videoName, shop.video_limit_mb)
    videoPath = up.path
    videoName = up.name
    videoSize = up.size
  }

  const row = {
    title,
    description: String(p.description || '').trim().slice(0, 2000),
    category_slug: String(p.category_slug || '').trim(),
    budget: Math.max(0, Math.round(Number(p.budget) || 0)),
    deadline: p.deadline || null,
    reference_video_path: videoPath,
    reference_video_name: videoName,
    reference_video_size: videoSize,
    updated_at: new Date().toISOString()
  }
  let res
  if (p.id) {
    res = await cloud.database.from('merchant_tasks').update(row).eq('id', p.id).eq('owner_id', uid).select()
  } else {
    res = await cloud.database.from('merchant_tasks').insert({
      ...row, merchant_id: shop.id, owner_id: uid, status: 'open'
    }).select()
  }
  const rows = unwrap(res)
  if (!rows.length) throw new Error('发布失败，请确认登录状态')
  return rows[0]
}

async function applyTask(taskId, message) {
  const uid = await currentUid()
  if (!uid) throw new Error('请先登录后再报名')
  const res = await cloud.database.from('merchant_task_applications').insert({
    task_id: taskId,
    applicant_id: uid,
    applicant_name: '小程序用户',
    message: String(message || '').trim().slice(0, 500),
    status: 'pending'
  }).select()
  return unwrap(res)[0]
}

async function listMyApplications() {
  const uid = await currentUid()
  if (!uid) return []
  const res = await cloud.database
    .from('merchant_task_applications')
    .select('*')
    .eq('applicant_id', uid)
    .order('created_at', { ascending: false })
    .limit(100)
  return unwrap(res)
}

/* ---------------- 企业商家 · 付费入驻 ---------------- */

async function listPlans() {
  const res = await cloud.database
    .from('merchant_plans')
    .select('*')
    .eq('status', 'on')
    .order('sort_order', { ascending: true })
    .limit(20)
  return unwrap(res).map((p) => {
    const total = Number(p.price_cents || 0) + Number(p.deposit_cents || 0) + Number(p.onboarding_fee_cents || 0)
    return {
      ...p,
      totalCents: total,
      totalText: fmtMoney(total),
      priceText: fmtMoney(p.price_cents),
      depositText: fmtMoney(p.deposit_cents),
      onboardText: fmtMoney(p.onboarding_fee_cents),
      taskText: Number(p.max_tasks) > 0 ? p.max_tasks + ' 个/年' : '不限',
      benefits: Array.isArray(p.benefits) ? p.benefits : [],
      isHot: p.code === 'pro'
    }
  })
}

async function getPayConfig() {
  const res = await cloud.database
    .from('platform_settings')
    .select('merchant_enroll_enabled,merchant_pay_name,merchant_pay_bank,merchant_pay_account,merchant_pay_note')
    .eq('id', 1)
    .maybeSingle()
  const s = (res && res.data) || {}
  return {
    payName: s.merchant_pay_name || '待平台填写',
    payBank: s.merchant_pay_bank || '待平台填写',
    payAccount: s.merchant_pay_account || '待平台填写',
    payNote: s.merchant_pay_note || '转账备注请填写订单号'
  }
}

function decorateOrder(o) {
  return {
    ...o,
    amountText: fmtMoney(o.amount_cents),
    statusText: ORDER_STATUS[o.status] || o.status,
    dateText: String(o.created_at || '').slice(0, 10)
  }
}

async function listMyOrders() {
  const res = await cloud.database
    .from('merchant_enroll_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  return unwrap(res).map(decorateOrder)
}

/** 生成缴费订单；金额由数据库触发器按套餐表回写，前端无法改价 */
async function createOrder(planId, merchantId) {
  const uid = await currentUid()
  if (!uid) throw new Error('请先登录')
  if (!planId) throw new Error('请选择入驻套餐')
  if (!merchantId) throw new Error('请先填写店铺资料')
  const mine = await listMyOrders()
  const pending = mine.filter((o) => o.status === 'pending' && String(o.merchant_id) === String(merchantId))[0]
  if (pending) return pending
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const orderNo = 'ME' + ymd + Math.random().toString(36).slice(2, 8).toUpperCase()
  const res = await cloud.database.from('merchant_enroll_orders').insert({
    order_no: orderNo,
    owner_id: uid,
    merchant_id: Number(merchantId),
    plan_id: Number(planId),
    plan_code: '',
    plan_name: '',
    amount_cents: 0,
    period_days: 365,
    status: 'pending'
  }).select()
  const rows = unwrap(res)
  if (!rows.length) throw new Error('订单生成失败')
  return decorateOrder(rows[0])
}

async function submitPayment(orderId, txn, remark, proofPath) {
  const res = await cloud.database.from('merchant_enroll_orders').update({
    transaction_id: String(txn || '').trim().slice(0, 80),
    remark: String(remark || '').trim().slice(0, 200),
    payment_proof_path: String(proofPath || '').trim(),
    updated_at: new Date().toISOString()
  }).eq('id', orderId).eq('status', 'pending').select()
  const rows = unwrap(res)
  if (!rows.length) throw new Error('提交失败，订单可能已审核')
  return decorateOrder(rows[0])
}

/** 上传付款凭证截图，返回云存储路径 */
async function uploadProof(tempFilePath) {
  const uid = await currentUid()
  const ext = (String(tempFilePath || '').match(/\.([a-z0-9]{2,5})$/i) || [])[1] || 'jpg'
  const path = `shared/${uid || 'platform'}/merchant-enroll/${randomId()}.${ext.toLowerCase()}`
  const buffer = await new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: tempFilePath,
      success: (r) => resolve(r.data),
      fail: (e) => reject(new Error(e.errMsg || '图片读取失败'))
    })
  })
  const res = await cloud.storage.upload(path, buffer, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
    metadata: { purpose: 'merchant_enroll_proof' }
  })
  if (res && res.error) throw new Error(res.error.message || '凭证上传失败')
  return path
}

module.exports = {
  listMerchants, getMerchant, listTasks, getTask,
  getMyMerchant, saveMerchant, saveTask, uploadVideo,
  applyTask, listMyApplications, currentUid, resolveMedia,
  fmtMoney, paidInfo, listPlans, getPayConfig,
  listMyOrders, createOrder, submitPayment, uploadProof
}
