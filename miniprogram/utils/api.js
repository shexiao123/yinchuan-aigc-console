const { cloud } = require('./cloud')
const { unwrap, makeOrderNo, friendlyError } = require('./util')
const samples = require('./samples')
const commission = require('./commission')

/* ---------------------------------------------------------------- 会话 */

/** 读取当前会话，没有登录返回 null */
async function getSession() {
  const res = await cloud.auth.getSession()
  if (res.error) return null
  return res.data || null
}

/** 微信授权登录 */
async function loginWithWechat() {
  const codeRes = await new Promise((resolve, reject) => {
    wx.login({
      success: (r) => (r.code ? resolve(r) : reject(new Error('微信登录失败，未获取到凭证'))),
      fail: (e) => reject(new Error(e.errMsg || '微信登录失败，请重试'))
    })
  })
  const appid = wx.getAccountInfoSync().miniProgram.appId
  const res = await cloud.auth.signInWithWechat(codeRes.code, appid)
  if (res.error) throw new Error(res.error.message || '微信登录失败')
  return res.data
}

async function signOut() {
  await cloud.auth.signOut()
}

/* ---------------------------------------------------------------- 目录 */

async function listCategories() {
  const res = await cloud.database
    .from('categories')
    .select('id, name, slug, icon, description, image_url, sort_order')
    .order('sort_order', { ascending: true })
  const list = unwrap(res, '分类加载失败') || []
  return attachCategoryImages(list)
}

/**
 * 解析分类配图。
 * image_url 可能是完整 http 地址（站点静态资源），也可能是云存储路径（需签名）。
 */
async function attachCategoryImages(categories) {
  const list = categories || []
  if (!list.length) return []
  const samples = require('./samples')
  return Promise.all(
    list.map(async (c) => {
      if (!c.image_url) return { ...c, imageUrl: '' }
      if (String(c.image_url).startsWith('http')) return { ...c, imageUrl: c.image_url }
      try {
        return { ...c, imageUrl: await samples.signedUrl(c.image_url, 7200) }
      } catch (e) {
        return { ...c, imageUrl: '' }
      }
    })
  )
}

async function listBanners() {
  const res = await cloud.database
    .from('banners')
    .select('id, title, subtitle, image_url, theme, link_type, link_value, sort_order')
    .order('sort_order', { ascending: true })
  const list = unwrap(res, '轮播加载失败') || []
  return attachBannerImages(list)
}

/**
 * 解析轮播背景图。
 * image_url 可能是完整 http 地址（站点静态资源），也可能是云存储路径（需签名）。
 */
async function attachBannerImages(banners) {
  const list = banners || []
  if (!list.length) return []
  const samples = require('./samples')
  return Promise.all(
    list.map(async (b) => {
      if (!b.image_url) return { ...b, imageUrl: '' }
      if (String(b.image_url).startsWith('http')) return { ...b, imageUrl: b.image_url }
      try {
        return { ...b, imageUrl: await samples.signedUrl(b.image_url, 7200) }
      } catch (e) {
        return { ...b, imageUrl: '' }
      }
    })
  )
}

async function getSettings() {
  const res = await cloud.database.from('platform_settings').select('*').eq('id', 1).maybeSingle()
  const row = unwrap(res, '平台配置加载失败')
  return row || { commission_rate: 0.10, min_order_amount: 100, support_phone: '', notice: '' }
}

/* ---------------------------------------------------------------- 服务 */

/**
 * 服务列表。categorySlug 为空表示全部。
 * 只查上架状态的服务，下架的仅本人可见。
 */
async function listServices(params = {}) {
  const { categorySlug, keyword, providerId, limit = 50, offset = 0 } = params
  let query = cloud.database.from('services').select('*').eq('status', 'on')
  if (categorySlug) {
    const cats = await listCategories()
    const hit = cats.find((c) => c.slug === categorySlug)
    if (!hit) return []
    query = query.eq('category_id', hit.id)
  }
  if (providerId) query = query.eq('provider_id', providerId)
  if (keyword) query = query.ilike('title', `%${keyword}%`)
  const res = await query.order('sales_count', { ascending: false }).range(offset, offset + limit - 1)
  const list = unwrap(res, '服务加载失败') || []
  return attachCoverUrls(list)
}

/**
 * 解析服务封面。
 * cover_url 存的是云存储路径，显示时需转成可访问的签名地址。
 * 没封面的返回空串，页面会回退到渐变占位。
 */
async function attachCoverUrls(services) {
  const list = services || []
  if (!list.length) return []
  const samples = require('./samples')
  return Promise.all(
    list.map(async (s) => {
      if (!s.cover_url) return { ...s, coverUrl: '' }
      if (String(s.cover_url).startsWith('http')) return { ...s, coverUrl: s.cover_url }
      try {
        const url = await samples.signedUrl(s.cover_url, 7200)
        return { ...s, coverUrl: url }
      } catch (e) {
        return { ...s, coverUrl: '' }
      }
    })
  )
}

async function getService(id) {
  const res = await cloud.database.from('services').select('*').eq('id', id).maybeSingle()
  const svc = unwrap(res, '服务详情加载失败')
  if (!svc) return svc
  const [withCover] = await attachCoverUrls([svc])
  return withCover
}

async function getProvider(id) {
  const res = await cloud.database.from('providers').select('*').eq('id', id).maybeSingle()
  return unwrap(res, '服务者信息加载失败')
}

/**
 * 查服务者当前适用的佣金率（用于展示）。
 * 与 createOrder 里的服务端重算同一套规则。
 */
async function getProviderCommission(providerId, baseRate) {
  const settings = baseRate ? { commission_rate: baseRate } : await getSettings()
  const resolved = await commission.resolveCommissionRate(
    cloud.database,
    providerId || null,
    null,
    Number(settings.commission_rate || commission.BASE_COMMISSION)
  )
  return resolved
}

async function listProviders() {
  const res = await cloud.database
    .from('providers')
    .select('*')
    .order('orders_done', { ascending: false })
  return unwrap(res, '服务者加载失败') || []
}

/* ---------------------------------------------------------------- 服务者身份 */

/**
 * 取得当前登录用户的 provider 记录。
 * 认领：种子服务者以 unbound_ 前缀写入，登录后可认领为自己所有。
 */
async function getMyProvider(uid) {
  if (!uid) return null
  const mine = await cloud.database.from('providers').select('*').eq('owner_id', uid).maybeSingle()
  const own = unwrap(mine, '身份查询失败')
  if (own) return own
  return null
}

/** 开通服务者身份：提交申请，等待平台审核 */
async function applyProvider(profile, uid, ownerName) {
  const res = await cloud.database
    .from('provider_applications')
    .insert({
      applicant_uid: uid,
      applicant_name: ownerName || null,
      nickname: profile.nickname,
      bio: profile.bio || '',
      city: profile.city || '银川',
      tags: profile.tags || [],
      status: 'pending'
    })
    .select()
  const rows = unwrap(res, '提交申请失败')
  return rows && rows[0]
}

/** 查询我的服务者申请状态 */
async function getMyApplication(uid) {
  if (!uid) return null
  const res = await cloud.database
    .from('provider_applications')
    .select('*')
    .eq('applicant_uid', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return unwrap(res, '申请状态查询失败')
}

/** 认领一个未绑定的服务者身份（用于演示数据转为己有） */
async function claimProvider(providerId, uid) {
  const res = await cloud.database
    .from('providers')
    .update({ owner_id: uid })
    .eq('id', providerId)
    .eq('owner_id', 'unbound_chenmo')
    .select()
  const rows = unwrap(res, '认领失败')
  if (!rows || rows.length === 0) {
    throw new Error('认领失败，该身份可能已被其他人认领')
  }
  return rows[0]
}

/** 开通服务者身份 */
async function becomeProvider(profile, uid, ownerName) {
  const res = await cloud.database
    .from('providers')
    .insert({
      owner_name: ownerName || null,
      nickname: profile.nickname,
      bio: profile.bio || '',
      city: profile.city || '银川',
      tags: profile.tags || [],
      rating: 5.0,
      orders_done: 0,
      works_count: 0,
      is_verified: false
    })
    .select()
  const rows = unwrap(res, '开通失败')
  return rows && rows[0]
}

/* ---------------------------------------------------------------- 服务上架 */

async function publishService(payload) {
  const res = await cloud.database.from('services').insert(payload).select()
  const rows = unwrap(res, '上架失败')
  return rows && rows[0]
}

async function updateService(id, payload) {
  const res = await cloud.database.from('services').update(payload).eq('id', id).select()
  const rows = unwrap(res, '更新失败')
  if (!rows || rows.length === 0) throw new Error('更新失败，该服务不存在或不属于你')
  return rows[0]
}

async function toggleServiceStatus(id, status) {
  return updateService(id, { status })
}

async function listMyServices(providerId) {
  if (!providerId) return []
  const res = await cloud.database
    .from('services')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
  return unwrap(res, '我的服务加载失败') || []
}

/* ---------------------------------------------------------------- 订单 */

/**
 * 下单。mode 为 'open' 时不指定服务者，进入公开需求池由服务者抢单。
 *
 * 平台服务费在服务端按「服务者的会员档位」重算，不采信前端传来的值。
 */
async function createOrder(payload) {
  const orderNo = makeOrderNo()

  // 1. 取平台基准佣金率
  let baseRate = commission.BASE_COMMISSION
  try {
    const settings = await getSettings()
    baseRate = Number(settings.commission_rate || commission.BASE_COMMISSION)
  } catch (e) {
    baseRate = commission.BASE_COMMISSION
  }

  // 2. 按服务者的会员档位解析实际佣金率
  const resolved = await commission.resolveCommissionRate(
    cloud.database,
    payload.providerId || null,
    payload.providerOwnerId || null,
    baseRate
  )

  // 3. 服务端重算服务费
  const platformFee = commission.calcPlatformFee(payload.amount, resolved.rate)

  const body = {
    order_no: orderNo,
    service_id: payload.serviceId,
    provider_id: payload.providerId || null,
    title: payload.title,
    requirement: payload.requirement || '',
    shoot_date: payload.shootDate || null,
    budget: payload.budget || null,
    amount: payload.amount,
    platform_fee: platformFee,
    commission_rate: resolved.rate,
    member_tier: resolved.tier,
    status: 'open',
    customer_name: payload.customerName || null,
    customer_avatar: payload.customerAvatar || null,
    timeline: [
      {
        key: 'open',
        text: payload.providerId ? '订单已发布' : '订单已发布 · 公开需求，等待服务者接单',
        at: new Date().toISOString()
      }
    ]
  }
  const res = await cloud.database.from('orders').insert(body).select()
  const rows = unwrap(res, '下单失败')
  return rows && rows[0]
}

/** 当前用户的订单。role: customer 看我买的，provider 看我接的，all 全部相关 */
async function listOrders(params = {}) {
  const { role = 'customer', providerIds = [], uid, status, limit = 50, offset = 0 } = params
  if (!uid) return []
  let query = cloud.database.from('orders').select('*')
  if (role === 'provider') {
    if (!providerIds.length) return []
    query = query.in('provider_id', providerIds)
  } else if (role === 'customer') {
    query = query.eq('customer_id', uid)
  } else {
    const ors = [`customer_id.eq.${uid}`]
    if (providerIds.length) providerIds.forEach((id) => ors.push(`provider_id.eq.${id}`))
    query = query.or(ors.join(','))
  }
  if (status) query = query.eq('status', status)
  const res = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  const orders = unwrap(res, '订单加载失败') || []
  return attachOrderCovers(orders)
}

/**
 * 给订单批量补上服务封面。
 * 一次查所有 service_id（不逐条查，避免 N+1），再挂到订单的 coverUrl 上。
 */
async function attachOrderCovers(orders) {
  const list = orders || []
  if (!list.length) return []
  const ids = [...new Set(list.map((o) => o.service_id).filter(Boolean))]
  if (!ids.length) return list.map((o) => ({ ...o, coverUrl: '' }))

  let covers = {}
  try {
    const res = await cloud.database.from('services').select('id, cover_url').in('id', ids)
    const rows = unwrap(res, null) || []
    rows.forEach((s) => { covers[s.id] = s.cover_url })
  } catch (e) {
    return list.map((o) => ({ ...o, coverUrl: '' }))
  }

  // 需要签名的路径批量转
  const samples = require('./samples')
  const needSign = [...new Set(Object.values(covers).filter((u) => u && !String(u).startsWith('http')))]
  const signed = {}
  if (needSign.length) {
    await Promise.all(
      needSign.map(async (p) => {
        try {
          signed[p] = await samples.signedUrl(p, 7200)
        } catch (e) {
          signed[p] = ''
        }
      })
    )
  }

  return list.map((o) => {
    const raw = covers[o.service_id]
    if (!raw) return { ...o, coverUrl: '' }
    const url = String(raw).startsWith('http') ? raw : (signed[raw] || '')
    return { ...o, coverUrl: url }
  })
}

/** 公开需求池：还没人接的单 */
async function listOpenOrders(categoryId, limit = 30) {
  let query = cloud.database.from('orders').select('*').eq('status', 'open').is('provider_id', null)
  if (categoryId) query = query.eq('category_id', categoryId)
  const res = await query.order('created_at', { ascending: false }).limit(limit)
  return unwrap(res, '需求池加载失败') || []
}

async function getOrder(id) {
  const res = await cloud.database.from('orders').select('*').eq('id', id).maybeSingle()
  return unwrap(res, '订单加载失败')
}

/**
 * 推进订单状态。写入 timeline 供客户查看进度。
 */
/* ---------------------------------------------------------------- 消息通知 */

/**
 * 发一条站内通知。失败不影响主流程（例如订单状态已改但通知发不出去）。
 */
async function notify(receiverId, payload) {
  if (!receiverId) return null
  try {
    const res = await cloud.database
      .from('notifications')
      .insert({
        receiver_id: receiverId,
        receiver_role: payload.role || 'customer',
        title: payload.title,
        body: payload.body || null,
        type: payload.type || 'system',
        link_type: payload.linkType || null,
        link_id: payload.linkId ? String(payload.linkId) : null,
        order_id: payload.orderId || null,
        is_read: false
      })
      .select()
    const rows = unwrap(res, '')
    return rows && rows[0]
  } catch (e) {
    console.error('[notify] 发送失败', e && e.message)
    return null
  }
}

/** 我的通知列表 */
async function listNotifications(limit = 50) {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const uid = session && session.user ? session.user.id : ''
  if (!uid) return []
  const res = await cloud.database
    .from('notifications')
    .select('*')
    .eq('receiver_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit)
  return unwrap(res, '消息加载失败') || []
}

/** 未读数量 */
async function countUnread() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const uid = session && session.user ? session.user.id : ''
  if (!uid) return 0
  const res = await cloud.database
    .from('notifications')
    .select('id')
    .eq('receiver_id', uid)
    .eq('is_read', false)
  const rows = unwrap(res, '') || []
  return rows.length
}

/** 标记已读 */
async function markNotificationRead(id) {
  const res = await cloud.database
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .select()
  return unwrap(res, '标记已读失败')
}

/** 全部标记已读 */
async function markAllNotificationsRead() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const uid = session && session.user ? session.user.id : ''
  if (!uid) return 0
  const res = await cloud.database
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('receiver_id', uid)
    .eq('is_read', false)
    .select()
  const rows = unwrap(res, '') || []
  return rows.length
}

async function advanceOrder(id, nextStatus, note, actorUid) {
  const current = await getOrder(id)
  if (!current) throw new Error('订单不存在')
  const timeline = Array.isArray(current.timeline) ? current.timeline.slice() : []
  const label = {
    taken: '服务者已接单',
    producing: '开始制作',
    delivered: '成片已交付',
    completed: '订单完成',
    cancelled: '订单取消'
  }[nextStatus] || nextStatus
  timeline.push({
    key: nextStatus,
    text: note ? `${label} · ${note}` : label,
    at: new Date().toISOString(),
    by: actorUid || ''
  })
  const res = await cloud.database
    .from('orders')
    .update({ status: nextStatus, timeline })
    .eq('id', id)
    .select()
  const rows = unwrap(res, '状态更新失败')
  if (!rows || !rows.length) throw new Error('状态更新失败，该订单可能不属于你')
  const order = rows[0]

  // 状态推进后给另一方发通知
  await notifyAfterAdvance(order, nextStatus)
  return order
}

/** 根据订单状态推进，给相关方发站内通知 */
async function notifyAfterAdvance(order, nextStatus) {
  const title = order.title || '订单'
  const orderNo = order.order_no || ''
  if (nextStatus === 'taken') {
    // 客户侧：服务者接单了
    await notify(order.customer_id, {
      role: 'customer',
      title: '服务者已接单',
      body: `「${title}」已有服务者接单，订单号 ${orderNo}`,
      type: 'order',
      linkType: 'order',
      linkId: order.id,
      orderId: order.id
    })
  } else if (nextStatus === 'producing') {
    await notify(order.customer_id, {
      role: 'customer',
      title: '订单已开始制作',
      body: `「${title}」已进入制作阶段，订单号 ${orderNo}`,
      type: 'order',
      linkType: 'order',
      linkId: order.id,
      orderId: order.id
    })
  } else if (nextStatus === 'delivered') {
    // 客户侧：成片交付，请确认
    await notify(order.customer_id, {
      role: 'customer',
      title: '成片已交付，待你确认',
      body: `「${title}」成片已交付，确认完成后可以写评价。订单号 ${orderNo}`,
      type: 'order',
      linkType: 'order',
      linkId: order.id,
      orderId: order.id
    })
  } else if (nextStatus === 'completed') {
    // 服务者侧：客户确认完成
    if (order.provider_owner_id) {
      await notify(order.provider_owner_id, {
        role: 'provider',
        title: '客户已确认订单完成',
        body: `「${title}」客户已确认完成，款项可结算。订单号 ${orderNo}`,
        type: 'order',
        linkType: 'order',
        linkId: order.id,
        orderId: order.id
      })
    }
  } else if (nextStatus === 'cancelled') {
    if (order.provider_owner_id) {
      await notify(order.provider_owner_id, {
        role: 'provider',
        title: '订单已取消',
        body: `「${title}」被取消，订单号 ${orderNo}`,
        type: 'order',
        linkType: 'order',
        linkId: order.id,
        orderId: order.id
      })
    }
  }
}

/** 服务者接单 */
async function takeOrder(id, providerId, providerOwnerId) {
  // 会员门槛：只有有效会员才能接单
  const member = require('./member')
  const sub = await member.getMySubscription(providerOwnerId)
  if (!sub) {
    const err = new Error('开通会员后才能接单')
    err.code = 'NEED_MEMBER'
    throw err
  }

  // 公开需求池的订单在下单时还不知服务者是谁，佣金按平台基准算的。
  // 接单人确定后，按其会员档位重算佣金。
  let feePatch = {}
  try {
    const cur = await getOrder(id)
    if (cur) {
      const settings = await getSettings()
      const resolved = await commission.resolveCommissionRate(
        cloud.database,
        providerId,
        providerOwnerId,
        Number(settings.commission_rate || commission.BASE_COMMISSION)
      )
      const fee = commission.calcPlatformFee(cur.amount, resolved.rate)
      feePatch = {
        platform_fee: fee,
        commission_rate: resolved.rate,
        member_tier: resolved.tier
      }
    }
  } catch (e) {
    // 重算失败不阻断接单，沿用下单时的佣金
    console.error('[takeOrder] recalc commission failed', JSON.stringify({ message: e.message }))
  }

  const res = await cloud.database
    .from('orders')
    .update({ provider_id: providerId, provider_owner_id: providerOwnerId, ...feePatch })
    .eq('id', id)
    .is('provider_id', null)
    .select()
  const rows = unwrap(res, '接单失败')
  if (!rows || rows.length === 0) throw new Error('接单失败，该需求已被其他服务者接走')
  const order = rows[0]

  // 通知客户有人接单了
  await notify(order.customer_id, {
    role: 'customer',
    title: '服务者已接单',
    body: `「${order.title || '订单'}」已有服务者接单，订单号 ${order.order_no || ''}`,
    type: 'order',
    linkType: 'order',
    linkId: order.id,
    orderId: order.id
  })
  return order
}

/**
 * 导出本端全部订单（管理员用），用于同步到管理端。
 * 只导出管理端需要的字段，不含联系方式等敏感信息。
 */
async function exportAllOrders() {
  const res = await cloud.database
    .from('orders')
    .select('id, order_no, service_id, provider_id, title, requirement, shoot_date, amount, platform_fee, status, created_at, customer_name')
    .order('created_at', { ascending: false })
    .limit(500)
  const rows = unwrap(res, '导出失败') || []
  return {
    exported_at: new Date().toISOString(),
    source: 'miniprogram',
    count: rows.length,
    orders: rows
  }
}

/* ---------------------------------------------------------------- 宣传样片 */

/** 某服务的样片列表 */
async function listSamples(serviceId) {
  const res = await cloud.database
    .from('service_samples')
    .select('*')
    .eq('service_id', serviceId)
    .order('sort_order', { ascending: true })
  return unwrap(res, '样片加载失败') || []
}

/** 某服务者的全部样片（管理用） */
async function listProviderSamples(providerId) {
  if (!providerId) return []
  const res = await cloud.database
    .from('service_samples')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
  return unwrap(res, '样片加载失败') || []
}

async function createSample(payload) {
  const res = await cloud.database.from('service_samples').insert(payload).select()
  const rows = unwrap(res, '样片保存失败')
  return rows && rows[0]
}

async function deleteSample(id) {
  const res = await cloud.database.from('service_samples').delete().eq('id', id).select()
  const rows = unwrap(res, '删除失败')
  if (!rows || rows.length === 0) throw new Error('删除失败，该样片不存在或不属于你')
  const path = rows[0].file_path
  if (path) {
    try {
      await cloud.storage.remove([path])
    } catch (e) {
      console.error('[samples] remove file failed', JSON.stringify({ message: e.message }))
    }
  }
  return rows[0]
}

/* ---------------------------------------------------------------- 评价 */

async function listReviews(serviceId, limit = 20) {
  let query = cloud.database.from('reviews').select('*')
  if (serviceId) query = query.eq('service_id', serviceId)
  const res = await query.order('created_at', { ascending: false }).limit(limit)
  return unwrap(res, '评价加载失败') || []
}

/** 查某个订单已写的评价（用于回填与去重） */
async function getReviewByOrder(orderId) {
  if (!orderId) return null
  const res = await cloud.database
    .from('reviews')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()
  return unwrap(res, '') || null
}

/**
 * 提交或更新评价。
 * 同一订单只允许一条评价（数据库有唯一索引），已存在则改为更新。
 * 图片先上传到云存储，拿到可访问路径后再入库。
 */
async function createReview(payload) {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const uid = session && session.user ? session.user.id : ''
  if (!uid) throw new Error('请先登录后再评价')

  const orderId = Number(payload.orderId || 0)
  if (!orderId) throw new Error('评价缺少订单信息')

  // 校验订单归属与状态
  const order = await getOrder(orderId)
  if (!order) throw new Error('订单不存在')
  if (order.customer_id !== uid) throw new Error('只有下单客户可以评价这单')
  if (order.status !== 'completed') throw new Error('订单完成后才能评价')

  const content = String(payload.content || '').trim()
  if (content.length < 5) throw new Error('评价内容至少 5 个字')
  const rating = Math.min(5, Math.max(1, Number(payload.rating) || 5))

  // 图片上传到云存储
  let imagePaths = []
  const localImages = Array.isArray(payload.images) ? payload.images : []
  for (const item of localImages) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
      imagePaths.push(item) // 已是远程地址
      continue
    }
    if (typeof item !== 'string') continue
    try {
      const uploaded = await samples.uploadImageFile(item, 'reviews', uid)
      if (uploaded) imagePaths.push(uploaded)
    } catch (e) {
      // 单张上传失败不阻断整体提交
      console.error('[review] image upload failed', e && e.message)
    }
  }

  const row = {
    order_id: orderId,
    service_id: payload.serviceId || order.service_id,
    customer_id: uid,
    customer_name: (session.user && (session.user.name || session.user.nickname)) || null,
    provider_owner_id: order.provider_owner_id || null,
    rating,
    content,
    tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 3) : [],
    images: imagePaths
  }

  // 已评价过则更新，否则插入
  const existing = await getReviewByOrder(orderId)
  if (existing) {
    const res = await cloud.database
      .from('reviews')
      .update(row)
      .eq('id', existing.id)
      .select()
    const rows = unwrap(res, '评价更新失败')
    return rows && rows[0]
  }

  const res = await cloud.database.from('reviews').insert(row).select()
  const rows = unwrap(res, '评价提交失败')
  return rows && rows[0]
}

/* ---------------------------------------------------------------- 平台后台 */

async function isStaff(uid) {
  if (!uid) return false
  const res = await cloud.database.from('staff').select('uid, name, role').eq('uid', uid).maybeSingle()
  const row = unwrap(res, '')
  return !!row
}

/** 校验管理员邀请码是否有效（不消耗） */
async function checkAdminInvite(code) {
  const res = await cloud.database.rpc('check_admin_invite', { p_code: String(code || '').trim() })
  if (res.error) throw new Error(res.error.message || '管理码无效')
  const row = (res.data || [])[0]
  if (!row || !row.ok) throw new Error('管理码无效或已被使用')
  return row
}

/** 用邀请码激活管理员身份 */
async function claimAdminInvite(code) {
  const res = await cloud.database.rpc('claim_admin_invite', { p_code: String(code || '').trim() })
  if (res.error) throw new Error(res.error.message || '管理码无效')
  const rows = res.data || []
  if (!rows.length) throw new Error('管理码无效或已被使用')
  return rows[0]
}

/** 后台统计：订单量、成交额、待处理数 */
async function adminStats() {
  const res = await cloud.database.from('orders').select('id, amount, status, created_at')
  const rows = unwrap(res, '统计加载失败') || []
  const stats = {
    total: rows.length,
    open: rows.filter((o) => o.status === 'open').length,
    inProgress: rows.filter((o) => ['taken', 'producing'].includes(o.status)).length,
    completed: rows.filter((o) => o.status === 'completed').length,
    cancelled: rows.filter((o) => o.status === 'cancelled').length,
    gmv: rows
      .filter((o) => o.status === 'completed')
      .reduce((sum, o) => sum + Number(o.amount || 0), 0)
  }
  const providers = await cloud.database.from('providers').select('id')
  const services = await cloud.database.from('services').select('id')
  const cats = await cloud.database.from('categories').select('id')
  stats.providers = (unwrap(providers, '') || []).length
  stats.services = (unwrap(services, '') || []).length
  stats.categories = (unwrap(cats, '') || []).length
  return stats
}

async function adminListOrders(status, limit = 50) {
  let query = cloud.database.from('orders').select('*')
  if (status && status !== 'all') query = query.eq('status', status)
  const res = await query.order('created_at', { ascending: false }).limit(limit)
  return unwrap(res, '订单加载失败') || []
}

module.exports = {
  getSession,
  loginWithWechat,
  signOut,
  listCategories,
  listBanners,
  getSettings,
  listServices,
  getService,
  getProvider,
  getProviderCommission,
  listProviders,
  getMyProvider,
  applyProvider,
  getMyApplication,
  claimProvider,
  becomeProvider,
  publishService,
  updateService,
  toggleServiceStatus,
  listMyServices,
  createOrder,
  listOrders,
  listOpenOrders,
  getOrder,
  advanceOrder,
  takeOrder,
  listReviews,
  listSamples,
  listProviderSamples,
  createSample,
  deleteSample,
  exportAllOrders,
  listNotifications,
  countUnread,
  markNotificationRead,
  markAllNotificationsRead,
  getReviewByOrder,
  createReview,
  isStaff,
  checkAdminInvite,
  claimAdminInvite,
  adminStats,
  adminListOrders,
  friendlyError
}
