/**
 * 企业商家 · 店铺 / 任务（小程序端）
 *
 * 小程序连的是独立库，表结构与网页端一致，数据各自维护。
 * 参考视频：wx.chooseMedia 拿到临时路径 → 读成 ArrayBuffer → 云存储 → 签名播放地址。
 */
const { cloud } = require('./cloud')

const MAX_VIDEO_MB = 100
const SITE_BASE = 'https://guangying-web.app.workbuddy.host/'

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
    res = await cloud.database.from('merchants').insert({
      ...row,
      owner_id: uid,
      slug: 'mp-' + randomId(),
      status: 'active'
    }).select()
  }
  const rows = unwrap(res)
  if (!rows.length) throw new Error('保存失败，请确认登录状态')
  return rows[0]
}

/** 上传参考视频，返回 { path, name, size } */
async function uploadVideo(tempFilePath, size, name) {
  const bytes = Number(size) || 0
  if (bytes > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`参考视频不能超过 ${MAX_VIDEO_MB}MB`)
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
  const p = payload || {}
  const title = String(p.title || '').trim()
  if (title.length < 4) throw new Error('任务标题至少 4 个字')

  let videoPath = String(p.reference_video_path || '').trim()
  let videoName = String(p.reference_video_name || '').trim()
  let videoSize = Number(p.reference_video_size) || 0
  if (p.videoTempPath) {
    const up = await uploadVideo(p.videoTempPath, p.videoSize, p.videoName)
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

module.exports = {
  listMerchants, getMerchant, listTasks, getTask,
  getMyMerchant, saveMerchant, saveTask, uploadVideo,
  applyTask, listMyApplications, currentUid, resolveMedia
}
