/**
 * 数据访问层
 * 所有 cloud.database / cloud.auth 调用集中在这里，页面只负责渲染。
 */
window.API = (function () {
  // 注意：不能用 const cloud = window.cloud —— 端点故障转移时会重建 window.cloud，
  // 闭包常量会一直指向旧 client。这里改用 Proxy 动态取，调用方式完全不变。
  // 另外 SDK 是异步加载的 CDN 脚本，window.cloud 可能尚未创建 —— 这里做保护。
  const cloud = new Proxy({}, {
    get(_t, prop) {
      const c = window.cloud
      if (!c) throw new Error('云服务尚未就绪，请稍后重试')
      return c[prop]
    }
  })

  /* ---------------- 佣金规则 ---------------- */
  // 平台基准佣金率（起步价），与 miniprogram/utils/commission.js 保持一致
  const BASE_COMMISSION = 0.1
  const TIER_COMMISSION = { basic: 0.1, pro: 0.08, studio: 0.05 }
  const MIN_COMMISSION = 0.05

  /** 按服务者的会员档位解析实际佣金率 */
  async function resolveCommissionRate(providerId, providerOwnerId, baseRate) {
    const base = Number(baseRate || BASE_COMMISSION)

    if (!providerId && !providerOwnerId) {
      return { rate: base, tier: 'none', isMember: false }
    }

    // 优先走数据库 RPC（SECURITY DEFINER，不受 RLS 限制，
    // 能读到「别人的」订阅 —— 客户看别人的服务时也要算佣金）
    try {
      const res = await cloud.database.rpc('resolve_commission_rate', {
        p_provider_id: providerId || null,
        p_provider_owner_id: providerOwnerId || null,
        p_base_rate: base
      })
      const row = res && res.data && res.data[0]
      if (row) {
        return {
          rate: Number(row.rate || base),
          tier: row.tier || 'none',
          isMember: row.is_member === true
        }
      }
    } catch (e) {
      // RPC 未部署 → 回退本地
    }

    // 回退：本地解析
    let ownerId = providerOwnerId || ''
    if (!ownerId && providerId) {
      const provRes = await cloud.database.from('providers').select('owner_id').eq('id', providerId).maybeSingle()
      const prov = provRes && provRes.data
      ownerId = (prov && prov.owner_id) || ''
    }
    if (!ownerId) return { rate: base, tier: 'none', isMember: false }

    const subRes = await cloud.database
      .from('member_subscriptions')
      .select('tier, status, expire_at')
      .eq('user_id', ownerId)
      .eq('status', 'active')
      .order('expire_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const sub = subRes && subRes.data
    if (!sub || new Date(sub.expire_at).getTime() <= Date.now()) {
      return { rate: base, tier: 'none', isMember: false }
    }
    const tierRate = TIER_COMMISSION[sub.tier]
    const rate = typeof tierRate === 'number' ? tierRate : base
    return { rate: Math.max(MIN_COMMISSION, Math.min(rate, base)), tier: sub.tier, isMember: true }
  }

  function calcPlatformFee(amount, rate) {
    const amt = Number(amount || 0)
    const r = Number(rate || 0)
    if (amt <= 0) return 0
    return Math.round(amt * r)
  }

  /* ---------------- 工具 ---------------- */

  const yuan = (cents) => (Number(cents || 0) / 100).toFixed(2)
  const yuanShort = (cents) => {
    const n = Number(cents || 0) / 100
    return n % 1 === 0 ? String(n) : n.toFixed(2)
  }

  const COVER_THEMES = [
    'linear-gradient(135deg,#E8B27A,#C4703F)',
    'linear-gradient(135deg,#9FB89A,#5F7A5A)',
    'linear-gradient(135deg,#D9A5A0,#A5645F)',
    'linear-gradient(135deg,#8FA9BF,#5B7186)',
    'linear-gradient(135deg,#D4B87F,#9C8449)',
    'linear-gradient(135deg,#B4A3C7,#7C6A93)'
  ]
  const coverTheme = (seed) => COVER_THEMES[Math.abs(Number(seed) || 0) % COVER_THEMES.length]

  const ORDER_STATUS = {
    open: { text: '待接单', cls: 'badge-pending' },
    taken: { text: '已接单', cls: 'badge-taken' },
    producing: { text: '制作中', cls: 'badge-busy' },
    delivered: { text: '待确认', cls: 'badge-delivered' },
    completed: { text: '已完成', cls: 'badge-done' },
    cancelled: { text: '已取消', cls: 'badge-cancelled' }
  }

  const STATUS_TEXT = {
    open: '待接单',
    taken: '已接单',
    producing: '制作中',
    delivered: '待确认',
    completed: '已完成',
    cancelled: '已取消'
  }

  const FLOW_TEXT = {
    taken: '服务者已接单',
    producing: '开始制作',
    delivered: '成片已交付',
    completed: '订单完成',
    cancelled: '订单取消'
  }

  function makeOrderNo() {
    const d = new Date()
    const pad = (v) => String(v).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    return `GY${stamp}${Math.floor(Math.random() * 900000 + 100000)}`
  }

  function fromNow(iso) {
    if (!iso) return ''
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return ''
    const diff = Date.now() - t
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)} 天前`
    const d = new Date(t)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function unwrap(result, fallbackMessage) {
    if (result && result.error) {
      const err = new Error(result.error.message || fallbackMessage || '操作失败')
      err.code = result.error.code
      throw err
    }
    return result ? result.data : null
  }

  function friendlyError(err) {
    if (!err) return '操作失败，请重试'
    const code = err.code
    if (code === '42501') return '没有权限执行该操作，请确认登录身份'
    if (code === '42P01') return '数据表不存在，请联系平台管理员'
    if (code === '23505') return '记录已存在，请勿重复提交'
    if (code === '23503') return '关联数据不存在，请刷新后重试'
    const msg = String(err.message || '')
    if (/LimitExceeded|PhoneNumberDailyLimit/i.test(msg)) {
      return '该手机号今天的验证码发送次数已达上限，请明天再试，或换其他手机号'
    }
    if (/PhoneNumber.*(frequent|limit)/i.test(msg)) {
      return '验证码发送过于频繁，请稍后再试'
    }
    if (/InvalidPhone|phone.*invalid/i.test(msg)) {
      return '手机号格式不正确，请检查后重试'
    }
    if (/InvalidToken|token.*invalid|expired/i.test(msg)) {
      return '验证码无效或已过期，请重新获取'
    }
    if (/network|timeout|failed to fetch|load failed/i.test(msg)) {
      // 端点整体不可达时，给出更明确的原因（平台侧域名故障）
      if (window.APP_CONFIG && window.APP_CONFIG.endpointFailureHint && /failed to fetch|load failed/i.test(msg)) {
        return window.APP_CONFIG.endpointFailureHint
      }
      return '网络连接失败，请检查网络后重试'
    }
    if (/requires oauthRelayBaseUrl/i.test(msg)) {
      return '登录服务配置不完整，请联系平台管理员'
    }
    return msg || '操作失败，请重试'
  }

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))

  /* ---------------- 会话 ---------------- */

  async function getSession() {
    const res = await cloud.auth.getSession()
    if (res.error) return null
    return res.data || null
  }

  /** 手机验证码：发送 */
  async function sendPhoneCode(phone) {
    const res = await cloud.auth.sendOtp({ phone })
    if (res.error) throw new Error(res.error.message || '验证码发送失败')
    return res.data
  }

  /** 手机验证码：校验并登录 */
  async function verifyPhoneCode(payload) {
    const res = await cloud.auth.verifyOtp({
      phone: payload.phone,
      verificationId: payload.verificationId,
      isExistingUser: payload.isExistingUser,
      token: payload.token
    })
    if (res.error) throw new Error(res.error.message || '验证码校验失败')
    return res.data
  }

  /** 微信扫码登录：返回授权地址 */
  async function wechatLoginUrl() {
    const res = await cloud.auth.signInWithOAuth({
      provider: 'wechat',
      redirectTo: window.location.origin
    })
    if (res.error) throw new Error(res.error.message || '微信登录发起失败')
    return res.data.url
  }

  /** 微信授权回调处理 */
  async function handleWechatCallback() {
    if (typeof cloud.auth.handleWechatWebCallback !== 'function') {
      throw new Error('当前环境暂不支持该登录方式')
    }
    const res = await cloud.auth.handleWechatWebCallback.call(cloud.auth)
    if (res.error) throw new Error(res.error.message || '微信登录失败')
    return res.data
  }

  async function signOut() {
    await cloud.auth.signOut()
  }

  /* ---------------- 目录 ---------------- */

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
    return Promise.all(
      list.map(async (c) => {
        if (!c.image_url) return { ...c, imageUrl: '' }
        if (String(c.image_url).startsWith('http')) return { ...c, imageUrl: c.image_url }
        try {
          if (!window.SAMPLES) return { ...c, imageUrl: '' }
          return { ...c, imageUrl: await window.SAMPLES.signedUrl(c.image_url, 7200) }
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
    return Promise.all(
      list.map(async (b) => {
        if (!b.image_url) return { ...b, imageUrl: '' }
        if (String(b.image_url).startsWith('http')) return { ...b, imageUrl: b.image_url }
        try {
          if (!window.SAMPLES) return { ...b, imageUrl: '' }
          return { ...b, imageUrl: await window.SAMPLES.signedUrl(b.image_url, 7200) }
        } catch (e) {
          return { ...b, imageUrl: '' }
        }
      })
    )
  }

  async function getSettings() {
    const res = await cloud.database.from('platform_settings').select('*').eq('id', 1).maybeSingle()
    return unwrap(res, '平台配置加载失败') || {
      commission_rate: 0.10, min_order_amount: 100, support_phone: '', notice: ''
    }
  }

  /* ---------------- 服务 ---------------- */

  async function listServices(params = {}) {
    const { categorySlug, keyword, providerId, limit = 60, offset = 0 } = params
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
   * cover_url 有两种形态：
   *   - 完整 http(s) 地址 —— 直接用（站点静态资源）
   *   - 云存储路径 —— 需转签名地址才能访问
   * 没有封面的返回空串，页面回退到渐变占位。
   */
  async function attachCoverUrls(services) {
    const list = services || []
    if (!list.length) return []
    return Promise.all(
      list.map(async (s) => {
        if (!s.cover_url) return { ...s, coverUrl: '' }
        if (String(s.cover_url).startsWith('http')) return { ...s, coverUrl: s.cover_url }
        try {
          // SAMPLES 在 samples.js 里定义，比 api.js 晚加载；这里是运行时调用，应该已就绪
          if (!window.SAMPLES) return { ...s, coverUrl: '' }
          const url = await window.SAMPLES.signedUrl(s.cover_url, 7200)
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

  async function listProviders() {
    const res = await cloud.database.from('providers').select('*').order('orders_done', { ascending: false })
    return unwrap(res, '服务者加载失败') || []
  }

  /* ---------------- 服务者身份 ---------------- */

  async function getMyProvider(uid) {
    if (!uid) return null
    const res = await cloud.database.from('providers').select('*').eq('owner_id', uid).maybeSingle()
    return unwrap(res, '身份查询失败') || null
  }

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

  async function claimProvider(providerId, uid) {
    const res = await cloud.database
      .from('providers')
      .update({ owner_id: uid })
      .eq('id', providerId)
      .like('owner_id', 'unbound_%')
      .select()
    const rows = unwrap(res, '认领失败')
    if (!rows || rows.length === 0) throw new Error('认领失败，该身份可能已被其他人认领')
    return rows[0]
  }

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

  async function listMyServices(providerId) {
    if (!providerId) return []
    const res = await cloud.database
      .from('services')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
    return unwrap(res, '我的服务加载失败') || []
  }

  /* ---------------- 订单 ---------------- */

  async function createOrder(payload) {
    // 平台服务费在服务端按服务者的会员档位重算，不采信前端传来的值
    let baseRate = BASE_COMMISSION
    try {
      const settings = await getSettings()
      baseRate = Number(settings.commission_rate || BASE_COMMISSION)
    } catch (e) {
      baseRate = BASE_COMMISSION
    }
    const resolved = await resolveCommissionRate(payload.providerId || null, payload.providerOwnerId || null, baseRate)
    const platformFee = calcPlatformFee(payload.amount, resolved.rate)

    const body = {
      order_no: makeOrderNo(),
      service_id: payload.serviceId,
      provider_id: payload.providerId || null,
      title: payload.title,
      requirement: payload.requirement || '',
      shoot_date: payload.shootDate || null,
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

  /** 查服务者当前适用的佣金率（用于展示） */
  async function getProviderCommission(providerId, baseRate) {
    const settings = baseRate ? { commission_rate: baseRate } : await getSettings()
    return resolveCommissionRate(
      providerId || null,
      null,
      Number(settings.commission_rate || BASE_COMMISSION)
    )
  }

  async function listOrders(params = {}) {
    const { role = 'customer', providerIds = [], uid, status, limit = 60, offset = 0 } = params
    if (!uid) return []
    let query = cloud.database.from('orders').select('*')
    if (role === 'provider') {
      if (!providerIds.length) return []
      query = query.in('provider_id', providerIds)
    } else if (role === 'customer') {
      query = query.eq('customer_id', uid)
    } else {
      const ors = [`customer_id.eq.${uid}`]
      providerIds.forEach((id) => ors.push(`provider_id.eq.${id}`))
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
    const needSign = [...new Set(Object.values(covers).filter((u) => u && !String(u).startsWith('http')))]
    const signed = {}
    if (needSign.length && window.SAMPLES) {
      await Promise.all(
        needSign.map(async (p) => {
          try {
            signed[p] = await window.SAMPLES.signedUrl(p, 7200)
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

  async function listOpenOrders(limit = 40) {
    const res = await cloud.database
      .from('orders')
      .select('*')
      .eq('status', 'open')
      .is('provider_id', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    return unwrap(res, '需求池加载失败') || []
  }

  async function getOrder(id) {
    const res = await cloud.database.from('orders').select('*').eq('id', id).maybeSingle()
    return unwrap(res, '订单加载失败')
  }

  async function advanceOrder(id, nextStatus, note, actorUid) {
    const current = await getOrder(id)
    if (!current) throw new Error('订单不存在')
    const timeline = Array.isArray(current.timeline) ? current.timeline.slice() : []
    timeline.push({
      key: nextStatus,
      text: note ? `${FLOW_TEXT[nextStatus] || nextStatus} · ${note}` : FLOW_TEXT[nextStatus] || nextStatus,
      at: new Date().toISOString(),
      by: actorUid || ''
    })
    const res = await cloud.database
      .from('orders')
      .update({ status: nextStatus, timeline })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '状态更新失败')
    if (!rows || rows.length === 0) throw new Error('状态更新失败，该订单可能不属于你')
    return rows[0]
  }

  async function takeOrder(id, providerId, providerOwnerId) {
    // 会员门槛：只有有效会员才能接单
    const sub = await getMyMemberStatus(providerOwnerId)
    if (!sub || !sub.isMember) {
      const err = new Error('开通会员后才能接单')
      err.code = 'NEED_MEMBER'
      throw err
    }

    // 公开需求池的订单下单时不知服务者是谁，佣金按平台基准算的。
    // 接单人确定后，按其会员档位重算佣金。
    let feePatch = {}
    try {
      const cur = await getOrder(id)
      if (cur) {
        const settings = await getSettings()
        const resolved = await resolveCommissionRate(
          providerId,
          providerOwnerId,
          Number(settings.commission_rate || BASE_COMMISSION)
        )
        feePatch = {
          platform_fee: calcPlatformFee(cur.amount, resolved.rate),
          commission_rate: resolved.rate,
          member_tier: resolved.tier
        }
      }
    } catch (e) {
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
    return rows[0]
  }

  /* ---------------- 消息通知 ---------------- */

  /** 发一条站内通知。失败不影响主流程 */
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

  async function listNotifications(limit = 60) {
    const session = await getSession()
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

  async function countUnread() {
    const session = await getSession()
    const uid = session && session.user ? session.user.id : ''
    if (!uid) return 0
    const res = await cloud.database
      .from('notifications')
      .select('id')
      .eq('receiver_id', uid)
      .eq('is_read', false)
    return (unwrap(res, '') || []).length
  }

  async function markNotificationRead(id) {
    const res = await cloud.database
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    return unwrap(res, '标记已读失败')
  }

  async function markAllNotificationsRead() {
    const session = await getSession()
    const uid = session && session.user ? session.user.id : ''
    if (!uid) return 0
    const res = await cloud.database
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('receiver_id', uid)
      .eq('is_read', false)
      .select()
    return (unwrap(res, '') || []).length
  }

  /* ---------------- 评价 ---------------- */

  async function listReviews(serviceId, limit = 20) {
    let query = cloud.database.from('reviews').select('*')
    if (serviceId) query = query.eq('service_id', serviceId)
    const res = await query.order('created_at', { ascending: false }).limit(limit)
    return unwrap(res, '评价加载失败') || []
  }

  /** 查某订单已写的评价（回填 + 去重） */
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
   * 提交或更新评价。同一订单只允许一条（数据库有唯一索引），已存在则改为更新。
   * 图片先上传云存储拿到路径再入库。
   */
  async function createReview(payload) {
    const session = await getSession()
    const uid = session && session.user ? session.user.id : ''
    if (!uid) throw new Error('请先登录后再评价')

    const orderId = Number(payload.orderId || 0)
    if (!orderId) throw new Error('评价缺少订单信息')

    const order = await getOrder(orderId)
    if (!order) throw new Error('订单不存在')
    if (order.customer_id !== uid) throw new Error('只有下单客户可以评价这单')
    if (order.status !== 'completed') throw new Error('订单完成后才能评价')

    const content = String(payload.content || '').trim()
    if (content.length < 5) throw new Error('评价内容至少 5 个字')
    const rating = Math.min(5, Math.max(1, Number(payload.rating) || 5))

    // 图片上传到云存储
    const imagePaths = []
    const localImages = Array.isArray(payload.images) ? payload.images : []
    for (const file of localImages) {
      if (typeof file === 'string' && /^https?:\/\//i.test(file)) {
        imagePaths.push(file)
        continue
      }
      try {
        const path = `shared/${uid}/reviews/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`
        const uploaded = await cloud.storage.upload(path, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
          metadata: { purpose: 'review' }
        })
        if (uploaded.error) throw new Error(uploaded.error.message || '图片上传失败')
        imagePaths.push(path)
      } catch (e) {
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

    const existing = await getReviewByOrder(orderId)
    if (existing) {
      const res = await cloud.database.from('reviews').update(row).eq('id', existing.id).select()
      const rows = unwrap(res, '评价更新失败')
      return rows && rows[0]
    }

    const res = await cloud.database.from('reviews').insert(row).select()
    const rows = unwrap(res, '评价提交失败')
    return rows && rows[0]
  }

  /* ---------------- 宣传样片 ---------------- */

  /** 某服务的样片列表 */
  async function listSamples(serviceId) {
    const res = await cloud.database
      .from('service_samples')
      .select('*')
      .eq('service_id', serviceId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    return unwrap(res, '样片加载失败') || []
  }

  /** 某服务者的全部样片（管理用）。不传 providerId 时返回全部（需管理员身份）。 */
  async function listProviderSamples(providerId) {
    let query = cloud.database.from('service_samples').select('*')
    if (providerId) query = query.eq('provider_id', providerId)
    const res = await query.order('created_at', { ascending: false }).limit(200)
    return unwrap(res, '样片加载失败') || []
  }

  async function createSample(payload) {
    const res = await cloud.database.from('service_samples').insert(payload).select()
    const rows = unwrap(res, '样片保存失败')
    return rows && rows[0]
  }

  async function updateSample(id, payload) {
    const res = await cloud.database.from('service_samples').update(payload).eq('id', id).select()
    const rows = unwrap(res, '更新失败')
    if (!rows || rows.length === 0) throw new Error('更新失败，该样片不存在或不属于你')
    return rows[0]
  }

  async function deleteSample(id) {
    const res = await cloud.database.from('service_samples').delete().eq('id', id).select()
    const rows = unwrap(res, '删除失败')
    if (!rows || rows.length === 0) throw new Error('删除失败，该样片不存在或不属于你')
    // 顺带清掉存储文件
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

  /* ---------------- 后台 ---------------- */

  async function isStaff(uid) {
    if (!uid) return false
    const res = await cloud.database.from('staff').select('uid, name, role').eq('uid', uid).maybeSingle()
    return !!unwrap(res, '')
  }

  /**
   * 用管理码激活管理员身份。首次部署时用这个把平台管理员账号建起来。
   */
  async function claimAdminInvite(code) {
    const res = await cloud.database.rpc('claim_admin_invite', { p_code: String(code || '').trim() })
    if (res.error) throw new Error(res.error.message || '管理码无效')
    const rows = res.data || []
    if (!rows.length) throw new Error('管理码无效或已被使用')
    return rows[0]
  }

  /**
   * 校验管理码是否有效（不消耗）。用 RPC 查，避免把码表暴露给前端。
   */
  async function checkAdminInvite(code) {
    const res = await cloud.database.rpc('check_admin_invite', { p_code: String(code || '').trim() })
    if (res.error) throw new Error(res.error.message || '管理码无效')
    const row = (res.data || [])[0]
    if (!row || !row.ok) throw new Error('管理码无效或已被使用')
    return row
  }

  /**
   * 管理端统计。所有订单按状态分组，另算成交额、服务者活跃度、热销榜。
   */
  async function adminStats() {
    const [ordersRes, providersRes, servicesRes, catsRes, reviewsRes, appsRes, settleRes] =
      await Promise.all([
        cloud.database.from('orders').select('id, amount, platform_fee, status, provider_id, customer_id, created_at'),
        cloud.database.from('providers').select('*'),
        cloud.database.from('services').select('*'),
        cloud.database.from('categories').select('*'),
        cloud.database.from('reviews').select('id, rating, content, service_id, created_at'),
        cloud.database.from('provider_applications').select('*'),
        cloud.database.from('settlements').select('*')
      ])

    const orders = unwrap(ordersRes, '统计加载失败') || []
    const providers = unwrap(providersRes, '') || []
    const services = unwrap(servicesRes, '') || []
    const categories = unwrap(catsRes, '') || []
    const reviews = unwrap(reviewsRes, '') || []
    const applications = unwrap(appsRes, '') || []
    const settlements = unwrap(settleRes, '') || []

    const completed = orders.filter((o) => o.status === 'completed')
    const gmv = completed.reduce((s, o) => s + Number(o.amount || 0), 0)
    const commission = completed.reduce((s, o) => s + Number(o.platform_fee || 0), 0)

    // 近 7 天订单趋势
    const trend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const dayOrders = orders.filter((o) => String(o.created_at || '').slice(0, 10) === key)
      trend.push({
        date: key.slice(5),
        count: dayOrders.length,
        amount: dayOrders.reduce((s, o) => s + Number(o.amount || 0), 0)
      })
    }

    // 热销服务 Top 5
    const topServices = services
      .slice()
      .sort((a, b) => b.sales_count - a.sales_count)
      .slice(0, 5)
      .map((s) => {
        const p = providers.find((x) => x.id === s.provider_id)
        return {
          id: s.id,
          title: s.title,
          provider: p ? p.nickname : '—',
          sales: s.sales_count,
          price: s.price,
          status: s.status
        }
      })

    // 分类分布
    const byCategory = categories.map((c) => ({
      name: c.name,
      count: services.filter((s) => s.category_id === c.id).length
    }))

    return {
      total: orders.length,
      open: orders.filter((o) => o.status === 'open').length,
      taken: orders.filter((o) => o.status === 'taken').length,
      producing: orders.filter((o) => o.status === 'producing').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      completed: completed.length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      gmv,
      commission,
      providers: providers.length,
      verifiedProviders: providers.filter((p) => p.is_verified).length,
      services: services.length,
      onShelf: services.filter((s) => s.status === 'on').length,
      categories: categories.length,
      reviews: reviews.length,
      avgRating: reviews.length
        ? (reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length).toFixed(1)
        : '0.0',
      pendingApplications: applications.filter((a) => a.status === 'pending').length,
      pendingSettlements: settlements.filter((s) => s.status === 'pending').length,
      trend,
      topServices,
      byCategory,
      applications
    }
  }

  async function adminListOrders(status, limit = 100) {
    let query = cloud.database.from('orders').select('*')
    if (status && status !== 'all') query = query.eq('status', status)
    const res = await query.order('created_at', { ascending: false }).limit(limit)
    return unwrap(res, '订单加载失败') || []
  }

  /* ---------------- 服务者审核 ---------------- */

  async function listApplications(status) {
    let query = cloud.database.from('provider_applications').select('*')
    if (status && status !== 'all') query = query.eq('status', status)
    const res = await query.order('created_at', { ascending: false }).limit(100)
    return unwrap(res, '申请列表加载失败') || []
  }

  /**
   * 审核服务者申请。通过则同时创建 providers 记录，申请人即刻成为服务者。
   */
  async function reviewApplication(appId, approve, adminUid, adminName, note) {
    const appRes = await cloud.database
      .from('provider_applications')
      .select('*')
      .eq('id', appId)
      .maybeSingle()
    const application = unwrap(appRes, '申请不存在')
    if (!application) throw new Error('申请不存在')
    if (application.status !== 'pending') throw new Error('该申请已处理过了')

    if (!approve) {
      const res = await cloud.database
        .from('provider_applications')
        .update({
          status: 'rejected',
          admin_note: note || '资料信息不完整，请补充后重新提交。',
          reviewed_by: adminUid || null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', appId)
        .eq('status', 'pending')
        .select()
      const rows = unwrap(res, '审核失败')
      if (!rows || rows.length === 0) throw new Error('审核失败，该申请可能已被处理')
      await logAction(adminUid, adminName, 'reject_application', 'provider_application', String(appId), note)
      await notify(application.applicant_uid, {
        role: 'provider',
        title: '服务者申请未通过',
        body: note || '资料信息不完整，请补充后重新提交。',
        type: 'apply',
        linkType: 'profile'
      })
      return rows[0]
    }

    // 通过：建 providers 记录
    const provRes = await cloud.database
      .from('providers')
      .insert({
        owner_id: application.applicant_uid,
        owner_name: application.applicant_name || null,
        nickname: application.nickname,
        bio: application.bio || '',
        city: application.city || '银川',
        tags: application.tags || [],
        rating: 5.0,
        orders_done: 0,
        works_count: 0,
        is_verified: true
      })
      .select()
    const providers = unwrap(provRes, '开通服务者失败')
    if (!providers || providers.length === 0) throw new Error('开通服务者失败')

    const res = await cloud.database
      .from('provider_applications')
      .update({
        status: 'approved',
        admin_note: note || null,
        reviewed_by: adminUid || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', appId)
      .eq('status', 'pending')
      .select()
    const rows = unwrap(res, '审核失败')
    if (!rows || rows.length === 0) throw new Error('审核失败，该申请可能已被处理')
    await logAction(adminUid, adminName, 'approve_application', 'provider_application', String(appId), note)
    await notify(application.applicant_uid, {
      role: 'provider',
      title: '服务者申请已通过',
      body: `你的服务者身份「${application.nickname}」已开通，现在可以上架服务、接单赚取收益。`,
      type: 'apply',
      linkType: 'studio'
    })
    return rows[0]
  }

  /* ---------------- 服务者管理 ---------------- */

  async function listProvidersAdmin() {
    const res = await cloud.database.from('providers').select('*').order('orders_done', { ascending: false })
    return unwrap(res, '服务者加载失败') || []
  }

  async function setProviderVerified(providerId, verified) {
    const res = await cloud.database
      .from('providers')
      .update({ is_verified: verified })
      .eq('id', providerId)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || rows.length === 0) throw new Error('操作失败，该服务者不存在')
    return rows[0]
  }

  /* ---------------- 订单干预 ---------------- */

  async function adminUpdateOrderStatus(orderId, status, note, adminUid, adminName) {
    const res = await cloud.database
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || rows.length === 0) throw new Error('操作失败，该订单不存在或不在你的管理范围')
    await logAction(adminUid, adminName, 'update_order_status', 'order', String(orderId), `${status}${note ? ' · ' + note : ''}`)
    return rows[0]
  }

  /* ---------------- 内容配置 ---------------- */

  async function updateBanner(id, payload) {
    const res = await cloud.database.from('banners').update(payload).eq('id', id).select()
    const rows = unwrap(res, '更新失败')
    if (!rows || rows.length === 0) throw new Error('更新失败，该轮播位不存在')
    return rows[0]
  }

  async function createBanner(payload) {
    const res = await cloud.database.from('banners').insert(payload).select()
    const rows = unwrap(res, '创建失败')
    return rows && rows[0]
  }

  async function deleteBanner(id) {
    const res = await cloud.database.from('banners').delete().eq('id', id).select()
    const rows = unwrap(res, '删除失败')
    if (!rows || rows.length === 0) throw new Error('删除失败，该轮播位不存在')
    return rows[0]
  }

  async function updateCategory(id, payload) {
    const res = await cloud.database.from('categories').update(payload).eq('id', id).select()
    const rows = unwrap(res, '更新失败')
    if (!rows || rows.length === 0) throw new Error('更新失败，该分类不存在')
    return rows[0]
  }

  async function updateSettings(payload) {
    const res = await cloud.database.from('platform_settings').update(payload).eq('id', 1).select()
    const rows = unwrap(res, '更新失败')
    if (!rows || rows.length === 0) throw new Error('更新失败')
    return rows[0]
  }

  /* ---------------- 结算 ---------------- */

  async function listSettlements(status) {
    let query = cloud.database.from('settlements').select('*')
    if (status && status !== 'all') query = query.eq('status', status)
    const res = await query.order('created_at', { ascending: false }).limit(100)
    return unwrap(res, '结算单加载失败') || []
  }

  /**
   * 生成结算单：按服务者汇总已完成订单。
   */
  async function generateSettlements(period, adminUid, adminName) {
    const ordersRes = await cloud.database
      .from('orders')
      .select('*')
      .eq('status', 'completed')
    const orders = unwrap(ordersRes, '订单加载失败') || []
    if (!orders.length) throw new Error('没有已完成订单可结算')

    const groups = {}
    orders.forEach((o) => {
      if (!o.provider_id) return
      if (!groups[o.provider_id]) groups[o.provider_id] = []
      groups[o.provider_id].push(o)
    })

    const created = []
    for (const pid of Object.keys(groups)) {
      const list = groups[pid]
      const gross = list.reduce((s, o) => s + Number(o.amount || 0), 0)
      const fee = list.reduce((s, o) => s + Number(o.platform_fee || 0), 0)
      const res = await cloud.database
        .from('settlements')
        .insert({
          provider_id: Number(pid),
          provider_owner_id: list[0].provider_owner_id || null,
          period,
          order_count: list.length,
          gross_amount: gross,
          commission_amount: fee,
          net_amount: gross - fee,
          status: 'pending'
        })
        .select()
      const rows = unwrap(res, '生成结算单失败')
      if (rows && rows[0]) created.push(rows[0])
    }
    await logAction(adminUid, adminName, 'generate_settlements', 'settlement', period, `生成 ${created.length} 张结算单`)
    return created
  }

  async function paySettlement(id, adminUid, adminName) {
    const res = await cloud.database
      .from('settlements')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || rows.length === 0) throw new Error('操作失败，该结算单不存在或已打款')
    await logAction(adminUid, adminName, 'pay_settlement', 'settlement', String(id), '')
    return rows[0]
  }

  /* ---------------- 操作日志 ---------------- */

  async function logAction(adminUid, adminName, action, targetType, targetId, detail) {
    try {
      await cloud.database.from('admin_actions').insert({
        admin_uid: adminUid || 'unknown',
        admin_name: adminName || null,
        action,
        target_type: targetType || null,
        target_id: targetId || null,
        detail: detail || null
      })
    } catch (e) {
      console.error('[admin] logAction failed', JSON.stringify({ message: e.message }))
    }
  }

  async function listAdminActions(limit = 50) {
    const res = await cloud.database
      .from('admin_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    return unwrap(res, '日志加载失败') || []
  }

  /* ---------------- 用户资料 ---------------- */

  /** 读取我的资料（没有就返回默认值，不报错） */
  async function getMyProfile(uid) {
    if (!uid) return null
    const res = await cloud.database
      .from('user_profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
    const row = unwrap(res, null)
    if (row) return row
    return {
      id: null,
      user_id: uid,
      nickname: '',
      avatar_url: null,
      bio: '',
      city: '银川',
      phone: null,
      gender: '',
      birthday: null,
      tags: [],
      show_phone: false,
      show_city: true,
      is_verified: false,
      created_at: null,
      updated_at: null
    }
  }

  /** 保存我的资料（有则更新，无则插入） */
  async function saveMyProfile(uid, patch) {
    if (!uid) throw new Error('请先登录')
    const p = patch || {}
    // 白名单：只允许改这些字段，防止越权写 user_id / is_verified
    const allowed = ['nickname', 'avatar_url', 'bio', 'city', 'phone', 'gender', 'birthday', 'tags', 'show_phone', 'show_city']
    const data = {}
    allowed.forEach((k) => {
      if (p[k] !== undefined) data[k] = p[k]
    })

    if (data.nickname !== undefined && !String(data.nickname || '').trim()) {
      throw new Error('昵称不能为空')
    }
    if (data.bio !== undefined && String(data.bio).length > 200) {
      throw new Error('个人简介不能超过 200 字')
    }
    if (data.tags !== undefined) {
      const tags = (data.tags || []).map((t) => String(t).trim()).filter(Boolean)
      if (tags.length > 8) throw new Error('最多设置 8 个标签')
      data.tags = tags.map((t) => t.slice(0, 12))
    }
    if (data.phone) {
      const ph = String(data.phone).replace(/\s/g, '')
      if (!/^1\d{10}$/.test(ph)) throw new Error('请输入正确的 11 位手机号')
      data.phone = ph
    }
    if (data.nickname !== undefined) data.nickname = String(data.nickname).trim().slice(0, 20)
    if (data.city !== undefined) data.city = String(data.city).trim().slice(0, 20) || '银川'
    data.updated_at = new Date().toISOString()

    const cur = await cloud.database
      .from('user_profiles')
      .select('id')
      .eq('user_id', uid)
      .maybeSingle()
    const existing = unwrap(cur, null)

    if (existing) {
      const res = await cloud.database
        .from('user_profiles')
        .update(data)
        .eq('user_id', uid)
        .select()
      const rows = unwrap(res, '保存失败')
      if (!rows || !rows.length) throw new Error('保存失败')
      return rows[0]
    }

    const res = await cloud.database
      .from('user_profiles')
      .insert({ user_id: uid, ...data })
      .select()
    const rows = unwrap(res, '保存失败')
    if (!rows || !rows.length) throw new Error('保存失败')
    return rows[0]
  }

  /** 上传头像，返回存储路径（存库用） */
  async function uploadAvatar(uid, file) {
    if (!uid) throw new Error('请先登录')
    if (!file) throw new Error('请选择图片')
    const MAX_MB = 5
    if (file.size > MAX_MB * 1024 * 1024) {
      throw new Error(`图片过大，不能超过 ${MAX_MB}MB`)
    }
    const ext = (file.name || '').toLowerCase().endsWith('.png') ? 'png' : 'jpg'
    const rand = Math.random().toString(36).slice(2, 10)
    const path = `shared/${uid}/avatars/${Date.now()}-${rand}.${ext}`
    const uploaded = await cloud.storage.upload(path, file, {
      contentType: file.type || (ext === 'png' ? 'image/png' : 'image/jpeg'),
      cacheControl: '3600',
      upsert: false,
      metadata: { purpose: 'avatar' }
    })
    if (uploaded.error) throw new Error(uploaded.error.message || '头像上传失败')
    return path
  }

  /** 资料完整度（0-100） */
  function profileCompleteness(profile) {
    if (!profile) return 0
    const items = [
      { ok: !!String(profile.nickname || '').trim(), w: 25 },
      { ok: !!profile.avatar_url, w: 25 },
      { ok: !!String(profile.bio || '').trim(), w: 20 },
      { ok: !!String(profile.city || '').trim(), w: 10 },
      { ok: (profile.tags || []).length > 0, w: 10 },
      { ok: !!profile.phone, w: 10 }
    ]
    return items.reduce((s, i) => s + (i.ok ? i.w : 0), 0)
  }

  /** 还没填的字段（引导文案） */
  function profileMissing(profile) {
    if (!profile) return ['昵称']
    const miss = []
    if (!String(profile.nickname || '').trim()) miss.push('昵称')
    if (!profile.avatar_url) miss.push('头像')
    if (!String(profile.bio || '').trim()) miss.push('个人简介')
    if (!(profile.tags || []).length) miss.push('擅长方向')
    return miss
  }

  /* ---------------- 会员包月（用户端） ---------------- */

  /** 我的会员状态 */
  async function getMyMemberStatus(uid) {
    if (!uid) {
      return { isMember: false, tier: 'none', planName: '', daysLeft: 0, commissionRate: null, maxServices: 0, expireAt: '' }
    }
    const res = await cloud.database
      .from('member_subscriptions')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'active')
      .order('expire_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const sub = unwrap(res, '')
    if (!sub) {
      return { isMember: false, tier: 'none', planName: '', daysLeft: 0, commissionRate: null, maxServices: 0, expireAt: '' }
    }
    if (new Date(sub.expire_at).getTime() <= Date.now()) {
      await cloud.database
        .from('member_subscriptions')
        .update({ status: 'expired' })
        .eq('id', sub.id)
        .catch(() => null)
      return { isMember: false, tier: 'none', planName: '', daysLeft: 0, commissionRate: null, maxServices: 0, expireAt: '' }
    }
    const planRes = await cloud.database.from('member_plans').select('*').eq('id', sub.plan_id).maybeSingle()
    const plan = unwrap(planRes, null)
    const daysLeft = Math.max(0, Math.ceil((new Date(sub.expire_at).getTime() - Date.now()) / 86400000))
    return {
      isMember: true,
      tier: sub.tier,
      planName: plan ? plan.name : sub.plan_code,
      daysLeft,
      commissionRate: plan ? Number(plan.commission_rate) : null,
      maxServices: plan ? plan.max_services : 0,
      expireAt: sub.expire_at,
      subscriptionId: sub.id
    }
  }

  /** 创建会员开通订单（待支付） */
  async function createMemberOrder(uid, planCode) {
    if (!uid) throw new Error('请先登录')
    const planRes = await cloud.database.from('member_plans').select('*').eq('code', planCode).maybeSingle()
    const plan = unwrap(planRes, '')
    if (!plan) throw new Error('该套餐不存在或已下架')

    const cur = await getMyMemberStatus(uid)
    const firstTime = !cur.isMember
    const priceCents = Number(plan.price_cents || 0)
    const periodDays = Number(plan.period_days || 30)
    const depositCents = firstTime ? Number(plan.deposit_cents || 0) : 0
    const onboardingCents = firstTime ? Number(plan.onboarding_fee_cents || 0) : 0
    const totalCents = priceCents + depositCents + onboardingCents

    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const orderNo = `MB${ymd}${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    const res = await cloud.database
      .from('member_payment_orders')
      .insert({
        order_no: orderNo,
        user_id: uid,
        plan_id: plan.id,
        plan_code: plan.code,
        plan_name: plan.name,
        fee_type: firstTime ? 'membership_with_deposit' : 'membership',
        amount_cents: totalCents,
        status: 'pending',
        remark: firstTime
          ? `会员费 ¥${(priceCents / 100).toFixed(2)} + 保证金 ¥${(depositCents / 100).toFixed(2)} + 入驻费 ¥${(onboardingCents / 100).toFixed(2)}`
          : `会员费 ¥${(priceCents / 100).toFixed(2)}（续费 ${periodDays} 天）`
      })
      .select()
    const rows = unwrap(res, '创建订单失败')
    if (!rows || !rows.length) throw new Error('创建订单失败')
    return {
      order: rows[0],
      plan,
      breakdown: {
        membership: priceCents,
        deposit: depositCents,
        onboarding: onboardingCents,
        total: totalCents,
        periodDays,
        firstTime
      }
    }
  }

  /** 我的会员订单 */
  async function listMyMemberOrders(uid, limit) {
    if (!uid) return []
    const res = await cloud.database
      .from('member_payment_orders')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(limit || 20)
    return unwrap(res, '记录加载失败') || []
  }

  /** 我的保证金 */
  async function getMyMemberDeposit(uid) {
    if (!uid) return null
    const res = await cloud.database
      .from('provider_deposits')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'held')
      .limit(1)
      .maybeSingle()
    return unwrap(res, null)
  }

  /* ---------------- 会员包月 ---------------- */

  /** 会员套餐列表 */
  async function listMemberPlans(includeOff) {
    let query = cloud.database.from('member_plans').select('*')
    if (!includeOff) query = query.eq('status', 'on')
    const res = await query.order('sort_order', { ascending: true })
    return unwrap(res, '套餐加载失败') || []
  }

  /** 会员列表（管理端） */
  async function listMemberSubscriptions(status) {
    let query = cloud.database.from('member_subscriptions').select('*')
    if (status && status !== 'all') query = query.eq('status', status)
    const res = await query.order('created_at', { ascending: false }).limit(200)
    return unwrap(res, '会员列表加载失败') || []
  }

  /** 会员支付订单列表（管理端） */
  async function listMemberPaymentOrders(status) {
    let query = cloud.database.from('member_payment_orders').select('*')
    if (status && status !== 'all') query = query.eq('status', status)
    const res = await query.order('created_at', { ascending: false }).limit(200)
    return unwrap(res, '订单加载失败') || []
  }

  /** 保证金台账 */
  async function listProviderDeposits(status) {
    let query = cloud.database.from('provider_deposits').select('*')
    if (status && status !== 'all') query = query.eq('status', status)
    const res = await query.order('created_at', { ascending: false }).limit(200)
    return unwrap(res, '保证金加载失败') || []
  }

  /** 会员统计 */
  async function memberStats() {
    const [subs, orders, deposits] = await Promise.all([
      cloud.database.from('member_subscriptions').select('id, tier, status, expire_at'),
      cloud.database.from('member_payment_orders').select('id, status, amount_cents, fee_type'),
      cloud.database.from('provider_deposits').select('id, status, amount_cents')
    ])
    const s = subs.data || []
    const o = orders.data || []
    const d = deposits.data || []
    const now = Date.now()
    const active = s.filter((x) => x.status === 'active' && new Date(x.expire_at).getTime() > now)
    return {
      totalMembers: active.length,
      expiringSoon: active.filter((x) => {
        const left = (new Date(x.expire_at).getTime() - now) / 86400000
        return left <= 7
      }).length,
      pendingOrders: o.filter((x) => x.status === 'pending').length,
      paidAmount: o.filter((x) => x.status === 'paid').reduce((s2, x) => s2 + Number(x.amount_cents || 0), 0),
      pendingAmount: o.filter((x) => x.status === 'pending').reduce((s2, x) => s2 + Number(x.amount_cents || 0), 0),
      heldDeposit: d.filter((x) => x.status === 'held').reduce((s2, x) => s2 + Number(x.amount_cents || 0), 0),
      depositCount: d.filter((x) => x.status === 'held').length,
      byTier: {
        basic: active.filter((x) => x.tier === 'basic').length,
        pro: active.filter((x) => x.tier === 'pro').length,
        studio: active.filter((x) => x.tier === 'studio').length
      }
    }
  }

  /**
   * 确认收款并开通会员（支付通道未开时由管理员操作；
   * 接通支付后由支付回调调用同一套逻辑）
   */
  async function activateMemberSubscription(userId, orderNo, adminUid, adminName, payMethod, transactionId) {
    const ordRes = await cloud.database
      .from('member_payment_orders')
      .select('*')
      .eq('order_no', orderNo)
      .maybeSingle()
    const order = unwrap(ordRes, '')
    if (!order) throw new Error('订单不存在')
    if (order.status === 'paid') throw new Error('该订单已支付')
    if (order.status === 'cancelled') throw new Error('该订单已取消')

    const planRes = await cloud.database
      .from('member_plans')
      .select('*')
      .eq('code', order.plan_code)
      .maybeSingle()
    const plan = unwrap(planRes, '')
    if (!plan) throw new Error('套餐不存在')

    await cloud.database
      .from('member_payment_orders')
      .update({
        status: 'paid',
        pay_method: payMethod || 'manual',
        transaction_id: transactionId || null,
        paid_at: new Date().toISOString()
      })
      .eq('id', order.id)

    // 计算订阅期（续费从原到期日顺延）
    const curRes = await cloud.database
      .from('member_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('expire_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const cur = unwrap(curRes, null)
    let startAt = new Date()
    if (cur) {
      const t = new Date(cur.expire_at).getTime()
      if (t > Date.now()) startAt = new Date(t)
    }
    const periodDays = Number(plan.period_days || 30)
    const expireAt = new Date(startAt.getTime() + periodDays * 86400000)

    const subRes = await cloud.database
      .from('member_subscriptions')
      .insert({
        user_id: userId,
        plan_id: plan.id,
        plan_code: plan.code,
        tier: plan.tier,
        status: 'active',
        period_days: periodDays,
        price_cents: order.amount_cents,
        deposit_cents: plan.deposit_cents,
        onboarding_fee_cents: plan.onboarding_fee_cents,
        start_at: startAt.toISOString(),
        expire_at: expireAt.toISOString(),
        auto_renew: false,
        payment_order_id: order.id
      })
      .select()
    const subs = unwrap(subRes, '开通失败')
    if (!subs || !subs.length) throw new Error('开通会员失败')

    // 首次开通冻结保证金
    if (Number(plan.deposit_cents || 0) > 0) {
      const exists = await cloud.database
        .from('provider_deposits')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'held')
        .limit(1)
        .maybeSingle()
      if (!unwrap(exists, null)) {
        await cloud.database
          .from('provider_deposits')
          .insert({
            user_id: userId,
            amount_cents: plan.deposit_cents,
            status: 'held',
            note: `开通${plan.name}时冻结`
          })
          .catch(() => null)
      }
    }

    await cloud.database
      .from('membership_logs')
      .insert({
        user_id: userId,
        action: 'activate',
        plan_code: plan.code,
        detail: `${plan.name}，有效期至 ${expireAt.toLocaleDateString('zh-CN')}`,
        amount_cents: order.amount_cents,
        operator_uid: adminUid || null,
        operator_name: adminName || null
      })
      .catch(() => null)

    await logAction(adminUid, adminName, 'activate_member', 'member_subscription', String(subs[0].id), order.order_no)
    return subs[0]
  }

  /** 退还保证金 */
  async function refundMemberDeposit(userId, adminUid, adminName, note) {
    const depRes = await cloud.database
      .from('provider_deposits')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'held')
      .limit(1)
      .maybeSingle()
    const dep = unwrap(depRes, '')
    if (!dep) throw new Error('没有可退还的保证金')

    await cloud.database
      .from('provider_deposits')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        note: note || '平台退还保证金'
      })
      .eq('id', dep.id)

    await cloud.database
      .from('membership_logs')
      .insert({
        user_id: userId,
        action: 'deposit_refund',
        detail: note || '平台退还保证金',
        amount_cents: -Number(dep.amount_cents || 0),
        operator_uid: adminUid || null,
        operator_name: adminName || null
      })
      .catch(() => null)

    await logAction(adminUid, adminName, 'refund_deposit', 'provider_deposit', String(dep.id), note || '')
    return dep
  }

  /** 取消会员 */
  async function cancelMemberSubscription(id, adminUid, adminName) {
    const res = await cloud.database
      .from('member_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), auto_renew: false })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，会员记录不存在')
    await logAction(adminUid, adminName, 'cancel_member', 'member_subscription', String(id), '')
    return rows[0]
  }

  /* ---------------- 人工客服 ---------------- */

  /** 当前登录用户 uid */
  async function currentUid() {
    const session = await getSession()
    return session && session.user ? session.user.id : ''
  }

  /** 取得（必要时创建）当前用户的客服会话 */
  async function createSupportConversation(subject) {
    const uid = await currentUid()
    if (!uid) throw new Error('请先登录后再联系客服')

    const existing = await cloud.database
      .from('support_conversations')
      .select('*')
      .eq('customer_id', uid)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .limit(1)
    const rows = unwrap(existing, '') || []
    if (rows.length) return rows[0]

    const session = await getSession()
    const u = (session && session.user) || {}
    const res = await cloud.database
      .from('support_conversations')
      .insert({
        customer_id: uid,
        customer_name: u.name || u.nickname || '客户',
        customer_avatar: u.avatarUrl || '',
        subject: subject || '在线咨询',
        status: 'open'
      })
      .select()
    const created = unwrap(res, '发起咨询失败')
    return created && created[0]
  }

  /** 我的会话（客户侧） */
  async function listMySupportConversations() {
    const uid = await currentUid()
    if (!uid) return []
    const res = await cloud.database
      .from('support_conversations')
      .select('*')
      .eq('customer_id', uid)
      .order('updated_at', { ascending: false })
      .limit(50)
    return unwrap(res, '会话加载失败') || []
  }

  /** 全部会话（客服侧） */
  async function listSupportConversations(status) {
    let query = cloud.database.from('support_conversations').select('*')
    if (status) query = query.eq('status', status)
    const res = await query.order('updated_at', { ascending: false }).limit(200)
    return unwrap(res, '会话列表加载失败') || []
  }

  /** 会话详情（含消息） */
  async function getSupportConversation(conversationId) {
    if (!conversationId) return null
    const convRes = await cloud.database
      .from('support_conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle()
    const conv = unwrap(convRes, '')
    if (!conv) return null
    const msgRes = await cloud.database
      .from('support_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)
    return { conversation: conv, messages: unwrap(msgRes, '消息加载失败') || [] }
  }

  /**
   * 发消息
   * @param {number} conversationId
   * @param {string} content
   * @param {string} senderRole customer | staff
   * @param {string} senderName
   */
  async function sendSupportMessage(conversationId, content, senderRole, senderName) {
    const text = String(content || '').trim()
    if (!text) throw new Error('消息不能为空')
    if (text.length > 1000) throw new Error('单条消息不能超过 1000 字')

    const role = senderRole || 'customer'
    const session = await getSession()
    const u = (session && session.user) || {}
    const name = senderName || (role === 'staff' ? '平台客服' : u.name || u.nickname || '客户')

    const res = await cloud.database
      .from('support_messages')
      .insert({
        conversation_id: conversationId,
        sender_role: role,
        sender_id: u.id || '',
        sender_name: name,
        content: text,
        message_type: 'text'
      })
      .select()
    const rows = unwrap(res, '发送失败')
    const message = rows && rows[0]
    if (!message) return null

    // 更新会话摘要与未读数（先读后写自增）
    const now = new Date().toISOString()
    const incField = role === 'staff' ? 'unread_for_customer' : 'unread_for_staff'
    let current = 0
    try {
      const cur = await cloud.database
        .from('support_conversations')
        .select('unread_for_customer, unread_for_staff')
        .eq('id', conversationId)
        .maybeSingle()
      const row = unwrap(cur, '') || {}
      current = Number(row[incField] || 0)
    } catch (e) {
      current = 0
    }
    await cloud.database
      .from('support_conversations')
      .update({
        last_message: text.slice(0, 80),
        last_message_at: now,
        updated_at: now,
        [incField]: current + 1
      })
      .eq('id', conversationId)
      .catch(() => null)

    return message
  }

  /** 标记会话已读 */
  async function markSupportRead(conversationId, role) {
    if (!conversationId) return
    const field = role === 'staff' ? 'unread_for_staff' : 'unread_for_customer'
    try {
      await cloud.database.from('support_conversations').update({ [field]: 0 }).eq('id', conversationId)
    } catch (e) {
      // 忽略
    }
  }

  /** 关闭会话 */
  async function closeSupportConversation(conversationId) {
    const res = await cloud.database
      .from('support_conversations')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select()
    const rows = unwrap(res, '关闭会话失败')
    return rows && rows[0]
  }

  /** 客服接单 */
  async function assignSupportConversation(conversationId, staffName) {
    const uid = await currentUid()
    const res = await cloud.database
      .from('support_conversations')
      .update({
        assigned_to: uid,
        assigned_to_name: staffName || '平台客服',
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select()
    const rows = unwrap(res, '接单失败')
    return rows && rows[0]
  }

  /** 客服工作台统计 */
  async function supportStats() {
    const rows = await listSupportConversations()
    return {
      total: rows.length,
      open: rows.filter((r) => r.status === 'open').length,
      closed: rows.filter((r) => r.status === 'closed').length,
      unread: rows.reduce((sum, r) => sum + Number(r.unread_for_staff || 0), 0)
    }
  }

  return {
    // 工具
    yuan, yuanShort, coverTheme, ORDER_STATUS, STATUS_TEXT, FLOW_TEXT, fromNow, esc, friendlyError,
    // 会话
    getSession, sendPhoneCode, verifyPhoneCode, wechatLoginUrl, handleWechatCallback, signOut,
    // 业务
    listCategories, listBanners, getSettings,
    listServices, getService, getProvider, listProviders,
    getMyProvider, becomeProvider, claimProvider, publishService, updateService, listMyServices,
    createOrder, listOrders, listOpenOrders, getOrder, advanceOrder, takeOrder,
    listReviews, getReviewByOrder, createReview,
    listNotifications, countUnread, markNotificationRead, markAllNotificationsRead, isStaff, claimAdminInvite, checkAdminInvite, adminStats, adminListOrders,
    // 宣传样片
    listSamples, listProviderSamples, createSample, updateSample, deleteSample,
    // 管理端扩展
    listApplications, reviewApplication,
    listProvidersAdmin, setProviderVerified,
    adminUpdateOrderStatus,
    updateBanner, createBanner, deleteBanner, updateCategory, updateSettings,
    listSettlements, generateSettlements, paySettlement,
    listAdminActions,
    // 人工客服
    createSupportConversation, listMySupportConversations, listSupportConversations,
    getSupportConversation, sendSupportMessage, markSupportRead,
    closeSupportConversation, assignSupportConversation, supportStats,
    // 会员包月
    listMemberPlans, listMemberSubscriptions, listMemberPaymentOrders,
    listProviderDeposits, memberStats, activateMemberSubscription,
    refundMemberDeposit, cancelMemberSubscription,
    getMyMemberStatus, createMemberOrder, listMyMemberOrders, getMyMemberDeposit,
    // 佣金
    getProviderCommission,
    // 用户资料
    getMyProfile, saveMyProfile, profileCompleteness, profileMissing, uploadAvatar
  }
})()
