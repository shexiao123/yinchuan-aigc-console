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
    if (/MISSING_CREDENTIALS|Credentials missing/i.test(msg)) {
      return '登录状态已失效，请重新登录后再上传视频'
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

  /**
   * 图片标签：加载失败时自动换成占位块，不显示浏览器默认的裂图图标
   *
   * 用法：<img ${API.imgAttrs(url, 'cat-img')} />
   * onerror 里给父级加 .img-fallback 类，CSS 负责画兜底底色。
   */
  function imgAttrs(url, className) {
    if (!url) return `class="${className} img-missing"`
    return `class="${className}" src="${esc(url)}" onerror="this.classList.add('img-missing');this.removeAttribute('src')"`
  }

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
   * 本站静态资源 URL → 相对路径
   *
   * 为什么：数据库里存的是绝对地址（小程序端要用），但网页端用绝对地址会有两个坑：
   *   1. 站点静态资源要鉴权，绝对地址不带 sharecode 会 403（图片裂掉）
   *   2. CDN 缓存了旧版 HTML 时，绝对地址跟着旧版走
   * 转成相对路径后由浏览器按当前页面解析，永远同源、永远带对参数。
   *
   * 云存储地址（不是本站域名的）保持原样，走签名流程。
   */
  function toRelativeAsset(url) {
    if (!url) return ''
    const s = String(url)
    // 保留 query（sharecode 等）
    const q = s.indexOf('?')
    let query = q >= 0 ? s.slice(q) : ''
    const pathname = q >= 0 ? s.slice(0, q) : s
    // 本地封面图换版后统一刷新缓存版本号（只动站内静态图，不动云存储签名地址）
    if (/(?:covers\/|l-hero|l-cat-|l-mini-)/i.test(pathname) && /^\?v=/i.test(query)) {
      query = '?v=20261105c'
    }
    if (!/^https?:\/\//i.test(s)) return pathname.replace(/^\//, '') + query
    // 本站域名 → 相对当前目录的路径。
    // 不带前导斜杠：GitHub Pages 部署在 /yinchuan-aigc-console/ 子路径下，
    // 绝对路径 /assets/... 会指到域名根导致 404；相对路径在根路径站点同样成立。
    if (/^https?:\/\/(guangying-web|meige-prototype)\.app\.workbuddy\.host/i.test(pathname)) {
      return pathname.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '') + query
    }
    // 其它域名（云存储等）保持原样
    return s
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
        if (String(c.image_url).startsWith('http')) {
          return { ...c, imageUrl: toRelativeAsset(c.image_url) }
        }
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
        if (String(b.image_url).startsWith('http')) return { ...b, imageUrl: toRelativeAsset(b.image_url) }
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
        if (String(s.cover_url).startsWith('http')) return { ...s, coverUrl: toRelativeAsset(s.cover_url) }
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

  /**
   * 新增服务分类（管理端）。
   * slug 必须唯一且与英文短横线命名一致；sort_order 不填则排到末尾。
   */
  async function createCategory(payload) {
    const slug = String(payload.slug || '').trim()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error('分类标识只能用小写字母、数字和短横线，例如 comic-drama')
    }
    const exists = await cloud.database.from('categories').select('id').eq('slug', slug)
    if ((unwrap(exists, '校验分类失败') || []).length) throw new Error('该分类标识已存在')

    let sortOrder = Number(payload.sort_order)
    if (!Number.isFinite(sortOrder) || sortOrder <= 0) {
      const all = await cloud.database.from('categories').select('sort_order').order('sort_order', { ascending: false })
      const rows = unwrap(all, '读取分类失败') || []
      sortOrder = (Number(rows[0] && rows[0].sort_order) || 0) + 1
    }
    const res = await cloud.database.from('categories').insert({
      name: String(payload.name || '').trim(),
      slug,
      icon: String(payload.icon || '🎬').trim() || '🎬',
      description: String(payload.description || '').trim(),
      image_url: String(payload.image_url || '').trim(),
      sort_order: sortOrder
    }).select()
    const rows = unwrap(res, '新增分类失败')
    if (!rows || rows.length === 0) throw new Error('新增分类失败')
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

  /* ---------------- 群聊 ---------------- */

  /** 群列表，附带实时成员数与最新一条消息（不依赖缓存字段，避免普通成员无写权限） */
  async function listChatGroups() {
    const res = await cloud.database
      .from('chat_groups')
      .select('*')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .limit(50)
    const groups = unwrap(res, '群聊加载失败') || []
    if (!groups.length) return []
    const ids = groups.map((g) => g.id)
    const [memRes, msgRes] = await Promise.all([
      cloud.database.from('chat_group_members').select('group_id').in('group_id', ids).limit(1000),
      cloud.database
        .from('chat_messages')
        .select('group_id, content, created_at, sender_name')
        .in('group_id', ids)
        .eq('status', 'normal')
        .order('id', { ascending: false })
        .limit(300)
    ])
    const members = unwrap(memRes, '') || []
    const msgs = unwrap(msgRes, '') || []
    const memberMap = {}
    members.forEach((m) => {
      memberMap[m.group_id] = (memberMap[m.group_id] || 0) + 1
    })
    const lastMap = {}
    msgs.forEach((m) => {
      if (!lastMap[m.group_id]) lastMap[m.group_id] = m
    })
    return groups.map((g) => ({
      ...g,
      live_member_count: memberMap[g.id] || 0,
      last: lastMap[g.id] || null
    }))
  }

  /** 单个群详情 */
  async function getChatGroup(groupId) {
    if (!groupId) return null
    const res = await cloud.database
      .from('chat_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()
    return unwrap(res, '群聊不存在') || null
  }

  /**
   * 建群。owner_id 由数据库 DEFAULT auth.uid() 填充，前端不传，避免伪造身份被 RLS 拒绝。
   */
  async function createChatGroup(payload) {
    const uid = await currentUid()
    if (!uid) throw new Error('请先登录后再创建群聊')
    const name = String((payload && payload.name) || '').trim()
    if (!name) throw new Error('群名称不能为空')
    if (name.length > 30) throw new Error('群名称不能超过 30 字')
    const session = await getSession()
    const u = (session && session.user) || {}
    const slug = String((payload && payload.slug) || '').trim() ||
      ('g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6))
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error('群标识只能用小写字母、数字和连字符')
    const res = await cloud.database
      .from('chat_groups')
      .insert({
        name,
        slug,
        icon: String((payload && payload.icon) || '💬').slice(0, 8),
        description: String((payload && payload.description) || '').trim().slice(0, 200),
        category_slug: String((payload && payload.category_slug) || '').trim(),
        owner_name: u.name || u.nickname || '群主',
        visibility: 'public',
        status: 'active'
      })
      .select()
    const rows = unwrap(res, '创建群聊失败')
    const group = rows && rows[0]
    if (group) {
      await joinChatGroup(group.id).catch(() => null)
      await sendChatMessage(group.id, `群「${name}」已创建，欢迎大家发言。`, 'system').catch(() => null)
    }
    return group
  }

  /** 加入群（幂等；并发重复插入忽略唯一键冲突） */
  async function joinChatGroup(groupId) {
    const uid = await currentUid()
    if (!uid || !groupId) return null
    const existingRes = await cloud.database
      .from('chat_group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', uid)
      .maybeSingle()
    const existing = unwrap(existingRes, '')
    if (existing) return existing
    const session = await getSession()
    const u = (session && session.user) || {}
    try {
      const res = await cloud.database
        .from('chat_group_members')
        .insert({
          group_id: groupId,
          user_name: u.name || u.nickname || '群成员',
          user_avatar: u.avatarUrl || ''
        })
        .select()
      const rows = unwrap(res, '')
      return (rows && rows[0]) || null
    } catch (e) {
      // 23505: 同一瞬间重复加入，视为已加入
      return null
    }
  }

  /** 我是否已加入某群 */
  async function isChatMember(groupId) {
    const uid = await currentUid()
    if (!uid || !groupId) return false
    const res = await cloud.database
      .from('chat_group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', uid)
      .maybeSingle()
    return !!unwrap(res, '')
  }

  /** 群成员列表 */
  async function listChatGroupMembers(groupId) {
    if (!groupId) return []
    const res = await cloud.database
      .from('chat_group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('id', { ascending: true })
      .limit(200)
    return unwrap(res, '成员加载失败') || []
  }

  /** 群消息（最近 N 条，按时间升序返回；轮询用同一个方法） */
  async function listChatMessages(groupId, limit) {
    if (!groupId) return []
    const res = await cloud.database
      .from('chat_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('id', { ascending: false })
      .limit(limit || 60)
    const rows = unwrap(res, '消息加载失败') || []
    return rows.reverse()
  }

  /** 发消息（自动确保已入群；sender_id 由数据库填充） */
  async function sendChatMessage(groupId, content, senderRole) {
    const uid = await currentUid()
    if (!uid) throw new Error('请先登录后再发言')
    const text = String(content || '').trim()
    if (!text) throw new Error('消息不能为空')
    if (text.length > 1000) throw new Error('单条消息不能超过 1000 字')
    if (senderRole !== 'system') await joinChatGroup(groupId).catch(() => null)
    const session = await getSession()
    const u = (session && session.user) || {}
    const res = await cloud.database
      .from('chat_messages')
      .insert({
        group_id: groupId,
        sender_name: senderRole === 'system' ? '平台助手' : (u.name || u.nickname || '群成员'),
        sender_avatar: senderRole === 'system' ? '' : (u.avatarUrl || ''),
        sender_role: senderRole || 'member',
        content: text,
        message_type: 'text',
        status: 'normal'
      })
      .select()
    const rows = unwrap(res, '发送失败')
    return (rows && rows[0]) || null
  }

  /** 标记已读时间 */
  async function markChatRead(groupId) {
    const uid = await currentUid()
    if (!uid || !groupId) return
    try {
      await cloud.database
        .from('chat_group_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('user_id', uid)
    } catch (e) {
      // 忽略
    }
  }

  /* ---- 管理端群聊 ---- */

  /** 管理端：全部群（含已停用，staff 可见） */
  async function adminListChatGroups() {
    const res = await cloud.database.from('chat_groups').select('*').order('id', { ascending: true }).limit(200)
    return unwrap(res, '群聊加载失败') || []
  }

  /** 管理端：群消息（含被隐藏的，staff 可见） */
  async function adminListChatMessages(groupId) {
    if (!groupId) return []
    const res = await cloud.database
      .from('chat_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('id', { ascending: false })
      .limit(100)
    return (unwrap(res, '') || []).reverse()
  }

  /** 管理端：隐藏 / 恢复消息 */
  async function setChatMessageStatus(messageId, status) {
    const res = await cloud.database
      .from('chat_messages')
      .update({ status: status === 'normal' ? 'normal' : 'hidden' })
      .eq('id', messageId)
      .select()
    const rows = unwrap(res, '操作失败')
    return rows && rows[0]
  }

  /** 管理端：启用 / 停用群 */
  async function setChatGroupStatus(groupId, status) {
    const res = await cloud.database
      .from('chat_groups')
      .update({ status: status === 'active' ? 'active' : 'archived', updated_at: new Date().toISOString() })
      .eq('id', groupId)
      .select()
    const rows = unwrap(res, '操作失败')
    return rows && rows[0]
  }

  /** 管理端：群聊统计 */
  async function chatStats() {
    const [gRes, mMsgRes, mMemRes] = await Promise.all([
      cloud.database.from('chat_groups').select('id, status').limit(500),
      cloud.database.from('chat_messages').select('id, created_at').order('id', { ascending: false }).limit(500),
      cloud.database.from('chat_group_members').select('id').limit(1000)
    ])
    const groups = unwrap(gRes, '') || []
    const msgs = unwrap(mMsgRes, '') || []
    const members = unwrap(mMemRes, '') || []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return {
      groups: groups.length,
      active: groups.filter((g) => g.status === 'active').length,
      messages: msgs.length,
      today: msgs.filter((m) => new Date(m.created_at) >= today).length,
      members: members.length
    }
  }

  /* ---------------- 企业商家 · 店铺 / 任务 ---------------- */

  const MAX_TASK_VIDEO_MB = 100

  /** 媒体路径 → 可播放地址：http/站点静态资源直接用，云存储路径换签名链接 */
  async function resolveMedia(path) {
    const p = String(path || '')
    if (!p) return ''
    if (/^https?:\/\//i.test(p) || p.startsWith('assets/') || p.startsWith('/')) return p
    try {
      const res = await window.cloud.storage.createSignedUrl(p, 7200)
      if (res && res.error) return ''
      const d = res && res.data
      return (d && (d.url || d.signedUrl)) || (typeof d === 'string' ? d : '')
    } catch (e) {
      return ''
    }
  }

  function merchantInitial(name) {
    return String(name || '商').trim().charAt(0) || '商'
  }

  /** 公开店铺列表，附在招任务数 */
  async function listMerchants() {
    const res = await cloud.database
      .from('merchants')
      .select('*')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .limit(100)
    const shops = unwrap(res, '商家加载失败') || []
    const tRes = await cloud.database.from('merchant_tasks').select('merchant_id, status').limit(500)
    const tasks = unwrap(tRes, '') || []
    const counts = {}
    tasks.forEach((t) => {
      if (t.status !== 'open') return
      counts[t.merchant_id] = (counts[t.merchant_id] || 0) + 1
    })
    return shops.map((m) => ({ ...m, initial: merchantInitial(m.name), open_task_count: counts[m.id] || 0 }))
  }

  async function getMerchant(id) {
    if (!id) return null
    const res = await cloud.database.from('merchants').select('*').eq('id', id).maybeSingle()
    const m = unwrap(res, '') || null
    return m ? { ...m, initial: merchantInitial(m.name), logoUrl: m.logo_path ? await resolveMedia(m.logo_path) : '', coverUrl: m.cover_path ? await resolveMedia(m.cover_path) : '' } : null
  }

  /** 当前登录用户的店铺（一人一店，没开返回 null） */
  async function getMyMerchant() {
    const uid = await currentUid()
    if (!uid) return null
    const res = await cloud.database.from('merchants').select('*').eq('owner_id', uid).maybeSingle()
    const m = unwrap(res, '') || null
    return m ? { ...m, initial: merchantInitial(m.name) } : null
  }

  /** 开通 / 编辑自己的店铺。owner_id 不传，由服务端会话决定，避免伪造身份 */
  async function saveMerchant(payload) {
    const uid = await currentUid()
    if (!uid) throw new Error('请先登录后再开通店铺')
    const p = payload || {}
    const name = String(p.name || '').trim()
    if (name.length < 2) throw new Error('店铺名称至少 2 个字')
    if (name.length > 40) throw new Error('店铺名称不能超过 40 字')
    const row = {
      name,
      category_slug: String(p.category_slug || '').trim(),
      city: String(p.city || '').trim().slice(0, 20),
      intro: String(p.intro || '').trim().slice(0, 500),
      contact_name: String(p.contact_name || '').trim().slice(0, 20),
      contact_phone: String(p.contact_phone || '').trim().slice(0, 30),
      logo_path: String(p.logo_path || '').trim(),
      cover_path: String(p.cover_path || '').trim(),
      updated_at: new Date().toISOString()
    }
    if (p.id) {
      const res = await cloud.database.from('merchants').update(row).eq('id', p.id).eq('owner_id', uid).select()
      const rows = unwrap(res, '保存店铺失败')
      if (!rows || !rows.length) throw new Error('保存失败，店铺不存在或不属于你')
      return rows[0]
    }
    const slug = 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
    // 新店铺一律「待缴费」：由管理员确认收款后才会激活，前端传 active 也会被数据库触发器拦下
    const res = await cloud.database.from('merchants').insert({ ...row, owner_id: uid, slug, status: 'pending_payment' }).select()
    const rows = unwrap(res, '提交店铺资料失败')
    if (!rows || !rows.length) throw new Error('提交店铺资料失败，请确认登录状态')
    return rows[0]
  }

  /** 任务列表：公开只看 open；商家后台可看自己全部 */
  async function listMerchantTasks(opts) {
    const o = opts || {}
    let q = cloud.database.from('merchant_tasks').select('*')
    if (o.merchantId) q = q.eq('merchant_id', o.merchantId)
    if (o.status) q = q.eq('status', o.status)
    const res = await q.order('created_at', { ascending: false }).limit(o.limit || 100)
    let rows = unwrap(res, '任务加载失败') || []
    if (o.publicOnly) rows = rows.filter((t) => t.status === 'open')
    if (!rows.length) return []
    const mRes = await cloud.database.from('merchants').select('id, name, slug, city, is_verified, status, logo_path').limit(200)
    const map = {}
    ;(unwrap(mRes, '') || []).forEach((m) => { map[m.id] = m })
    return rows.map((t) => ({ ...t, merchant: map[t.merchant_id] || null }))
  }

  async function getMerchantTask(id) {
    if (!id) return null
    const res = await cloud.database.from('merchant_tasks').select('*').eq('id', id).maybeSingle()
    const t = unwrap(res, '') || null
    if (!t) return null
    const merchant = await getMerchant(t.merchant_id)
    const videoUrl = t.reference_video_path ? await resolveMedia(t.reference_video_path) : ''
    return { ...t, merchant, videoUrl }
  }

  /** 上传参考视频到云存储，返回路径与文件信息；不负责写库 */
  async function uploadTaskVideo(file, uid, maxMb) {
    if (!file) return null
    const limitMb = Math.max(1, Number(maxMb) || MAX_TASK_VIDEO_MB)
    if (file.size > limitMb * 1024 * 1024) {
      throw new Error(`当前套餐参考视频上限 ${limitMb}MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB），可升级入驻套餐`)
    }
    const ext = String(file.name || '').toLowerCase().split('.').pop()
    const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'mp4'
    const path = `shared/${uid || 'platform'}/merchant-tasks/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`
    const res = await window.cloud.storage.upload(path, file, {
      contentType: file.type || 'video/mp4',
      cacheControl: '3600',
      upsert: false,
      metadata: { purpose: 'merchant_task_reference' }
    })
    if (res && res.error) throw new Error(res.error.message || '视频上传失败')
    return { path, name: file.name || '参考视频.mp4', size: file.size || 0 }
  }

  /**
   * 发布 / 编辑任务。参考视频支持三种来源：
   * ① 本地文件（走云存储）② 粘贴 http 视频链接 ③ 不传（无参考视频）
   */
  async function saveMerchantTask(payload) {
    const uid = await currentUid()
    if (!uid) throw new Error('请先登录后再发布任务')
    const shop = await getMyMerchant()
    if (!shop) throw new Error('请先开通店铺，再发布任务')
    const pay = merchantPaidInfo(shop)
    if (!pay.paid) throw new Error('店铺尚未完成入驻缴费，请先在工作台完成付款并等待平台确认')
    const p = payload || {}
    const title = String(p.title || '').trim()
    if (title.length < 4) throw new Error('任务标题至少 4 个字')
    if (title.length > 80) throw new Error('任务标题不能超过 80 字')
    if (!p.id && pay.taskLimit > 0) {
      const tRes = await cloud.database.from('merchant_tasks').select('id').eq('merchant_id', shop.id).limit(500)
      const count = (unwrap(tRes, '') || []).length
      if (count >= pay.taskLimit) throw new Error(`当前套餐每年最多发布 ${pay.taskLimit} 个任务，请升级套餐后再发布`)
    }

    let videoPath = String(p.reference_video_path || '').trim()
    let videoName = String(p.reference_video_name || '').trim()
    let videoSize = Number(p.reference_video_size) || 0
    if (p.videoFile) {
      const up = await uploadTaskVideo(p.videoFile, uid, shop.video_limit_mb)
      if (up) { videoPath = up.path; videoName = up.name; videoSize = up.size }
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
    if (p.id) {
      const res = await cloud.database.from('merchant_tasks').update(row).eq('id', p.id).eq('owner_id', uid).select()
      const rows = unwrap(res, '保存任务失败')
      if (!rows || !rows.length) throw new Error('保存失败，任务不存在或不属于你')
      return rows[0]
    }
    const res = await cloud.database
      .from('merchant_tasks')
      .insert({ ...row, merchant_id: shop.id, owner_id: uid, status: 'open' })
      .select()
    const rows = unwrap(res, '发布任务失败')
    if (!rows || !rows.length) throw new Error('发布失败，请确认登录状态')
    return rows[0]
  }

  async function setMerchantTaskStatus(id, status) {
    const res = await cloud.database
      .from('merchant_tasks')
      .update({ status: status === 'open' ? 'open' : status === 'hidden' ? 'hidden' : 'closed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，任务不存在或不属于你')
    return rows[0]
  }

  async function deleteMerchantTask(id) {
    const res = await cloud.database.from('merchant_tasks').delete().eq('id', id).select()
    const rows = unwrap(res, '删除失败')
    if (!rows || !rows.length) throw new Error('删除失败，任务不存在或不属于你')
    return rows[0]
  }

  /** 服务者报名接任务（一人一任务只能报一次） */
  async function applyMerchantTask(taskId, message) {
    const uid = await currentUid()
    if (!uid) throw new Error('请先登录后再报名')
    const session = await getSession()
    const u = (session && session.user) || {}
    const res = await cloud.database
      .from('merchant_task_applications')
      .insert({
        task_id: taskId,
        applicant_id: uid,
        applicant_name: u.name || u.nickname || '服务者',
        message: String(message || '').trim().slice(0, 500),
        status: 'pending'
      })
      .select()
    const rows = unwrap(res, '报名失败')
    if (!rows || !rows.length) throw new Error('报名失败，请确认登录状态')
    return rows[0]
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
    return unwrap(res, '') || []
  }

  /** 商家查看自己任务收到的报名（RLS 只放行自己任务的报名） */
  async function listMerchantApplications() {
    const res = await cloud.database
      .from('merchant_task_applications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
    const apps = unwrap(res, '') || []
    if (!apps.length) return []
    const ids = [...new Set(apps.map((a) => a.task_id))]
    const tRes = await cloud.database.from('merchant_tasks').select('id, title, owner_id').in('id', ids).limit(300)
    const map = {}
    ;(unwrap(tRes, '') || []).forEach((t) => { map[t.id] = t })
    return apps.map((a) => ({ ...a, task: map[a.task_id] || null }))
  }

  async function setApplicationStatus(id, status) {
    const next = status === 'selected' ? 'selected' : status === 'rejected' ? 'rejected' : 'pending'
    const res = await cloud.database
      .from('merchant_task_applications')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，没有管理权限')
    return rows[0]
  }

  /* ---- 管理端：商家与任务审核 ---- */

  async function adminListMerchants() {
    const res = await cloud.database.from('merchants').select('*').order('id', { ascending: true }).limit(200)
    return unwrap(res, '商家加载失败') || []
  }

  async function adminListMerchantTasks() {
    const res = await cloud.database.from('merchant_tasks').select('*').order('id', { ascending: false }).limit(300)
    return unwrap(res, '任务加载失败') || []
  }

  async function setMerchantStatus(id, status) {
    const res = await cloud.database
      .from('merchants')
      .update({ status: status === 'active' ? 'active' : 'suspended', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，没有管理权限')
    return rows[0]
  }

  async function setMerchantVerified(id, verified) {
    const res = await cloud.database
      .from('merchants')
      .update({ is_verified: !!verified, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，没有管理权限')
    return rows[0]
  }

  async function merchantStats() {
    const [mRes, tRes, aRes] = await Promise.all([
      cloud.database.from('merchants').select('id, status').limit(500),
      cloud.database.from('merchant_tasks').select('id, status').limit(500),
      cloud.database.from('merchant_task_applications').select('id, status').limit(500)
    ])
    const m = unwrap(mRes, '') || []
    const t = unwrap(tRes, '') || []
    const a = unwrap(aRes, '') || []
    return {
      merchants: m.length,
      active: m.filter((x) => x.status === 'active').length,
      tasks: t.length,
      open: t.filter((x) => x.status === 'open').length,
      applications: a.length,
      selected: a.filter((x) => x.status === 'selected').length
    }
  }

  /* ---------------- 企业商家 · 付费入驻 ---------------- */

  const ENROLL_STATUS_TEXT = {
    pending: '待审核', paid: '已收款', rejected: '已驳回', cancelled: '已取消'
  }

  /** 店铺是否处于有效缴费期。前端展示与发布任务校验共用同一判断 */
  function merchantPaidInfo(shop) {
    const s = shop || {}
    const until = s.paid_until ? new Date(s.paid_until).getTime() : 0
    const paid = s.payment_status === 'paid' && until > Date.now()
    return {
      paid,
      expired: s.payment_status === 'paid' && until > 0 && until <= Date.now(),
      status: s.payment_status || 'unpaid',
      paidUntil: s.paid_until || '',
      daysLeft: paid ? Math.ceil((until - Date.now()) / 86400000) : 0,
      planCode: s.plan_code || '',
      taskLimit: Number(s.task_limit) || 0
    }
  }

  /** 入驻套餐（公开可见仅 status='on'；管理端可取下架套餐） */
  async function listMerchantPlans(includeOff) {
    let q = cloud.database.from('merchant_plans').select('*')
    if (!includeOff) q = q.eq('status', 'on')
    const res = await q.order('sort_order', { ascending: true }).limit(50)
    return (unwrap(res, '入驻套餐加载失败') || []).map((p) => ({
      ...p,
      totalCents: Number(p.price_cents || 0) + Number(p.deposit_cents || 0) + Number(p.onboarding_fee_cents || 0),
      benefits: Array.isArray(p.benefits) ? p.benefits : [],
      totalText: '¥' + ((Number(p.price_cents || 0) + Number(p.deposit_cents || 0) + Number(p.onboarding_fee_cents || 0)) / 100).toLocaleString('zh-CN')
    }))
  }

  /** 对公收款信息，管理端可维护 */
  async function getMerchantPayConfig() {
    const res = await cloud.database
      .from('platform_settings')
      .select('merchant_enroll_enabled,merchant_pay_name,merchant_pay_bank,merchant_pay_account,merchant_pay_note')
      .eq('id', 1)
      .maybeSingle()
    const s = unwrap(res, '') || {}
    return {
      enabled: s.merchant_enroll_enabled !== false,
      payName: s.merchant_pay_name || '',
      payBank: s.merchant_pay_bank || '',
      payAccount: s.merchant_pay_account || '',
      payNote: s.merchant_pay_note || ''
    }
  }

  async function adminSaveMerchantPayConfig(cfg) {
    const c = cfg || {}
    const res = await cloud.database.from('platform_settings').update({
      merchant_enroll_enabled: c.enabled !== false,
      merchant_pay_name: String(c.payName || '').trim().slice(0, 80),
      merchant_pay_bank: String(c.payBank || '').trim().slice(0, 120),
      merchant_pay_account: String(c.payAccount || '').trim().slice(0, 120),
      merchant_pay_note: String(c.payNote || '').trim().slice(0, 300),
      updated_at: new Date().toISOString()
    }).eq('id', 1).select()
    const rows = unwrap(res, '收款信息保存失败')
    if (!rows || !rows.length) throw new Error('保存失败，请确认管理员权限')
    return rows[0]
  }

  async function listMyEnrollOrders() {
    const res = await cloud.database
      .from('merchant_enroll_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    return unwrap(res, '') || []
  }

  /**
   * 生成入驻缴费订单。
   * 金额/套餐名/周期一律由数据库触发器按套餐表回写，前端传的金额不参与定价。
   */
  async function createMerchantEnrollOrder(planId, merchantId, remark) {
    const uid = await currentUid()
    if (!uid) throw new Error('请先登录后再提交入驻申请')
    if (!merchantId) throw new Error('请先填写店铺资料')
    if (!planId) throw new Error('请选择入驻套餐')
    const mine = await listMyEnrollOrders()
    const pending = mine.filter((o) => o.status === 'pending' && String(o.merchant_id) === String(merchantId))[0]
    if (pending) return pending
    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const orderNo = `ME${ymd}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const res = await cloud.database.from('merchant_enroll_orders').insert({
      order_no: orderNo,
      owner_id: uid,
      merchant_id: Number(merchantId),
      plan_id: Number(planId),
      plan_code: '',
      plan_name: '',
      amount_cents: 0,
      period_days: 365,
      status: 'pending',
      remark: String(remark || '').trim().slice(0, 200)
    }).select()
    const rows = unwrap(res, '创建入驻订单失败')
    if (!rows || !rows.length) throw new Error('创建入驻订单失败')
    return rows[0]
  }

  /**
   * 更换套餐：待审核订单直接改 plan_id，由数据库触发器按新套餐重算金额；
   * 已驳回 / 已关闭的订单则重新生成，避免留下多笔待审订单。
   */
  async function changeMerchantEnrollPlan(orderId, planId, merchantId) {
    if (!orderId) return createMerchantEnrollOrder(planId, merchantId)
    const cur = await cloud.database.from('merchant_enroll_orders').select('id,status').eq('id', orderId).maybeSingle()
    const o = unwrap(cur, '')
    if (!o || o.status !== 'pending') return createMerchantEnrollOrder(planId, merchantId)
    const res = await cloud.database.from('merchant_enroll_orders')
      .update({ plan_id: Number(planId), updated_at: new Date().toISOString() })
      .eq('id', orderId).eq('status', 'pending').select()
    const rows = unwrap(res, '更换套餐失败')
    if (!rows || !rows.length) throw new Error('更换套餐失败，订单可能已被审核')
    return rows[0]
  }

  /** 上传付款凭证（可选，失败时仍可只填流水号） */
  async function uploadEnrollProof(file) {
    if (!file) return ''
    if (file.size > 8 * 1024 * 1024) throw new Error('凭证图片不能超过 8MB')
    const uid = await currentUid()
    const ext = String(file.name || '').toLowerCase().split('.').pop()
    const safeExt = /^(jpg|jpeg|png|webp|pdf)$/.test(ext) ? ext : 'png'
    const path = `shared/${uid || 'platform'}/merchant-enroll/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    const res = await window.cloud.storage.upload(path, file, {
      contentType: file.type || 'image/png',
      cacheControl: '3600',
      upsert: false,
      metadata: { purpose: 'merchant_enroll_proof' }
    })
    if (res && res.error) throw new Error(res.error.message || '凭证上传失败')
    return path
  }

  async function submitEnrollPayment(orderId, payload) {
    const p = payload || {}
    const res = await cloud.database.from('merchant_enroll_orders').update({
      transaction_id: String(p.transactionId || '').trim().slice(0, 80),
      payment_proof_path: String(p.proofPath || '').trim(),
      remark: String(p.remark || '').trim().slice(0, 200),
      updated_at: new Date().toISOString()
    }).eq('id', orderId).eq('status', 'pending').select()
    const rows = unwrap(res, '提交付款信息失败')
    if (!rows || !rows.length) throw new Error('提交失败，订单可能已被审核')
    return rows[0]
  }

  async function adminListEnrollOrders(status) {
    let q = cloud.database.from('merchant_enroll_orders').select('*')
    if (status && status !== 'all') q = q.eq('status', status)
    const res = await q.order('created_at', { ascending: false }).limit(200)
    return unwrap(res, '缴费订单加载失败') || []
  }

  async function adminSaveMerchantPlan(p) {
    const plan = p || {}
    const row = {
      code: String(plan.code || '').trim().slice(0, 30),
      name: String(plan.name || '').trim().slice(0, 40),
      subtitle: String(plan.subtitle || '').trim().slice(0, 80),
      price_cents: Math.max(0, Math.round(Number(plan.price_cents) || 0)),
      deposit_cents: Math.max(0, Math.round(Number(plan.deposit_cents) || 0)),
      onboarding_fee_cents: Math.max(0, Math.round(Number(plan.onboarding_fee_cents) || 0)),
      period_days: Math.max(1, Math.round(Number(plan.period_days) || 365)),
      max_tasks: Math.max(0, Math.round(Number(plan.max_tasks) || 0)),
      max_video_mb: Math.max(1, Math.round(Number(plan.max_video_mb) || 100)),
      priority_level: Math.max(0, Math.round(Number(plan.priority_level) || 0)),
      benefits: Array.isArray(plan.benefits) ? plan.benefits.slice(0, 12) : String(plan.benefits || '').split(/[,\n，]/).map((x) => x.trim()).filter(Boolean).slice(0, 12),
      description: String(plan.description || '').trim().slice(0, 300),
      sort_order: Math.max(0, Math.round(Number(plan.sort_order) || 0)),
      status: plan.status === 'off' ? 'off' : 'on'
    }
    if (!row.code || !row.name) throw new Error('套餐编码与名称不能为空')
    const res = plan.id
      ? await cloud.database.from('merchant_plans').update(row).eq('id', plan.id).select()
      : await cloud.database.from('merchant_plans').insert(row).select()
    const rows = unwrap(res, '套餐保存失败')
    if (!rows || !rows.length) throw new Error('保存失败，请确认管理员权限')
    return rows[0]
  }

  /**
   * 审核入驻缴费：先激活店铺、再把订单置为已收款。
   * 顺序保证「店铺已开通但订单仍待审」时可安全重试，不会重复叠加有效期。
   */
  async function adminReviewEnrollOrder(orderId, approve, note, transactionId) {
    const uid = await currentUid()
    if (!uid || !(await isStaff(uid))) throw new Error('没有管理权限')
    const oRes = await cloud.database.from('merchant_enroll_orders').select('*').eq('id', orderId).maybeSingle()
    const o = unwrap(oRes, '')
    if (!o) throw new Error('订单不存在')
    if (o.status === 'paid') throw new Error('该订单已确认收款')
    if (o.status === 'rejected' || o.status === 'cancelled') throw new Error('该订单已关闭')
    const now = new Date().toISOString()
    const reviewRow = {
      review_note: String(note || '').trim().slice(0, 200),
      reviewed_by: uid,
      reviewed_at: now,
      updated_at: now
    }
    if (!approve) {
      const res = await cloud.database.from('merchant_enroll_orders')
        .update({ ...reviewRow, status: 'rejected' }).eq('id', o.id).select()
      const rows = unwrap(res, '驳回失败')
      if (!rows || !rows.length) throw new Error('驳回失败')
      return rows[0]
    }
    const [planRes, shopRes] = await Promise.all([
      cloud.database.from('merchant_plans').select('*').eq('id', o.plan_id).maybeSingle(),
      cloud.database.from('merchants').select('*').eq('id', o.merchant_id).maybeSingle()
    ])
    const plan = unwrap(planRes, '')
    const shop = unwrap(shopRes, '')
    if (!plan) throw new Error('关联套餐不存在，无法开通')
    if (!shop) throw new Error('关联店铺不存在，无法开通')
    const days = Number(o.period_days || plan.period_days || 365)
    const baseUntil = shop.paid_until ? new Date(shop.paid_until).getTime() : 0
    const base = shop.payment_status === 'paid' && baseUntil > Date.now() ? baseUntil : Date.now()
    const paidUntil = new Date(base + days * 86400000).toISOString()
    const amount = Number(plan.price_cents || 0) + Number(plan.deposit_cents || 0) + Number(plan.onboarding_fee_cents || 0)
    const sRes = await cloud.database.from('merchants').update({
      status: 'active',
      payment_status: 'paid',
      paid_until: paidUntil,
      paid_at: now,
      plan_id: plan.id,
      plan_code: plan.code,
      task_limit: Number(plan.max_tasks) || 0,
      video_limit_mb: Number(plan.max_video_mb) || 100,
      enroll_order_id: o.id,
      is_verified: Number(plan.priority_level) > 0 ? true : !!shop.is_verified,
      updated_at: now
    }).eq('id', shop.id).select()
    const shopRows = unwrap(sRes, '开通店铺失败')
    if (!shopRows || !shopRows.length) throw new Error('开通店铺失败，请确认管理员权限')
    const res = await cloud.database.from('merchant_enroll_orders').update({
      ...reviewRow,
      status: 'paid',
      amount_cents: amount,
      pay_method: 'bank_transfer',
      transaction_id: String(transactionId || o.transaction_id || '').slice(0, 80),
      paid_at: now
    }).eq('id', o.id).select()
    const rows = unwrap(res, '订单状态更新失败')
    if (!rows || !rows.length) throw new Error('店铺已开通，但订单状态未更新，请重试一次确认')
    return rows[0]
  }

  /** 管理员线下收款后手动开通 / 手动停用（不经过缴费订单） */
  async function adminSetMerchantPayment(id, paid, days) {
    const uid = await currentUid()
    if (!uid || !(await isStaff(uid))) throw new Error('没有管理权限')
    const now = new Date()
    const row = paid
      ? {
        status: 'active', payment_status: 'paid',
        paid_until: new Date(now.getTime() + (Number(days) || 365) * 86400000).toISOString(),
        paid_at: now.toISOString(), updated_at: now.toISOString()
      }
      : { status: 'suspended', payment_status: 'unpaid', paid_until: null, paid_at: null, updated_at: now.toISOString() }
    const res = await cloud.database.from('merchants').update(row).eq('id', id).select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，请确认管理员权限')
    return rows[0]
  }

  async function merchantBillingStats() {
    const [oRes, mRes] = await Promise.all([
      cloud.database.from('merchant_enroll_orders').select('id,status,amount_cents,plan_code').limit(500),
      cloud.database.from('merchants').select('id,status,payment_status,paid_until,plan_code').limit(500)
    ])
    const orders = unwrap(oRes, '') || []
    const shops = unwrap(mRes, '') || []
    const now = Date.now()
    const paid = orders.filter((o) => o.status === 'paid')
    const pending = orders.filter((o) => o.status === 'pending')
    const unpaidShops = shops.filter((s) => s.payment_status !== 'paid' || !s.paid_until || new Date(s.paid_until).getTime() <= now)
    const expiring = shops.filter((s) => {
      const t = s.paid_until ? new Date(s.paid_until).getTime() : 0
      return t > now && t - now <= 30 * 86400000
    })
    return {
      paidAmount: paid.reduce((n, o) => n + Number(o.amount_cents || 0), 0),
      pendingAmount: pending.reduce((n, o) => n + Number(o.amount_cents || 0), 0),
      paidOrders: paid.length,
      pendingOrders: pending.length,
      paidShops: shops.length - unpaidShops.length,
      unpaidShops: unpaidShops.length,
      expiringSoon: expiring.length
    }
  }

  /* ---------------- 平台公告 ---------------- */

  const ANNOUNCEMENT_FIELDS ='id,title,content,tag,level,link,sort_order,is_pinned,is_active,starts_at,ends_at,created_at,updated_at'
  const ANNOUNCEMENT_LEVELS = ['info', 'activity', 'important']

  /** 排序：置顶优先 → 权重降序 → 新的在前 */
  function sortAnnouncements(rows) {
    return (rows || []).slice().sort(
      (a, b) =>
        Number(!!b.is_pinned) - Number(!!a.is_pinned) ||
        (Number(b.sort_order) || 0) - (Number(a.sort_order) || 0) ||
        (Number(b.id) || 0) - (Number(a.id) || 0)
    )
  }

  /** 是否在投放有效期内（前端再兜一层，避免 RLS 未生效时露出过期公告） */
  function announcementInWindow(a) {
    const now = Date.now()
    const from = a.starts_at ? new Date(a.starts_at).getTime() : 0
    const to = a.ends_at ? new Date(a.ends_at).getTime() : Infinity
    return now >= from && now <= to
  }

  /** 用户端：当前生效的公告（RLS 只放行 is_active=true 的行） */
  async function listAnnouncements() {
    const res = await cloud.database
      .from('announcements')
      .select(ANNOUNCEMENT_FIELDS)
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .limit(50)
    const rows = unwrap(res, '公告加载失败') || []
    return sortAnnouncements(rows.filter(announcementInWindow))
  }

  /** 管理端：全部公告（含停用与过期，staff 策略放行） */
  async function adminListAnnouncements() {
    const res = await cloud.database
      .from('announcements')
      .select(ANNOUNCEMENT_FIELDS)
      .order('sort_order', { ascending: false })
      .limit(200)
    return sortAnnouncements(unwrap(res, '公告加载失败') || [])
  }

  function normalizeAnnouncement(payload) {
    const p = payload || {}
    const title = String(p.title || '').trim()
    if (!title) throw new Error('公告标题不能为空')
    if (title.length > 80) throw new Error('公告标题不能超过 80 字')
    return {
      title,
      content: String(p.content || '').trim().slice(0, 600),
      tag: String(p.tag || '公告').trim().slice(0, 8) || '公告',
      level: ANNOUNCEMENT_LEVELS.indexOf(p.level) >= 0 ? p.level : 'info',
      link: String(p.link || '').trim().slice(0, 200),
      sort_order: Number(p.sort_order) || 0,
      is_pinned: !!p.is_pinned,
      is_active: p.is_active !== false,
      starts_at: p.starts_at || null,
      ends_at: p.ends_at || null,
      updated_at: new Date().toISOString()
    }
  }

  async function createAnnouncement(payload) {
    const row = normalizeAnnouncement(payload)
    const res = await cloud.database.from('announcements').insert(row).select()
    const rows = unwrap(res, '发布公告失败')
    if (!rows || !rows.length) throw new Error('发布公告失败，请确认管理员身份')
    return rows[0]
  }

  async function updateAnnouncement(id, payload) {
    const row = normalizeAnnouncement(payload)
    delete row.is_active
    const res = await cloud.database.from('announcements').update(row).eq('id', id).select()
    const rows = unwrap(res, '保存公告失败')
    if (!rows || !rows.length) throw new Error('保存失败，该公告不存在或没有管理权限')
    return rows[0]
  }

  async function deleteAnnouncement(id) {
    const res = await cloud.database.from('announcements').delete().eq('id', id).select()
    const rows = unwrap(res, '删除公告失败')
    if (!rows || !rows.length) throw new Error('删除失败，该公告不存在或没有管理权限')
    return rows[0]
  }

  async function setAnnouncementActive(id, isActive) {
    const res = await cloud.database
      .from('announcements')
      .update({ is_active: !!isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，没有管理权限')
    return rows[0]
  }

  async function setAnnouncementPinned(id, isPinned) {
    const res = await cloud.database
      .from('announcements')
      .update({ is_pinned: !!isPinned, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    const rows = unwrap(res, '操作失败')
    if (!rows || !rows.length) throw new Error('操作失败，没有管理权限')
    return rows[0]
  }

  /* ---------------- 在线人数 ---------------- */

  const ONLINE_SID_KEY = 'wb_online_sid'

  /** 每个浏览器标签/设备一个稳定会话标识，存在 localStorage，刷新不重复计数 */
  function onlineSessionId() {
    let sid = ''
    try { sid = localStorage.getItem(ONLINE_SID_KEY) || '' } catch (e) {}
    if (!sid) {
      sid = 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)
      try { localStorage.setItem(ONLINE_SID_KEY, sid) } catch (e) {}
    }
    return sid
  }

  /**
   * 上报一次在线心跳，返回「近 2 分钟活跃会话数」。
   * 走 SECURITY DEFINER RPC：匿名访客也能上报，且不直接暴露心跳表。
   * 失败返回 null，UI 显示「–」，绝不编造在线数字。
   */
  async function reportOnline(page) {
    try {
      const res = await cloud.database.rpc('online_presence_beat', {
        p_session_key: onlineSessionId(),
        p_channel: 'web',
        p_page: String(page == null ? (location.hash || '/') : page).slice(0, 120)
      })
      if (res && res.error) return null
      const row = res && res.data && res.data[0]
      return row ? Number(row.online_count) || 0 : null
    } catch (e) {
      return null
    }
  }

  return {
    // 工具
    yuan, yuanShort, coverTheme, ORDER_STATUS, STATUS_TEXT, FLOW_TEXT, fromNow, esc, friendlyError,
    // 企业商家 · 店铺 / 任务
    resolveMedia, listMerchants, getMerchant, getMyMerchant, saveMerchant,
    listMerchantTasks, getMerchantTask, uploadTaskVideo, saveMerchantTask,
    setMerchantTaskStatus, deleteMerchantTask,
    applyMerchantTask, listMyApplications, listMerchantApplications, setApplicationStatus,
    adminListMerchants, adminListMerchantTasks, setMerchantStatus, setMerchantVerified, merchantStats,
    // 企业商家 · 付费入驻
    ENROLL_STATUS_TEXT, merchantPaidInfo, listMerchantPlans, getMerchantPayConfig,
    adminSaveMerchantPayConfig, listMyEnrollOrders, createMerchantEnrollOrder,
    changeMerchantEnrollPlan, uploadEnrollProof, submitEnrollPayment,
    adminListEnrollOrders, adminSaveMerchantPlan, adminReviewEnrollOrder,
    adminSetMerchantPayment, merchantBillingStats,
    // 平台公告
    listAnnouncements, adminListAnnouncements, createAnnouncement, updateAnnouncement,
    deleteAnnouncement, setAnnouncementActive, setAnnouncementPinned,
    // 在线人数
    reportOnline, onlineSessionId,
    // 会话
    getSession, sendPhoneCode, verifyPhoneCode, wechatLoginUrl, handleWechatCallback, signOut,
    // 业务
    listCategories, listBanners, getSettings,
    imgAttrs, toRelativeAsset,
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
    updateBanner, createBanner, deleteBanner, updateCategory, createCategory, updateSettings,
    listSettlements, generateSettlements, paySettlement,
    listAdminActions,
    // 人工客服
    createSupportConversation, listMySupportConversations, listSupportConversations,
    getSupportConversation, sendSupportMessage, markSupportRead,
    closeSupportConversation, assignSupportConversation, supportStats,
    // 群聊
    listChatGroups, getChatGroup, createChatGroup, joinChatGroup, isChatMember,
    listChatGroupMembers, listChatMessages, sendChatMessage, markChatRead,
    adminListChatGroups, adminListChatMessages, setChatMessageStatus, setChatGroupStatus, chatStats,
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
