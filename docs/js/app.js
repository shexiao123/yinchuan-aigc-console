/**
 * 宁夏云辇文化科技有限公司 · Web 版主逻辑
 * 哈希路由 + 视图渲染。手机与电脑共用一套代码，靠 CSS 响应式适配。
 */
(function () {
  const API = window.API
  const $ = (sel) => document.querySelector(sel)
  const app = $('#app')

  // 全国服务者可选的城市（含「远程」——AE 动画、AI 生成等可完全远程交付）
  const CITY_PRESETS = ['银川', '北京', '上海', '广州', '深圳', '杭州', '成都', '西安', '武汉', '远程']

  // 专业方向预设：摄影师 / 剪辑师 / AE 动画师 / AI 生成师 等
  const ROLE_PRESETS = [
    { name: '摄影师', icon: '📷' },
    { name: '剪辑师', icon: '✂️' },
    { name: 'AE 动画师', icon: '✨' },
    { name: 'AI 生成师', icon: '🤖' },
    { name: '导演', icon: '🎬' },
    { name: '调色师', icon: '🎨' },
    { name: '特效师', icon: '💫' },
    { name: '配音', icon: '🎙️' },
    { name: '文案策划', icon: '📝' },
    { name: '直播运营', icon: '📡' }
  ]

  const S = {
    session: null,
    provider: null,
    isStaff: false,
    settings: null,
    categories: [],
    bannerIdx: 0,
    orderFilter: 'all',
    studioTab: 'hall',
    serviceCategory: '',
    serviceKeyword: '',
    hallFilter: 'all'
  }

  // 当前服务页的样片（供点击播放时取用）
  const samplesCache = {}

  /* ---------------- 通用 ---------------- */

  let toastTimer
  function toast(msg) {
    const t = $('#toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600)
  }

  function requireLogin() {
    openLogin()
    return false
  }

  /* ---------------- 登录 ---------------- */

  const loginModal = $('#loginModal')
  let pendingOtp = null
  let sendingCode = false

  function openLogin() {
    loginModal.classList.add('show')
    $('#loginError').hidden = true
  }

  function closeLogin() {
    loginModal.classList.remove('show')
    $('#loginError').hidden = true
  }

  $('#loginBtn').addEventListener('click', openLogin)
  $('#loginClose').addEventListener('click', closeLogin)

  /* ---------------- 通用操作弹层 ---------------- */
  // 用户端原先没有通用弹层，导致「编辑资料」「确认开通会员」都无处落脚。
  // 这里补一个与管理端一致的 openAction(title, html, onOk, okText)。
  let actionHandler = null

  function openAction(title, bodyHtml, onOk, okText) {
    $('#actionTitle').textContent = title
    $('#actionBody').innerHTML = bodyHtml
    $('#actionOk').textContent = okText || '确定'
    actionHandler = onOk || null
    // 纯展示弹层：隐藏确定按钮，只留关闭
    $('#actionOk').style.display = onOk ? '' : 'none'
    $('#actionCancel').style.display = onOk ? '' : 'none'
    $('#actionModal').classList.add('show')
  }

  function closeAction() {
    $('#actionModal').classList.remove('show')
    $('#actionOk').style.display = ''
    $('#actionCancel').style.display = ''
    actionHandler = null
  }

  $('#actionClose').addEventListener('click', closeAction)
  $('#actionCancel').addEventListener('click', closeAction)
  $('#actionModal').addEventListener('click', (e) => {
    if (e.target === $('#actionModal')) closeAction()
  })
  $('#actionOk').addEventListener('click', async () => {
    if (!actionHandler) return
    const btn = $('#actionOk')
    btn.disabled = true
    try {
      await actionHandler()
      closeAction()
    } catch (e) {
      toast(API.friendlyError(e))
    } finally {
      btn.disabled = false
    }
  })
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) closeLogin()
  })

  document.querySelectorAll('.login-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.login-tab').forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      const mode = tab.dataset.login
      $('#panePhone').hidden = mode !== 'phone'
      $('#paneWechat').hidden = mode !== 'wechat'
    })
  })

  function showLoginError(msg) {
    const el = $('#loginError')
    el.textContent = msg
    el.hidden = false
  }

  // 手机号登录
  $('#sendCodeBtn').addEventListener('click', async () => {
    if (sendingCode) return
    const phone = $('#phoneInput').value.trim()
    if (!/^1\d{10}$/.test(phone)) {
      $('#phoneError').textContent = '请输入正确的 11 位手机号'
      return
    }
    $('#phoneError').textContent = ''
    sendingCode = true
    $('#sendCodeBtn').disabled = true
    try {
      const sent = await API.sendPhoneCode(phone)
      pendingOtp = { phone, verificationId: sent.verificationId, isExistingUser: sent.isExistingUser }
      $('#codeInput').disabled = false
      $('#codeInput').focus()
      toast('验证码已发送')
      let left = 60
      const timer = setInterval(() => {
        left -= 1
        if (left <= 0) {
          clearInterval(timer)
          $('#sendCodeBtn').disabled = false
          $('#sendCodeBtn').textContent = '重新获取'
        } else {
          $('#sendCodeBtn').textContent = `${left} 秒后重发`
        }
      }, 1000)
    } catch (e) {
      showLoginError(API.friendlyError(e))
      $('#sendCodeBtn').disabled = false
    } finally {
      sendingCode = false
    }
  })

  $('#phoneInput').addEventListener('input', () => {
    $('#phoneError').textContent = ''
  })

  $('#phoneLoginBtn').addEventListener('click', async () => {
    const phone = $('#phoneInput').value.trim()
    const token = $('#codeInput').value.trim()
    if (!/^1\d{10}$/.test(phone)) {
      $('#phoneError').textContent = '请输入正确的 11 位手机号'
      return
    }
    if (!pendingOtp || pendingOtp.phone !== phone) {
      showLoginError('请先为当前手机号获取验证码')
      return
    }
    if (!token) {
      showLoginError('请输入短信验证码')
      return
    }
    try {
      const session = await API.verifyPhoneCode({ ...pendingOtp, token })
      pendingOtp = null
      closeLogin()
      await onLogin(session)
      toast('登录成功')
      render()
    } catch (e) {
      showLoginError(API.friendlyError(e))
    }
  })

  // 微信扫码登录
  $('#wechatLoginBtn').addEventListener('click', async () => {
    try {
      const url = await API.wechatLoginUrl()
      // 展示授权地址，扫码后由回调完成登录
      const qr = $('#qrPlaceholder')
      qr.innerHTML =
        '<div style="text-align:center;padding:6px"><div style="font-size:12px;margin-bottom:8px">在微信中打开以下地址完成授权：</div>' +
        `<div style="word-break:break-all;font-size:10.5px;color:var(--ink-2);background:#fff;padding:8px;border-radius:6px">${API.esc(url)}</div></div>`
      qr.classList.add('qr-placeholder')
      $('#qrImg').hidden = true
      window.open(url, '_blank')
    } catch (e) {
      showLoginError(API.friendlyError(e))
    }
  })

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await API.signOut()
    } catch (e) {
      console.error('signOut failed', e.message)
    }
    S.session = null
    S.provider = null
    S.isStaff = false
    updateUserChip()
    toast('已退出登录')
    render()
  })

  /* ---------------- 评价 ---------------- */

  const REVIEW_TAGS = ['技术专业', '沟通顺畅', '守时准时', '交付及时', '有创意', '价格实惠']
  const REVIEW_SCORE_TEXT = { 1: '很不满意', 2: '不太满意', 3: '一般', 4: '满意', 5: '非常满意' }
  const reviewModal = $('#reviewModal')
  const reviewState = { orderId: null, rating: 5, tags: [], images: [], submitting: false }

  function renderReviewStars() {
    document.querySelectorAll('#reviewStars .review-star').forEach((btn) => {
      const score = Number(btn.dataset.score)
      btn.classList.toggle('star-on', score <= reviewState.rating)
    })
    $('#reviewScoreText').textContent = REVIEW_SCORE_TEXT[reviewState.rating] || '非常满意'
  }

  function renderReviewTags() {
    $('#reviewTags').innerHTML = REVIEW_TAGS.map(
      (t) =>
        `<button class="review-tag ${reviewState.tags.indexOf(t) >= 0 ? 'tag-on' : ''}" data-tag="${API.esc(t)}" type="button">${API.esc(t)}</button>`
    ).join('')
  }

  function renderReviewImages() {
    const box = $('#reviewImages')
    const items = reviewState.images
      .map(
        (img, i) =>
          `<div class="review-img"><img src="${API.esc(img.url)}" alt="评价图 ${i + 1}"/><button class="review-img-remove" data-remove="${i}" type="button">×</button></div>`
      )
      .join('')
    const add = items.length < 3 ? '<button class="review-img-add" id="reviewAddImg" type="button">＋<span>添加</span></button>' : ''
    box.innerHTML = items + add
    const addBtn = $('#reviewAddImg')
    if (addBtn) {
      addBtn.addEventListener('click', () => $('#reviewFile').click())
    }
    box.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.remove)
        reviewState.images.splice(idx, 1)
        renderReviewImages()
      })
    })
  }

  /** 打开评价弹层 */
  async function openReview(orderId) {
    const order = await API.getOrder(orderId)
    if (!order) {
      toast('订单不存在')
      return
    }
    const existing = await API.getReviewByOrder(orderId)
    const svc = await API.getService(order.service_id)

    reviewState.orderId = orderId
    reviewState.rating = existing ? existing.rating : 5
    reviewState.tags = existing && Array.isArray(existing.tags) ? existing.tags.slice() : []
    reviewState.images = existing && Array.isArray(existing.images)
      ? existing.images.map((p) => ({ url: p, file: null }))
      : []
    reviewState.submitting = false

    $('#reviewTitle').textContent = existing ? '修改评价' : '写评价'
    $('#reviewOrderText').textContent = svc ? svc.title : order.title
    $('#reviewContent').value = existing ? existing.content || '' : ''
    $('#reviewCount').textContent = ($('#reviewContent').value || '').length
    $('#reviewError').hidden = true
    $('#reviewSubmit').disabled = false
    $('#reviewSubmit').textContent = existing ? '更新评价' : '提交评价'

    renderReviewStars()
    renderReviewTags()
    renderReviewImages()
    reviewModal.classList.add('show')
  }

  function closeReview() {
    reviewModal.classList.remove('show')
  }

  $('#reviewClose').addEventListener('click', closeReview)
  reviewModal.addEventListener('click', (e) => {
    if (e.target === reviewModal) closeReview()
  })

  // 初始渲染（弹层首次打开前就绪，避免空白态）
  renderReviewStars()
  renderReviewTags()
  renderReviewImages()

  $('#reviewStars').addEventListener('click', (e) => {
    const btn = e.target.closest('.review-star')
    if (!btn) return
    reviewState.rating = Number(btn.dataset.score)
    renderReviewStars()
  })

  $('#reviewTags').addEventListener('click', (e) => {
    const btn = e.target.closest('.review-tag')
    if (!btn) return
    const tag = btn.dataset.tag
    const idx = reviewState.tags.indexOf(tag)
    if (idx >= 0) reviewState.tags.splice(idx, 1)
    else if (reviewState.tags.length < 3) reviewState.tags.push(tag)
    else {
      toast('最多选 3 个标签')
      return
    }
    renderReviewTags()
  })

  $('#reviewContent').addEventListener('input', (e) => {
    $('#reviewCount').textContent = e.target.value.length
  })

  $('#reviewFile').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || [])
    const room = 3 - reviewState.images.length
    files.slice(0, room).forEach((file) => {
      reviewState.images.push({ url: URL.createObjectURL(file), file })
    })
    e.target.value = ''
    renderReviewImages()
  })

  $('#reviewSubmit').addEventListener('click', async () => {
    if (reviewState.submitting) return
    const content = $('#reviewContent').value.trim()
    if (content.length < 5) {
      const err = $('#reviewError')
      err.textContent = '评价内容至少 5 个字'
      err.hidden = false
      return
    }
    reviewState.submitting = true
    $('#reviewSubmit').disabled = true
    $('#reviewSubmit').textContent = '提交中…'
    try {
      const order = await API.getOrder(reviewState.orderId)
      await API.createReview({
        orderId: reviewState.orderId,
        serviceId: order ? order.service_id : null,
        rating: reviewState.rating,
        content,
        tags: reviewState.tags,
        images: reviewState.images.map((i) => i.file).filter(Boolean)
      })
      closeReview()
      toast('评价已提交')
      render()
    } catch (e) {
      const err = $('#reviewError')
      err.textContent = API.friendlyError(e)
      err.hidden = false
    } finally {
      reviewState.submitting = false
      $('#reviewSubmit').disabled = false
      $('#reviewSubmit').textContent = '提交评价'
    }
  })

  /* ---------------- 身份 ---------------- */

  async function onLogin(session) {
    S.session = session || null
    if (session && session.user) {
      const uid = session.user.id
      S.provider = await API.getMyProvider(uid)
      S.isStaff = await API.isStaff(uid)
    }
    updateUserChip()
  }

  function updateUserChip() {
    const chip = $('#userChip')
    const loginBtn = $('#loginBtn')
    if (S.session && S.session.user) {
      const name = S.session.user.name || '光影用户'
      $('#userName').textContent = name
      $('#userAvatar').textContent = name.charAt(0)
      chip.hidden = false
      loginBtn.hidden = true
      refreshNotifyBadge()
    } else {
      chip.hidden = true
      loginBtn.hidden = false
      const badge = $('#navNotifyBadge')
      if (badge) badge.hidden = true
    }
  }

  /** 更新导航栏的未读消息徽标 */
  async function refreshNotifyBadge() {
    const badge = $('#navNotifyBadge')
    if (!badge) return
    if (!S.session || !S.session.user) {
      badge.hidden = true
      return
    }
    try {
      const n = await API.countUnread()
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n)
        badge.hidden = false
      } else {
        badge.hidden = true
      }
    } catch (e) {
      badge.hidden = true
    }
  }

  /* ---------------- 路由 ---------------- */

  function parseHash() {
    const raw = window.location.hash.replace(/^#\/?/, '')
    const [pathPart, queryPart] = raw.split('?')
    const parts = pathPart ? pathPart.split('/') : []
    const route = parts[0] || 'home'
    const id = parts[1] ? Number(parts[1]) : null
    const query = {}
    if (queryPart) {
      queryPart.split('&').forEach((kv) => {
        const [k, v] = kv.split('=')
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '')
      })
    }
    return { route, id, query }
  }

  function navigate(path) {
    window.location.hash = path
  }

  window.addEventListener('hashchange', () => {
    render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  // 屏幕尺寸变化时重算网格列数（内容始终铺满，不留白边）
  let gridResizeTimer = null
  window.addEventListener('resize', () => {
    if (gridResizeTimer) clearTimeout(gridResizeTimer)
    gridResizeTimer = setTimeout(() => {
      gridResizeTimer = null
      if (window.AdaptiveGrid) window.AdaptiveGrid.fitAll(app)
    }, 120)
  })

  // 调试钩子：仅在 ?debug=1 时开放，供自动化测试注入会话状态
  if (/(^|[?&])debug=1(&|$)/.test(window.location.search)) {
    window.__wbDebug = {
      setSession: (session) => {
        S.session = session
        updateUserChip()
      },
      getState: () => S,
      render: () => render()
    }
  }

  function setActiveNav(route) {
    const map = { home: 'home', services: 'services', hall: 'hall', orders: 'orders', studio: 'studio', admin: 'studio' }
    const key = map[route] || 'home'
    document.querySelectorAll('.nav-link').forEach((n) => {
      n.classList.toggle('active', n.dataset.route === key)
    })
    document.querySelectorAll('.mobile-nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.route === key)
    })
  }

  /* ---------------- 视图 ---------------- */

  const VIEWS = {}

  function render() {
    const { route, id, query } = parseHash()
    setActiveNav(route)
    const view = VIEWS[route] || VIEWS.home
    app.innerHTML = `<div class="loading">加载中</div>`
    Promise.resolve(view(id, query))
      .then((html) => {
        app.innerHTML = html
        bindView(route, id, query)
        // 自适应网格：按项数与屏幕宽度算列数，内容铺满不留白
        if (window.AdaptiveGrid) window.AdaptiveGrid.fitAll(app)
      })
      .catch((e) => {
        console.error('render failed', e)
        app.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div>
          <span class="empty-text">页面加载失败</span>
          <span class="empty-hint">${API.esc(API.friendlyError(e))}</span></div>`
      })
  }

  function bindView(route, id, query) {
    const handler = BINDINGS[route]
    if (typeof handler === 'function') handler(id, query)
    else if (Array.isArray(handler)) handler.forEach((fn) => fn(id, query))
  }

  const BINDINGS = {}
  /* ---------------- 首页 ---------------- */

  VIEWS.home = async function () {
    const [banners, categories, services, providers] = await Promise.all([
      API.listBanners(), API.listCategories(), API.listServices({ limit: 8 }), API.listProviders()
    ])
    const settings = S.settings || (S.settings = await API.getSettings())
    const hot = services.slice(0, 6)

    const heroBanner = banners[0] || { title: '银川AIGC数字文化产业基地', subtitle: '', theme: 'amber' }
    const minis = banners.slice(1, 5)

    /** banner 跳转目标：link_type=all 时跳全部服务，否则按分类 */
    const bannerHref = (b) => (b.link_type === 'all' || !b.link_value ? '#/services' : '#/services?category=' + b.link_value)

    return `
      <div class="hero">
        <div class="hero-banner banner-${heroBanner.theme || 'amber'} ${heroBanner.imageUrl ? 'hero-banner-has-img' : ''}" data-go="${bannerHref(heroBanner)}" ${heroBanner.imageUrl ? `style="background-image:url('${API.esc(heroBanner.imageUrl)}')"` : ''}>
          <div class="banner-text">
            <span class="banner-title">${API.esc(heroBanner.title)}</span>
            <span class="banner-sub">${API.esc(heroBanner.subtitle)}</span>
          </div>
          <span class="banner-mark" ${heroBanner.imageUrl ? 'style="display:none"' : ''}>MG</span>
        </div>
        <div class="hero-side">
          ${minis
            .map(
              (b, i) => `
            <div class="hero-mini hero-mini-${['amber', 'olive', 'rose', 'blue'][i % 4]} ${b.imageUrl ? 'hero-mini-has-img' : ''}" data-go="${bannerHref(b)}" ${b.imageUrl ? `style="--hero-img:url('${API.esc(b.imageUrl)}')"` : ''}>
              <span class="hero-mini-title">${API.esc(b.title)}</span>
              <span class="hero-mini-sub">${API.esc(b.subtitle)}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">服务分类</span>
          <a class="section-more" href="#/services">全部服务 ›</a>
        </div>
        <div class="cat-grid">
          ${categories
            .map(
              (c) => `
            <a class="cat-item ${c.imageUrl ? 'cat-item-has-img' : ''}" href="#/services?category=${c.slug}">
              ${c.imageUrl ? `<span class="cat-img-wrap"><img class="cat-img" src="${API.esc(c.imageUrl)}" alt="${API.esc(c.name || '')}" loading="lazy" /></span>` : `<span class="cat-icon-wrap">${c.icon || '🎬'}</span>`}
              <span class="cat-name">${API.esc(c.name)}</span>
              <span class="cat-desc">${API.esc(c.description)}</span>
            </a>`
            )
            .join('')}
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">热销服务<span class="count">按销量排序</span></span>
          <a class="section-more" href="#/services">更多 ›</a>
        </div>
        <div class="svc-grid">${hot.map(svcCard).join('')}</div>
      </div>

      <div class="section">
        <div class="section-head">
          <span class="section-title">推荐服务者<span class="count">按完成单量</span></span>
        </div>
        <div class="prov-grid">${providers.map(provCard).join('')}</div>
      </div>

      <div class="section">
        <div class="card card-pad" style="background:linear-gradient(135deg,#FBF3EA,#F7EFE4)">
          <div style="font-size:15px;font-weight:600;color:var(--brand-deep);margin-bottom:8px">平台规则</div>
          <div style="font-size:13.5px;color:var(--ink-2);line-height:1.85">${API.esc(settings.notice)}</div>
          <div style="font-size:13.5px;color:var(--ink-2);line-height:1.85">
            最低下单金额 ¥${API.yuanShort(settings.min_order_amount)}，服务热线 ${API.esc(settings.support_phone)}
          </div>
        </div>
      </div>
    `
  }

  function svcCard(s) {
    const cover = API.coverTheme(s.id)
    return `
      <a class="card svc-card" href="#/service/${s.id}">
        <div class="svc-cover" style="background:${cover}">
          ${s.coverUrl ? `<img class="svc-cover-img" src="${API.esc(s.coverUrl)}" alt="${API.esc(s.title || '')}" loading="lazy" />` : '<span class="svc-cover-mark">MG</span>'}
          ${s.original_price ? '<span class="svc-cover-badge">限时优惠</span>' : ''}
        </div>
        <div class="svc-body">
          <span class="svc-title ellipsis">${API.esc(s.title)}</span>
          <span class="svc-sub ellipsis">${API.esc(s.subtitle)}</span>
          <div class="svc-meta">
            <span>★ ${s.rating}</span><span class="svc-meta-dot">·</span>
            <span>已售 ${s.sales_count}</span><span class="svc-meta-dot">·</span>
            <span>${s.delivery_days} 天交付</span>
          </div>
          <div class="svc-tags">${(s.tags || []).map((t) => `<span class="tag">${API.esc(t)}</span>`).join('')}</div>
          <div class="svc-foot">
            <span class="svc-sales">${API.esc(s.unit)}</span>
            <span>
              <span class="price"><span class="price-value">¥${API.yuanShort(s.price)}</span></span>
              ${s.original_price ? `<span class="price-old">¥${API.yuanShort(s.original_price)}</span>` : ''}
            </span>
          </div>
        </div>
      </a>
    `
  }

  function provCard(p) {
    return `
      <a class="card prov-item" href="#/provider/${p.id}">
        <span class="avatar avatar-lg">${API.esc((p.nickname || '影').charAt(0))}</span>
        <span class="prov-name-row">
          <span class="prov-name">${API.esc(p.nickname)}</span>
          ${p.is_verified ? '<span class="prov-verified">✓ 认证</span>' : ''}
        </span>
        <span class="prov-bio ellipsis-2">${API.esc(p.bio || '')}</span>
        <span class="prov-meta">
          <span class="prov-rate">★ ${Number(p.rating || 5).toFixed(1)}</span>
          <span>·</span><span>完成 ${p.orders_done} 单</span>
          <span>·</span><span>${API.esc(p.city || '')}</span>
        </span>
      </a>
    `
  }

  /* ---------------- 服务列表 ---------------- */

  VIEWS.services = async function (id, query) {
    if (query.category !== undefined) S.serviceCategory = query.category
    if (query.keyword !== undefined) S.serviceKeyword = query.keyword
    const categories = await API.listCategories()
    const services = await API.listServices({
      categorySlug: S.serviceCategory,
      keyword: S.serviceKeyword,
      limit: 60
    })
    const providers = await API.listProviders()
    const providerMap = {}
    providers.forEach((p) => { providerMap[p.id] = p })

    return `
      <div class="page-head">
        <div class="page-title">全部服务</div>
        <div class="page-sub">摄影师 · 剪辑师 · AE 动画师 · AI 生成师，全国接单，认证服务者直约</div>
      </div>

      <div class="filter-bar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input class="input" id="kwInput" placeholder="搜索服务，如「婚礼微电影」" value="${API.esc(S.serviceKeyword)}">
        </div>
        <button class="filter-chip ${S.serviceCategory === '' ? 'active' : ''}" data-cat="">全部</button>
        ${categories
          .map(
            (c) =>
              `<button class="filter-chip ${S.serviceCategory === c.slug ? 'active' : ''}" data-cat="${c.slug}">${c.icon || ''} ${API.esc(c.name)}</button>`
          )
          .join('')}
      </div>

      <div class="section-head">
        <span class="section-title">共 ${services.length} 项服务</span>
      </div>

      ${
        services.length
          ? `<div class="svc-grid">${services
              .map((s) => {
                const p = providerMap[s.provider_id] || {}
                return `
            <a class="card svc-card" href="#/service/${s.id}">
              <div class="svc-cover" style="background:${API.coverTheme(s.id)}">
                ${s.coverUrl ? `<img class="svc-cover-img" src="${API.esc(s.coverUrl)}" alt="${API.esc(s.title || '')}" loading="lazy" />` : '<span class="svc-cover-mark">MG</span>'}
              </div>
              <div class="svc-body">
                <span class="svc-title ellipsis">${API.esc(s.title)}</span>
                <span class="svc-sub ellipsis">${API.esc(s.subtitle)}</span>
                <div class="svc-meta">
                  <span>★ ${s.rating}</span><span class="svc-meta-dot">·</span>
                  <span>已售 ${s.sales_count}</span><span class="svc-meta-dot">·</span>
                  <span>${s.delivery_days} 天交付</span>
                </div>
                <div class="svc-tags">${(s.tags || []).map((t) => `<span class="tag">${API.esc(t)}</span>`).join('')}</div>
                <div class="svc-provider">
                  <span class="avatar avatar-sm">${API.esc((p.nickname || '影').charAt(0))}</span>
                  <span class="svc-provider-name">${API.esc(p.nickname || '—')}</span>
                  <span class="svc-provider-rating">★ ${Number(p.rating || 5).toFixed(1)}</span>
                </div>
                <div class="svc-foot">
                  <span class="svc-sales">${API.esc(s.unit)}</span>
                  <span>
                    <span class="price"><span class="price-value">¥${API.yuanShort(s.price)}</span></span>
                    ${s.original_price ? `<span class="price-old">¥${API.yuanShort(s.original_price)}</span>` : ''}
                  </span>
                </div>
              </div>
            </a>`
              })
              .join('')}</div>`
          : `<div class="empty"><div class="empty-icon">🎬</div>
              <span class="empty-text">没有找到匹配的服务</span>
              <span class="empty-hint">换个关键词或分类试试</span></div>`
      }
    `
  }

  BINDINGS.services = function () {
    document.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.serviceCategory = btn.dataset.cat
        S.serviceKeyword = ''
        navigate('#/services')
      })
    })
    const kw = $('#kwInput')
    if (kw) {
      let timer
      kw.addEventListener('input', (e) => {
        S.serviceKeyword = e.target.value
        clearTimeout(timer)
        timer = setTimeout(() => {
          navigate('#/services?keyword=' + encodeURIComponent(S.serviceKeyword))
        }, 380)
      })
    }
  }

  /* ---------------- 服务详情 ---------------- */

  VIEWS.service = async function (id) {
    const service = await API.getService(id)
    if (!service) {
      return `<div class="empty"><div class="empty-icon">🎬</div>
        <span class="empty-text">服务不存在或已下架</span>
        <a class="btn btn-soft" href="#/services">去看看其他服务</a></div>`
    }
    const [provider, reviews, rawSamples] = await Promise.all([
      API.getProvider(service.provider_id),
      API.listReviews(service.id),
      API.listSamples(service.id)
    ])
    // 样片地址需签名后前端才能播放；未登录时无法签名，展示引导
    const loggedIn = !!(S.session && S.session.user)
    let samples = rawSamples.map((s) => ({ ...s, url: '', locked: !loggedIn }))
    if (loggedIn && window.SAMPLES) {
      samples = await window.SAMPLES.signedUrls(rawSamples)
    }
    samplesCache[id] = samples
    const p = provider || {}

    return `
      <div class="detail-hero">
        <div class="detail-cover ${service.coverUrl ? 'detail-cover-has-img' : ''}" style="background:${service.coverUrl ? 'transparent' : API.coverTheme(service.id)}">
          ${service.coverUrl ? `<img class="detail-cover-img" src="${API.esc(service.coverUrl)}" alt="${API.esc(service.title || '')}" />` : '<span class="detail-cover-mark">MG</span>'}
        </div>
        <div class="detail-info">
          <div class="detail-title">${API.esc(service.title)}</div>
          <div class="detail-sub">${API.esc(service.subtitle)}</div>
          <div class="detail-price-row">
            <span class="price detail-price">¥${API.yuanShort(service.price)}</span>
            ${service.original_price ? `<span class="price-old">¥${API.yuanShort(service.original_price)}</span>` : ''}
            <span class="price-unit">/ ${API.esc(service.unit)}</span>
          </div>
          <div class="detail-stats">
            <span><b>★ ${service.rating}</b> 评分</span>
            <span><b>${service.sales_count}</b> 已售</span>
            <span><b>${service.delivery_days}</b> 天交付</span>
          </div>
          <div class="detail-actions">
            <button class="btn btn-primary btn-lg" id="orderBtn">立即下单</button>
            <a class="btn btn-ghost btn-lg" href="#/provider/${service.provider_id}">查看服务者</a>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <!-- 宣传样片 -->
          <div class="card card-pad" style="margin-bottom:24px" id="sampleSection">
            <div class="section-head" style="margin-bottom:14px">
              <span class="block-title" style="margin:0">宣传样片</span>
              <span class="muted">${samples.length} 个作品</span>
            </div>
            ${
              samples.length
                ? `<div class="sample-grid">
                    ${samples
                      .map(
                        (s, i) => `
                      <div class="sample-card ${s.locked ? 'sample-locked' : ''}" ${s.locked ? 'data-login-prompt="1"' : `data-sample="${i}"`}>
                        <div class="sample-media">
                          ${
                            s.media_type === 'video'
                              ? `<video class="sample-video" src="${s.url}" preload="metadata" controls playsinline
                                   poster="${s.cover_url || ''}"></video>`
                              : `<img class="sample-image" src="${s.url}" alt="${s.title || ''}" loading="lazy">`
                          }
                          ${
                            s.locked
                              ? `<div class="sample-lock">
                                   <svg class="sample-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                     ${s.media_type === 'video'
                                       ? '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>'
                                       : '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'}
                                   </svg>
                                   <span class="sample-lock-text">登录后观看</span>
                                 </div>`
                              : ''
                          }
                        </div>
                        <div class="sample-info">
                          <div class="sample-title">${API.esc(s.title || '样片')}</div>
                          ${s.description ? `<div class="sample-desc">${API.esc(s.description)}</div>` : ''}
                          <div class="sample-meta">
                            ${s.media_type === 'video' ? '🎬 视频' : '🖼 图片'}
                            ${s.file_size ? ' · ' + (s.file_size / 1024 / 1024).toFixed(1) + 'MB' : ''}
                          </div>
                        </div>
                      </div>`
                      )
                      .join('')}
                   </div>`
                : `<div class="empty" style="padding:36px 0">
                    <div class="empty-icon">🎞</div>
                    <span class="empty-text">这位服务者还没有上传样片</span>
                    <span class="empty-hint">可以先查看服务说明与客户评价</span>
                   </div>`
            }
          </div>

          <div class="card card-pad" style="margin-bottom:24px">
            <div class="block-title">服务内容</div>
            <div class="block-text">${API.esc(service.description)}</div>
            <div class="divider"></div>
            <div class="spec-row"><span class="spec-label">交付周期</span><span class="spec-value">${service.delivery_days} 个工作日</span></div>
            <div class="spec-row"><span class="spec-label">服务规格</span><span class="spec-value">${API.esc(service.duration)}</span></div>
            <div class="spec-row"><span class="spec-label">计价单位</span><span class="spec-value">${API.esc(service.unit)}</span></div>
            <div class="spec-row"><span class="spec-label">服务标签</span>
              <span class="spec-value">${(service.tags || []).map((t) => `<span class="tag">${API.esc(t)}</span>`).join('')}</span></div>
          </div>

          <div class="card card-pad">
            <div class="section-head" style="margin-bottom:6px">
              <span class="block-title" style="margin:0">客户评价</span>
              <span class="muted">${reviews.length} 条</span>
            </div>
            ${
              reviews.length
                ? reviews
                    .map(
                      (r) => `
              <div class="review-item">
                <span class="avatar avatar-sm">${API.esc((r.customer_name || '客').charAt(0))}</span>
                <div class="review-body">
                  <div class="review-head">
                    <span class="review-name">${API.esc(r.customer_name || '匿名客户')}</span>
                    <span class="review-stars">${'★'.repeat(r.rating)}</span>
                    <span class="review-time">${API.fromNow(r.created_at)}</span>
                  </div>
                  ${Array.isArray(r.tags) && r.tags.length ? `<div class="review-tag-row">${r.tags.map((t) => `<span class="review-tag-chip">${API.esc(t)}</span>`).join('')}</div>` : ''}
                  <div class="review-text">${API.esc(r.content)}</div>
                  ${Array.isArray(r.images) && r.images.length ? `<div class="review-img-row">${r.images.map((p) => `<img src="${API.esc(p)}" alt="评价图" loading="lazy"/>`).join('')}</div>` : ''}
                  ${r.reply ? `<div class="review-reply"><b>服务者回复：</b>${API.esc(r.reply)}</div>` : ''}
                </div>
              </div>`
                    )
                    .join('')
                : `<div class="empty" style="padding:40px 0"><span class="empty-text">还没有评价</span><span class="empty-hint">成为第一个下单的人吧</span></div>`
            }
          </div>
        </div>

        <div>
          <div class="card card-pad">
            <div class="block-title">服务者</div>
            <div style="display:flex;gap:14px;align-items:center">
              <span class="avatar avatar-lg">${API.esc((p.nickname || '影').charAt(0))}</span>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:16px;font-weight:600">${API.esc(p.nickname || '—')}</span>
                  ${p.is_verified ? '<span class="prov-verified">✓ 认证</span>' : ''}
                </div>
                <div class="muted" style="margin-top:4px">★ ${Number(p.rating || 5).toFixed(1)} · 完成 ${p.orders_done || 0} 单 · ${API.esc(p.city || '')}</div>
              </div>
            </div>
            <div class="divider"></div>
            <div class="block-text" style="font-size:13.5px">${API.esc(p.bio || '')}</div>
            ${
              (p.tags || []).length
                ? `<div style="margin-top:12px">${p.tags.map((t) => `<span class="tag">${API.esc(t)}</span>`).join('')}</div>`
                : ''
            }
            <a class="btn btn-soft btn-block" style="margin-top:16px" href="#/provider/${service.provider_id}">查看全部服务</a>
          </div>
        </div>
      </div>
    `
  }

  BINDINGS.service = function (id) {
    const btn = $('#orderBtn')
    if (btn) {
      btn.addEventListener('click', () => {
        if (!S.session || !S.session.user) {
          openLogin()
          return
        }
        navigate('#/order-create?serviceId=' + id)
      })
    }

    // 样片：未登录点「登录后观看」→ 弹登录；已登录点卡片 → 播放
    document.querySelectorAll('[data-login-prompt]').forEach((el) => {
      el.addEventListener('click', () => {
        openLogin()
        toast('登录后即可观看完整样片')
      })
    })
    document.querySelectorAll('[data-sample]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const s = samplesCache[id]
        if (!s) return
        if (s.media_type === 'video') {
          // 视频用弹层放大播放
          const layer = document.createElement('div')
          layer.className = 'video-layer'
          layer.innerHTML = `<div class="video-layer-inner">
              <video src="${s.url}" controls autoplay playsinline></video>
              <button class="video-layer-close" aria-label="关闭">×</button>
            </div>`
          layer.addEventListener('click', (ev) => {
            if (ev.target === layer || ev.target.classList.contains('video-layer-close')) {
              const v = layer.querySelector('video')
              if (v) v.pause()
              layer.remove()
            }
          })
          document.body.appendChild(layer)
        } else {
          const w = window.open(s.url, '_blank')
          if (!w) toast('浏览器拦截了新窗口，请允许弹出窗口')
        }
      })
    })
  }

  /* ---------------- 下单 ---------------- */

  VIEWS['order-create'] = async function (id, query) {
    const serviceId = Number(query.serviceId)
    const service = await API.getService(serviceId)
    if (!service) {
      return `<div class="empty"><div class="empty-icon">🎬</div><span class="empty-text">服务不存在</span></div>`
    }
    const provider = await API.getProvider(service.provider_id)
    const settings = S.settings || (S.settings = await API.getSettings())
    const fee = Math.round((service.price || 0) * Number(settings.commission_rate || 0))
    const p = provider || {}

    return `
      <div class="page-head">
        <div class="page-title">提交订单</div>
        <div class="page-sub">填写需求后提交，服务者接单前可随时取消</div>
      </div>

      <div class="form-panel">
        <div class="card card-pad" style="margin-bottom:20px;display:flex;gap:14px;align-items:center">
          <div style="width:88px;height:88px;border-radius:12px;background:${service.coverUrl ? 'transparent' : API.coverTheme(service.id)};display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
            ${service.coverUrl ? `<img class="order-form-cover-img" src="${API.esc(service.coverUrl)}" alt="" />` : '<span style="font-size:22px;font-weight:800;color:rgba(255,255,255,.34)">MG</span>'}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:16px;font-weight:600" class="ellipsis">${API.esc(service.title)}</div>
            <div class="muted ellipsis" style="margin-top:4px">${API.esc(service.subtitle)}</div>
            <div style="color:var(--brand);font-weight:600;margin-top:8px">¥${API.yuanShort(service.price)} / ${API.esc(service.unit)}</div>
          </div>
        </div>

        <div class="card card-pad" style="margin-bottom:20px;display:flex;gap:14px;align-items:center">
          <span class="avatar avatar-md">${API.esc((p.nickname || '影').charAt(0))}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:600">${API.esc(p.nickname || '—')}</div>
            <div class="muted" style="margin-top:3px">${API.esc(p.city || '')} · 完成 ${p.orders_done || 0} 单</div>
          </div>
          <span class="tag" id="modeTag" style="margin:0">指定服务者</span>
        </div>

        <div class="card card-pad" style="margin-bottom:20px">
          <div class="block-title">发布方式</div>
          <div class="radio-group">
            <div class="radio-item active" data-mode="direct">
              <span class="radio-dot"></span>
              <div>
                <div class="radio-title">指定给该服务者</div>
                <div class="radio-desc">${API.esc(p.nickname || '服务者')} 接单后直接开始沟通，适合已经确定合作对象。</div>
              </div>
            </div>
            <div class="radio-item" data-mode="open">
              <span class="radio-dot"></span>
              <div>
                <div class="radio-title">发布到需求大厅</div>
                <div class="radio-desc">不指定人，所有服务者都能抢单，谁先接由谁服务，价格更灵活。</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card card-pad" style="margin-bottom:20px">
          <div class="field">
            <label class="field-label">订单标题</label>
            <input class="input" id="fTitle" maxlength="40" placeholder="例如：10 月 18 日 婚礼当日跟拍与快剪">
          </div>
          <div class="form-row">
            <div class="field">
              <label class="field-label">拍摄 / 交付日期</label>
              <input class="input" id="fDate" type="date">
            </div>
            <div class="field">
              <label class="field-label">期望时长（分钟，选填）</label>
              <input class="input" id="fDuration" type="number" placeholder="例如：30">
            </div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field-label">需求描述</label>
            <textarea class="textarea" id="fReq" maxlength="500" placeholder="说说你想要什么：场地、人数、风格倾向、需要哪些片段、是否需要加急等"></textarea>
            <div class="muted" style="text-align:right;margin-top:6px" id="reqCount">0 / 500</div>
          </div>
        </div>

        <div class="card card-pad" style="margin-bottom:20px">
          <div class="block-title">费用明细</div>
          <div class="fee-row"><span class="fee-label">服务金额</span><span class="fee-value">¥${API.yuan(service.price)}</span></div>
          <div class="fee-row"><span class="fee-label">平台服务费</span><span class="fee-value fee-dim">¥${API.yuan(fee)}</span></div>
          <div class="divider"></div>
          <div class="fee-row"><span class="fee-label fee-total-label">实付金额</span><span class="fee-total">¥${API.yuan(service.price)}</span></div>
          <div class="muted" style="margin-top:12px;line-height:1.7">平台服务费由服务者承担，从其收入中扣除，不额外向你收取。</div>
        </div>

        <div id="formError"></div>
        <button class="btn btn-primary btn-lg btn-block" id="submitOrder">提交订单</button>
      </div>
    `
  }

  BINDINGS['order-create'] = function (id, query) {
    const serviceId = Number(query.serviceId)
    let mode = 'direct'

    document.querySelectorAll('.radio-item').forEach((item) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.radio-item').forEach((i) => i.classList.remove('active'))
        item.classList.add('active')
        mode = item.dataset.mode
        const tag = $('#modeTag')
        if (tag) {
          tag.textContent = mode === 'direct' ? '指定服务者' : '公开需求'
          tag.style.background = mode === 'direct' ? '' : '#EBF0E6'
          tag.style.color = mode === 'direct' ? '' : '#4F6044'
        }
      })
    })

    const req = $('#fReq')
    if (req) {
      req.addEventListener('input', (e) => {
        $('#reqCount').textContent = `${e.target.value.length} / 500`
      })
    }

    const submit = $('#submitOrder')
    if (!submit) return
    submit.addEventListener('click', async () => {
      if (!S.session || !S.session.user) {
        openLogin()
        return
      }
      const title = $('#fTitle').value.trim()
      const errBox = $('#formError')
      if (!title) {
        errBox.innerHTML = `<div class="login-error" style="display:block">请填写订单标题</div>`
        $('#fTitle').focus()
        return
      }
      errBox.innerHTML = ''
      submit.disabled = true
      submit.textContent = '提交中…'
      try {
        const service = await API.getService(serviceId)
        const settings = S.settings || (await API.getSettings())
        // 佣金按服务者的会员档位算（与下单时服务端重算同一套规则）
        const comm = await API.getProviderCommission(
          mode === 'open' ? null : service.provider_id,
          settings.commission_rate
        )
        const rate = Number(comm.rate || 0)
        const fee = Math.round((service.price || 0) * rate)
        const order = await API.createOrder({
          serviceId,
          providerId: mode === 'open' ? null : service.provider_id,
          title,
          requirement: $('#fReq').value.trim(),
          shootDate: $('#fDate').value || null,
          amount: service.price,
          platformFee: fee,
          customerName: S.session.user.name || null,
          customerAvatar: S.session.user.avatarUrl || null
        })
        toast('下单成功')
        navigate('#/order/' + order.id)
      } catch (e) {
        const msg = API.friendlyError(e)
        errBox.innerHTML = `<div class="login-error" style="display:block">${API.esc(msg)}</div>`
        submit.disabled = false
        submit.textContent = '提交订单'
      }
    })
  }

  /* ---------------- 订单列表 ---------------- */

  const ORDER_FILTERS = [
    { k: 'all', l: '全部' },
    { k: 'open', l: '待接单' },
    { k: 'producing', l: '进行中' },
    { k: 'delivered', l: '待确认' },
    { k: 'completed', l: '已完成' }
  ]

  VIEWS.orders = async function () {
    if (!S.session || !S.session.user) {
      return `<div class="empty"><div class="empty-icon">📋</div>
        <span class="empty-text">登录后查看你的订单</span>
        <span class="empty-hint">下单后可在这里跟踪制作进度</span>
        <button class="btn btn-primary" id="goLogin">去登录</button></div>`
    }
    const uid = S.session.user.id
    const role = S.provider ? 'provider' : 'customer'
    const providerIds = S.provider ? [S.provider.id] : []
    const status = S.orderFilter === 'all' ? '' : S.orderFilter
    const orders = await API.listOrders({ role, providerIds, uid, status })

    return `
      <div class="page-head">
        <div class="page-title">我的订单</div>
        <div class="page-sub">${role === 'provider' ? '当前展示你接到的订单' : '当前展示你购买的服务订单'}</div>
      </div>

      <div class="filter-bar">
        ${ORDER_FILTERS.map((f) => `<button class="filter-chip ${S.orderFilter === f.k ? 'active' : ''}" data-of="${f.k}">${f.l}</button>`).join('')}
      </div>

      ${
        orders.length
          ? orders
              .map((o) => {
                const st = API.ORDER_STATUS[o.status] || { text: o.status, cls: 'badge-pending' }
                return `
          <a class="list-row" href="#/order/${o.id}">
            <div class="list-row-cover" style="background:${o.coverUrl ? 'transparent' : API.coverTheme(o.service_id)}">${o.coverUrl ? `<img class="list-row-cover-img" src="${API.esc(o.coverUrl)}" alt="" loading="lazy" />` : '<span>MG</span>'}</div>
            <div class="list-row-main">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="list-row-title ellipsis">${API.esc(o.title)}</span>
                <span class="badge ${st.cls}">${st.text}</span>
              </div>
              <div class="list-row-sub">
                <span>${API.esc(o.order_no)}</span>
                <span>·</span>
                <span>${API.fromNow(o.created_at)}</span>
                ${o.shoot_date ? `<span>·</span><span>期望 ${API.esc(o.shoot_date)}</span>` : ''}
              </div>
            </div>
            <div class="list-row-right">
              <div class="list-row-amount">¥${API.yuan(o.amount)}</div>
              <div class="list-row-time">查看进度 ›</div>
            </div>
          </a>`
              })
              .join('')
          : `<div class="empty"><div class="empty-icon">📋</div>
            <span class="empty-text">这里还没有订单</span>
            <span class="empty-hint">去首页看看有哪些服务</span>
            <a class="btn btn-soft" href="#/services">浏览服务</a></div>`
      }
    `
  }

  BINDINGS.orders = function () {
    const goLogin = $('#goLogin')
    if (goLogin) goLogin.addEventListener('click', openLogin)
    document.querySelectorAll('[data-of]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.orderFilter = btn.dataset.of
        render()
      })
    })
  }

  /* ---------------- 订单详情 ---------------- */

  VIEWS.order = async function (id) {
    if (!S.session || !S.session.user) {
      return `<div class="empty"><div class="empty-icon">🔒</div><span class="empty-text">登录后查看订单详情</span></div>`
    }
    const order = await API.getOrder(id)
    if (!order) {
      return `<div class="empty"><div class="empty-icon">📋</div><span class="empty-text">订单不存在</span></div>`
    }
    const [service, provider] = await Promise.all([
      API.getService(order.service_id),
      order.provider_id ? API.getProvider(order.provider_id) : Promise.resolve(null)
    ])
    const st = API.ORDER_STATUS[order.status] || { text: order.status, cls: 'badge-pending' }
    const uid = S.session.user.id
    const isCustomer = order.customer_id === uid
    const isProvider = !!S.provider && order.provider_id === S.provider.id
    const timeline = Array.isArray(order.timeline) ? order.timeline : []
    const p = provider || {}
    const svc = service || {}

    const actions = []
    if (isCustomer && order.status !== 'cancelled') {
      if (order.status !== 'completed') {
        actions.push('<button class="btn btn-ghost" id="cancelOrder">取消订单</button>')
      }
      if (order.status === 'delivered') actions.push('<button class="btn btn-primary" id="confirmOrder">确认完成</button>')
      if (order.status === 'completed') {
        const existing = await API.getReviewByOrder(order.id)
        actions.push(
          `<button class="btn btn-primary" id="writeReview">${existing ? '修改评价' : '写评价'}</button>`
        )
      }
    }
    if (isProvider) {
      if (order.status === 'taken') actions.push('<button class="btn btn-primary" id="startWork">开始制作</button>')
      if (order.status === 'producing') actions.push('<button class="btn btn-primary" id="deliver">交付成片</button>')
      if (order.status === 'open') actions.push('<button class="btn btn-soft" disabled>等待客户确认接单</button>')
    }

    return `
      <div class="page-head">
        <div style="display:flex;align-items:center;gap:14px">
          <span class="badge ${st.cls}" style="height:30px;font-size:14px;padding:0 16px;border-radius:15px">${st.text}</span>
          <span class="page-sub" style="margin:0">订单号 ${API.esc(order.order_no)}</span>
        </div>
      </div>

      <div class="order-layout">
        <div>
          <div class="card card-pad" style="margin-bottom:20px">
            <div class="block-title">订单进度</div>
            <div class="timeline">
              ${timeline
                .map(
                  (t, i) => `
                <div class="tl-item">
                  <div class="tl-dot-wrap">
                    <span class="tl-dot"></span>
                    ${i < timeline.length - 1 ? '<span class="tl-line"></span>' : ''}
                  </div>
                  <div class="tl-body">
                    <div class="tl-text">${API.esc(t.text)}</div>
                    <div class="tl-time">${API.fromNow(t.at)}</div>
                  </div>
                </div>`
                )
                .join('')}
            </div>
          </div>

          <div class="card card-pad">
            <div class="block-title">需求信息</div>
            <div class="spec-row"><span class="spec-label">订单标题</span><span class="spec-value">${API.esc(order.title)}</span></div>
            ${order.shoot_date ? `<div class="spec-row"><span class="spec-label">期望日期</span><span class="spec-value">${API.esc(order.shoot_date)}</span></div>` : ''}
            <div class="spec-row"><span class="spec-label">需求描述</span><span class="spec-value" style="line-height:1.75">${API.esc(order.requirement || '客户未填写额外要求')}</span></div>
            <div class="spec-row"><span class="spec-label">下单时间</span><span class="spec-value">${API.fromNow(order.created_at)}</span></div>
          </div>
        </div>

        <div>
          ${svc.title ? `<a class="card card-pad" style="margin-bottom:16px;display:block" href="#/service/${svc.id}">
            <div style="font-size:15px;font-weight:600" class="ellipsis">${API.esc(svc.title)}</div>
            <div class="muted ellipsis" style="margin-top:4px">${API.esc(svc.subtitle)}</div>
            <div style="margin-top:8px;color:var(--brand);font-weight:600">¥${API.yuanShort(svc.price)}</div>
          </a>` : ''}

          ${p.nickname ? `<div class="card card-pad" style="margin-bottom:16px;display:flex;gap:13px;align-items:center">
            <span class="avatar avatar-md">${API.esc(p.nickname.charAt(0))}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:600">${API.esc(p.nickname)}</div>
              <div class="muted" style="margin-top:3px">★ ${p.rating} · 完成 ${p.orders_done} 单</div>
            </div>
          </div>` : ''}

          <div class="card card-pad">
            <div class="fee-row"><span class="fee-label">服务金额</span><span class="fee-value">¥${API.yuan(order.amount)}</span></div>
            <div class="fee-row"><span class="fee-label">平台服务费</span><span class="fee-value fee-dim">¥${API.yuan(order.platform_fee)}</span></div>
            <div class="divider"></div>
            <div class="fee-row"><span class="fee-label fee-total-label">订单金额</span><span class="fee-total">¥${API.yuan(order.amount)}</span></div>
          </div>

          ${actions.length ? `<div style="display:flex;gap:10px;margin-top:18px">${actions.join('')}</div>` : ''}
        </div>
      </div>
    `
  }

  BINDINGS.order = function (id) {
    const advance = async (next, note) => {
      try {
        await API.advanceOrder(id, next, note, S.session.user.id)
        toast('操作成功')
        render()
      } catch (e) {
        toast(API.friendlyError(e))
      }
    }
    const cancelBtn = $('#cancelOrder')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (confirm('取消后需要重新下单，确定要取消吗？')) advance('cancelled')
      })
    }
    const confirmBtn = $('#confirmOrder')
    if (confirmBtn) confirmBtn.addEventListener('click', () => advance('completed'))
    const startBtn = $('#startWork')
    if (startBtn) startBtn.addEventListener('click', () => advance('producing'))
    const deliverBtn = $('#deliver')
    if (deliverBtn) deliverBtn.addEventListener('click', () => advance('delivered'))
    const reviewBtn = $('#writeReview')
    if (reviewBtn) {
      reviewBtn.addEventListener('click', async () => {
        try {
          await openReview(id)
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    }
  }

  /* ---------------- 人工客服 ---------------- */

  VIEWS.support = async function () {
    if (!S.session || !S.session.user) {
      return `<div class="card card-pad"><div class="empty">
        <div class="empty-icon">💬</div>
        <span class="empty-text">登录后联系人工客服</span>
        <span class="empty-hint">客服会在工作时间内回复</span>
        <button class="btn btn-primary btn-sm" id="supportLoginBtn" style="margin-top:16px">去登录</button>
      </div></div>`
    }

    // 取（或建）会话
    let conv = await API.createSupportConversation()
    if (!conv) {
      return `<div class="card card-pad"><div class="empty">
        <div class="empty-icon">💬</div>
        <span class="empty-text">发起咨询失败</span>
        <span class="empty-hint">请稍后重试，或拨打客服电话</span>
      </div></div>`
    }

    const detail = await API.getSupportConversation(conv.id)
    const messages = (detail && detail.messages) || []
    await API.markSupportRead(conv.id, 'customer')

    return `
      <div class="page-head support-head">
        <div>
          <div class="page-title">人工客服</div>
          <div class="page-sub">${API.esc(conv.subject || '在线咨询')} · 人工回复，非机器人</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="supportCloseBtn">结束会话</button>
      </div>

      <div class="support-layout">
        <div class="card support-chat">
          <div class="support-messages" id="supportMessages">
            <div class="msg-welcome">你好，这里是银川AIGC数字文化产业基地人工客服。有问题直接说，我们会尽快回复。</div>
            ${
              messages.length
                ? messages
                    .map(
                      (m) => `
              <div class="msg-row ${m.sender_role === 'customer' ? 'msg-row-mine' : ''}">
                <div class="msg-bubble ${m.sender_role === 'customer' ? 'msg-bubble-mine' : ''}">
                  ${m.sender_role === 'staff' ? `<div class="msg-sender">${API.esc(m.sender_name || '平台客服')}</div>` : ''}
                  <div class="msg-text">${API.esc(m.content)}</div>
                </div>
                <div class="msg-time">${API.fromNow(m.created_at)}</div>
              </div>`
                    )
                    .join('')
                : '<div class="msg-row msg-row-mine"><div class="msg-bubble msg-bubble-mine msg-bubble-hint"><div class="msg-text">发消息描述你的问题</div></div></div>'
            }
          </div>
          <div class="support-input">
            <textarea
              class="support-input-field"
              id="supportInput"
              rows="2"
              maxlength="500"
              placeholder="描述你的问题…"
            ></textarea>
            <button class="btn btn-primary" id="supportSendBtn">发送</button>
          </div>
        </div>
      </div>
    `
  }

  /* ---------------- 会员中心 ---------------- */

  VIEWS.membership = async function () {
    const session = S.session
    if (!session || !session.user) {
      return `
        <div class="page-head">
          <div><div class="page-title">会员中心</div><div class="page-sub">开通会员后才能接单、发布服务</div></div>
        </div>
        <div class="card card-pad" style="text-align:center;padding:48px 24px">
          <div style="font-size:44px">👑</div>
          <div class="empty-text" style="margin-top:12px">登录后查看会员状态与套餐</div>
          <button class="btn btn-primary" id="memLoginBtn" style="margin-top:20px">去登录</button>
        </div>`
    }
    const uid = session.user.id
    const [plans, status, deposit, orders] = await Promise.all([
      API.listMemberPlans(),
      API.getMyMemberStatus(uid),
      API.getMyMemberDeposit(uid),
      API.listMyMemberOrders(uid, 10)
    ])
    S.memberPlans = plans
    S.memberStatus = status
    S.memberDeposit = deposit
    S.memberOrders = orders

    const yuan = (c) => (Number(c || 0) / 100).toFixed(0)
    const tierName = { basic: '基础会员', pro: '专业会员', studio: '工作室会员' }
    const selected = plans[0] ? plans[0].code : ''

    return `
      <div class="page-head">
        <div>
          <div class="page-title">会员中心</div>
          <div class="page-sub">开通会员后才能接单、发布服务</div>
        </div>
      </div>

      <div class="card mem-card ${status.isMember ? '' : 'mem-card-off'}">
        ${
          status.isMember
            ? `
          <div class="mem-card-top">
            <div>
              <div class="mem-card-title">${API.esc(status.planName)}</div>
              <div class="mem-card-sub">有效期至 ${String(status.expireAt).slice(0, 10)}</div>
            </div>
            <div class="mem-card-days"><span>${status.daysLeft}</span> 天</div>
          </div>
          <div class="mem-perks">
            <div class="mem-perk"><span class="mem-perk-label">接单佣金</span><span class="mem-perk-value">${status.commissionRate === null ? '--' : (status.commissionRate * 100).toFixed(0)}%</span></div>
            <div class="mem-perk"><span class="mem-perk-label">在架上限</span><span class="mem-perk-value">${status.maxServices} 个</span></div>
            <div class="mem-perk"><span class="mem-perk-label">接单资格</span><span class="mem-perk-value mem-perk-ok">已开通</span></div>
          </div>`
            : `
          <div class="mem-card-top">
            <div>
              <div class="mem-card-title">未开通会员</div>
              <div class="mem-card-sub">开通会员后才能接单、发布服务</div>
            </div>
            <div style="font-size:34px">🔒</div>
          </div>`
        }
      </div>

      ${
        deposit
          ? `
      <div class="card card-pad" style="margin-top:20px">
        <div class="mem-dep">
          <div>
            <div class="mem-dep-amount">¥${yuan(deposit.amount_cents)}</div>
            <div class="mem-dep-label">保证金（冻结中，可退）</div>
          </div>
          <span class="badge badge-pending">冻结中</span>
        </div>
        <div class="mem-note">保证金用于保障订单履约，退出接单或平台解约时可原路退还。</div>
      </div>`
          : ''
      }

      <div class="section">
        <div class="section-title">选择套餐</div>
        <div class="mem-plans">
          ${
            plans
              .map(
                (p) => `
            <div class="mem-plan" data-plan="${API.esc(p.code)}">
              <div class="mem-plan-top">
                <div class="mem-plan-left">
                  <div class="mem-plan-name">${API.esc(p.name)}</div>
                  <div class="mem-plan-desc">${API.esc(p.description || '')}</div>
                </div>
                <div class="mem-plan-price"><span class="mem-plan-num">¥${yuan(p.price_cents)}</span><span class="mem-plan-unit">/${p.period_days >= 365 ? '年' : p.period_days >= 90 ? '季' : '月'}</span></div>
              </div>
              <div class="mem-plan-fees">
                <span class="mem-fee">保证金 ¥${yuan(p.deposit_cents)}</span>
                <span class="mem-fee">入驻费 ¥${yuan(p.onboarding_fee_cents)}</span>
                <span class="mem-fee">佣金 ${(Number(p.commission_rate) * 100).toFixed(0)}%</span>
              </div>
              <ul class="mem-plan-benefits">
                ${(p.benefits || []).map((b) => `<li>✓ ${API.esc(b)}</li>`).join('')}
              </ul>
            </div>`
              )
              .join('')
          }
        </div>
        <button class="btn btn-primary btn-block" id="memSubscribeBtn" style="margin-top:20px" data-plan="${API.esc(selected)}">
          ${status.isMember ? '续费一个月' : '开通会员'}
        </button>
        <div class="mem-note" style="text-align:center;margin-top:14px">
          首次开通需一次性支付会员费、保证金与入驻费。保证金可退，会员费按月计。
        </div>
      </div>

      ${
        orders.length
          ? `
      <div class="section">
        <div class="section-title">开通记录</div>
        <div class="card">
          <table class="data">
            <thead><tr><th>套餐</th><th>订单号</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              ${orders
                .map(
                  (o) => `
                <tr>
                  <td class="td-strong">${API.esc(o.plan_name)}</td>
                  <td class="muted">${API.esc(o.order_no)}</td>
                  <td>¥${yuan(o.amount_cents)}</td>
                  <td><span class="badge ${o.status === 'paid' ? '' : 'badge-pending'}">${o.status === 'paid' ? '已支付' : o.status === 'pending' ? '待支付' : API.esc(o.status)}</span></td>
                  <td class="muted">${API.fromNow(o.created_at)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`
          : ''
      }
    `
  }

  /* ---------------- 我的 ---------------- */

  VIEWS.profile = async function () {
    const session = S.session
    if (!session || !session.user) {
      return `
        <div class="page-head">
          <div><div class="page-title">我的</div><div class="page-sub">查看资料、订单、会员与服务</div></div>
        </div>
        <div class="card card-pad" style="text-align:center;padding:48px 24px">
          <div style="font-size:44px">👤</div>
          <div class="empty-text" style="margin-top:12px">登录后管理你的资料与订单</div>
          <button class="btn btn-primary" id="profileLoginBtn" style="margin-top:20px">去登录</button>
        </div>`
    }

    const uid = session.user.id
    const [myProfile, memberStatus, provider] = await Promise.all([
      API.getMyProfile(uid),
      API.getMyMemberStatus(uid),
      API.getMyProvider(uid).catch(() => null)
    ])

    // 订单统计
    let orderCount = 0
    let income = 0
    try {
      const orders = provider
        ? await API.listOrders({ role: 'provider', providerIds: [provider.id], limit: 100 })
        : await API.listOrders({ role: 'customer', uid, limit: 100 })
      orderCount = orders.length
      income = orders
        .filter((o) => o.status === 'completed')
        .reduce((s, o) => s + (Number(o.amount || 0) - Number(o.platform_fee || 0)), 0)
    } catch (e) { /* 忽略 */ }

    const completeness = API.profileCompleteness(myProfile)
    const missing = API.profileMissing(myProfile)
    const nickname = myProfile.nickname || session.user.name || '未设置昵称'
    const isMember = !!(memberStatus && memberStatus.isMember)

    // 头像存的是存储路径，显示时转签名地址
    let avatarUrl = ''
    if (myProfile.avatar_url) {
      if (String(myProfile.avatar_url).startsWith('http')) {
        avatarUrl = myProfile.avatar_url
      } else {
        try {
          avatarUrl = await window.SAMPLES.signedUrl(myProfile.avatar_url, 7200)
        } catch (e) { /* 忽略 */ }
      }
    }

    return `
      <div class="page-head">
        <div><div class="page-title">我的</div><div class="page-sub">资料、订单、会员与服务都在这里</div></div>
      </div>

      <!-- 资料卡 -->
      <div class="card card-pad prof-hero">
        <div class="prof-avatar">
          ${myProfile.avatar_url ? `<img src="${API.esc(myProfile.avatar_url)}" alt="" />` : `<span>${API.esc(nickname.charAt(0))}</span>`}
        </div>
        <div class="prof-hero-body">
          <div class="prof-hero-name">
            ${API.esc(nickname)}
            ${isMember ? '<span class="badge badge-pending">会员</span>' : ''}
            ${provider ? '<span class="badge">服务者</span>' : '<span class="badge">客户</span>'}
          </div>
          <div class="prof-hero-sub">${API.esc(myProfile.bio || (myProfile.city ? '所在地：' + myProfile.city : '还没有填写简介'))}</div>
        </div>
        <button class="btn btn-soft btn-sm" id="profEditBtn">编辑资料</button>
      </div>

      <!-- 完整度 -->
      ${
        completeness < 100
          ? `
      <div class="card card-pad" style="margin-top:16px">
        <div class="prof-prog-head">
          <span class="prof-prog-title">资料完整度 ${completeness}%</span>
          <span class="prof-prog-hint">还差 ${API.esc(missing.join('、'))}</span>
        </div>
        <div class="prof-prog-bar"><div class="prof-prog-fill" style="width:${completeness}%"></div></div>
      </div>`
          : ''
      }

      <!-- 统计 -->
      <div class="stat-grid" style="margin-top:16px">
        <div class="stat-card"><div class="stat-value">${orderCount}</div><div class="stat-label">订单</div></div>
        ${provider ? `<div class="stat-card"><div class="stat-value stat-income">¥${API.yuanShort(income)}</div><div class="stat-label">累计收入</div></div>` : ''}
        <div class="stat-card"><div class="stat-value">${provider ? provider.orders_done : '—'}</div><div class="stat-label">完成单量</div></div>
        <div class="stat-card"><div class="stat-value">${isMember ? memberStatus.daysLeft : '—'}</div><div class="stat-label">会员剩余天数</div></div>
        <div class="stat-card"><div class="stat-value">${isMember ? (Number(memberStatus.commissionRate) * 100).toFixed(0) + '%' : '—'}</div><div class="stat-label">我的佣金率</div></div>
      </div>

      <!-- 会员卡 -->
      <div class="mem-banner ${isMember ? '' : 'mem-banner-off'}" style="margin-top:20px">
        <div class="mem-banner-left">
          <div class="mem-banner-title">${isMember ? API.esc(memberStatus.planName) : '未开通会员'}</div>
          <div class="mem-banner-sub">${isMember ? `有效期至 ${String(memberStatus.expireAt).slice(0, 10)}` : '开通会员后才能接单、发布服务'}</div>
        </div>
        <a class="mem-banner-badge" href="#/membership">${isMember ? '👑' : '🔒'}</a>
      </div>

      <!-- 功能菜单 -->
      <div class="card" style="margin-top:16px">
        <a class="menu-row" href="#/orders"><span class="menu-row-icon">📋</span><span class="menu-row-text">我的订单</span><span class="menu-row-arrow">›</span></a>
        <a class="menu-row" href="#/studio"><span class="menu-row-icon">🎬</span><span class="menu-row-text">接单工作台</span><span class="menu-row-arrow">›</span></a>
        <a class="menu-row" href="#/membership"><span class="menu-row-icon">👑</span><span class="menu-row-text">会员中心</span><span class="menu-row-value">${isMember ? API.esc(memberStatus.planName) : '未开通'}</span><span class="menu-row-arrow">›</span></a>
        <a class="menu-row" href="#/notifications"><span class="menu-row-icon">🔔</span><span class="menu-row-text">消息通知</span><span class="menu-row-arrow">›</span></a>
        <a class="menu-row" href="#/support"><span class="menu-row-icon">💬</span><span class="menu-row-text">在线客服</span><span class="menu-row-arrow">›</span></a>
        <button class="menu-row" id="profLogoutBtn"><span class="menu-row-icon">↪️</span><span class="menu-row-text">退出登录</span><span class="menu-row-arrow">›</span></button>
      </div>

      <div class="prof-foot">宁夏云辇文化科技有限公司 · 让每一次心动都有画面</div>
    `
  }

  BINDINGS.profile = function () {
    const loginBtn = $('#profileLoginBtn')
    if (loginBtn) loginBtn.addEventListener('click', () => openLogin())

    const editBtn = $('#profEditBtn')
    if (editBtn) editBtn.addEventListener('click', openProfileEditor)

    const logoutBtn = $('#profLogoutBtn')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (!confirm('确定要退出登录吗？')) return
        try {
          await API.signOut()
          S.session = null
          S.provider = null
          updateUserChip()
          toast('已退出登录')
          navigate('#/')
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    }
  }

  /**
   * 个人资料编辑弹层
   *
   * 注意：交互绑定必须在 openAction 之后立刻做（弹层一打开就能点），
   * 不能放进 onOk 回调里 —— 那样用户点标签时监听器还没绑上，点了没反应。
   */
  function openProfileEditor() {
    const session = S.session
    if (!session || !session.user) {
      openLogin()
      return
    }
    const uid = session.user.id
    const TAG_PRESETS = ['婚礼跟拍', '婚礼微电影', '商业摄影', '产品短视频', 'MV拍摄', '人像写真', '活动记录', '亲子拍摄']
    const CITIES = ['银川', '北京', '上海', '广州', '深圳', '杭州', '成都', '西安', '武汉', '南京', '重庆', '天津', '苏州', '郑州', '长沙', '青岛', '厦门', '济南', '福州', '合肥', '远程', '其他']

    API.getMyProfile(uid)
      .then(async (p) => {
        const tags = p.tags || []
        // 已有头像转签名地址
        let avatarDisplay = ''
        if (p.avatar_url) {
          avatarDisplay = String(p.avatar_url).startsWith('http')
            ? p.avatar_url
            : await window.SAMPLES.signedUrl(p.avatar_url, 7200)
        }
        const tagHtml = tags
          .map((t) => `<span class="tag tag-removable" data-remove-tag="${API.esc(t)}">${API.esc(t)} <b>×</b></span>`)
          .join('')
        const presetHtml = TAG_PRESETS.map(
          (t) => `<span class="tag ${tags.indexOf(t) >= 0 ? 'tag-on' : ''}" data-add-tag="${API.esc(t)}">${API.esc(t)}</span>`
        ).join('')
        const cityOptions = CITIES.map(
          (c) => `<option value="${API.esc(c)}" ${c === (p.city || '银川') ? 'selected' : ''}>${API.esc(c)}</option>`
        ).join('')

        // 会话级状态：头像路径与标签在弹层生命周期内共享
        let avatarPath = p.avatar_url || ''
        const current = tags.slice()

        openAction(
          '编辑个人资料',
          `
        <div class="form-row" style="display:flex;align-items:center;gap:16px">
          <div class="pf-avatar-edit">
            ${avatarDisplay ? `<img id="pfAvatarImg" src="${API.esc(avatarDisplay)}" alt="" />` : `<span id="pfAvatarPh">${API.esc((p.nickname || session.user.name || '?').charAt(0))}</span>`}
          </div>
          <div style="flex:1">
            <input type="file" id="pfAvatarFile" accept="image/png,image/jpeg" style="display:none" />
            <button class="btn btn-soft btn-sm" id="pfPickAvatar">选择头像</button>
            <div class="field-hint">JPG/PNG，不超过 5MB</div>
          </div>
        </div>
        <div class="form-row">
          <label class="field-label">昵称 *</label>
          <input class="input" id="pfNickname" maxlength="20" value="${API.esc(p.nickname || session.user.name || '')}" placeholder="给自己起个名字" />
        </div>
        <div class="form-row">
          <label class="field-label">所在城市</label>
          <select class="input" id="pfCity">${cityOptions}</select>
        </div>
        <div class="form-row">
          <label class="field-label">手机号</label>
          <input class="input" id="pfPhone" maxlength="11" value="${API.esc(p.phone || '')}" placeholder="用于接单通知，可不填" />
        </div>
        <div class="form-row">
          <label class="field-label">个人简介</label>
          <textarea class="textarea" id="pfBio" maxlength="200" placeholder="介绍一下你的从业经历、风格与擅长场景">${API.esc(p.bio || '')}</textarea>
        </div>
        <div class="form-row">
          <label class="field-label">擅长方向（最多 8 个）</label>
          <div class="tag-list" id="pfTags">${tagHtml}</div>
          <div class="tag-list" style="margin-top:10px">${presetHtml}</div>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" id="pfShowPhone" ${p.show_phone ? 'checked' : ''} />
          <span>对客户公开手机号</span>
        </label>
        <label class="checkbox-row">
          <input type="checkbox" id="pfShowCity" ${p.show_city !== false ? 'checked' : ''} />
          <span>公开所在城市</span>
        </label>
      `,
          async () => {
            await API.saveMyProfile(uid, {
              nickname: ($('#pfNickname') || {}).value || '',
              city: ($('#pfCity') || {}).value || '银川',
              phone: ($('#pfPhone') || {}).value || '',
              bio: ($('#pfBio') || {}).value || '',
              tags: current,
              avatar_url: avatarPath || null,
              show_phone: !!($('#pfShowPhone') || {}).checked,
              show_city: !!($('#pfShowCity') || {}).checked
            })
            toast('资料已保存')
            render()
          }
        )

        // ---- 弹层打开后立刻绑定交互 ----

        // 头像：选文件 → 上传 → 拿到路径
        const pickBtn = $('#pfPickAvatar')
        const fileInput = $('#pfAvatarFile')
        if (pickBtn && fileInput) {
          pickBtn.addEventListener('click', () => fileInput.click())
          fileInput.addEventListener('change', async () => {
            const f = fileInput.files && fileInput.files[0]
            if (!f) return
            pickBtn.disabled = true
            pickBtn.textContent = '上传中…'
            try {
              avatarPath = await API.uploadAvatar(uid, f)
              const img = $('#pfAvatarImg')
              const ph = $('#pfAvatarPh')
              if (img) img.src = URL.createObjectURL(f)
              else if (ph) ph.outerHTML = `<img id="pfAvatarImg" src="${URL.createObjectURL(f)}" alt="" />`
              toast('头像已上传')
            } catch (e) {
              toast(API.friendlyError(e))
            } finally {
              pickBtn.disabled = false
              pickBtn.textContent = '选择头像'
            }
          })
        }

        // 标签：预设点击切换
        const tagBox = $('#pfTags')
        const renderTags = () => {
          if (!tagBox) return
          tagBox.innerHTML = current
            .map((t) => `<span class="tag tag-removable" data-remove-tag="${API.esc(t)}">${API.esc(t)} <b>×</b></span>`)
            .join('')
          bindRemoveTags()
        }
        const bindRemoveTags = () => {
          document.querySelectorAll('[data-remove-tag]').forEach((el) => {
            el.addEventListener('click', () => {
              const v = el.dataset.removeTag
              const idx = current.indexOf(v)
              if (idx >= 0) current.splice(idx, 1)
              const preset = document.querySelector(`[data-add-tag="${v}"]`)
              if (preset) preset.classList.remove('tag-on')
              renderTags()
            })
          })
        }
        document.querySelectorAll('[data-add-tag]').forEach((el) => {
          el.addEventListener('click', () => {
            const v = el.dataset.addTag
            const idx = current.indexOf(v)
            if (idx >= 0) {
              current.splice(idx, 1)
              el.classList.remove('tag-on')
            } else {
              if (current.length >= 8) {
                toast('最多 8 个标签')
                return
              }
              current.push(v)
              el.classList.add('tag-on')
            }
            renderTags()
          })
        })
        bindRemoveTags()
      })
      .catch((e) => toast(API.friendlyError(e)))
  }



  BINDINGS.membership = function () {
    const loginBtn = $('#memLoginBtn')
    if (loginBtn) loginBtn.addEventListener('click', () => openLogin())

    // 选中套餐
    let selectedPlan = S.memberPlans && S.memberPlans[0] ? S.memberPlans[0].code : ''
    document.querySelectorAll('[data-plan]').forEach((el) => {
      if (el.classList.contains('mem-plan')) {
        el.addEventListener('click', () => {
          document.querySelectorAll('.mem-plan').forEach((x) => x.classList.remove('mem-plan-on'))
          el.classList.add('mem-plan-on')
          selectedPlan = el.dataset.plan
          const btn = $('#memSubscribeBtn')
          if (btn) btn.dataset.plan = selectedPlan
        })
      }
    })
    if (S.memberPlans && S.memberPlans[0]) {
      const first = document.querySelector('.mem-plan')
      if (first) first.classList.add('mem-plan-on')
    }

    const subBtn = $('#memSubscribeBtn')
    if (subBtn) {
      subBtn.addEventListener('click', async () => {
        const uid = S.session && S.session.user ? S.session.user.id : ''
        if (!uid) {
          openLogin()
          return
        }
        subBtn.disabled = true
        subBtn.textContent = '生成订单中…'
        try {
          const res = await API.createMemberOrder(uid, selectedPlan)
          const b = res.breakdown
          const yuan = (c) => (Number(c || 0) / 100).toFixed(2)
          openAction('确认开通会员', `
            <div class="pay-lines">
              <div class="pay-line"><span class="pay-label">会员费</span><span class="pay-value">¥${yuan(b.membership)}</span></div>
              ${b.deposit ? `<div class="pay-line"><span class="pay-label">保证金（可退）</span><span class="pay-value">¥${yuan(b.deposit)}</span></div>` : ''}
              ${b.onboarding ? `<div class="pay-line"><span class="pay-label">入驻费（一次性）</span><span class="pay-value">¥${yuan(b.onboarding)}</span></div>` : ''}
              <div class="pay-line pay-line-total"><span class="pay-label">合计</span><span class="pay-value">¥${yuan(b.total)}</span></div>
              <div class="pay-line"><span class="pay-label">会员有效期</span><span class="pay-value">${b.periodDays} 天</span></div>
            </div>
            <div class="mem-note" style="margin-top:16px">
              支付通道暂未开通。订单号 <b>${API.esc(res.order.order_no)}</b>，付款后由平台在后台确认开通。
            </div>
          `, async () => {
            toast('订单已提交，平台确认后开通')
            render()
          }, '我已付款')
        } catch (e) {
          toast(API.friendlyError(e))
        } finally {
          subBtn.disabled = false
          subBtn.textContent = S.memberStatus && S.memberStatus.isMember ? '续费一个月' : '开通会员'
        }
      })
    }
  }

  BINDINGS.support = function () {
    const loginBtn = $('#supportLoginBtn')
    if (loginBtn) loginBtn.addEventListener('click', openLogin)

    const input = $('#supportInput')
    const sendBtn = $('#supportSendBtn')
    if (!input || !sendBtn) return

    const doSend = async () => {
      const content = input.value.trim()
      if (!content) return
      sendBtn.disabled = true
      try {
        const convs = await API.listMySupportConversations()
        const conv = convs[0]
        if (!conv) throw new Error('会话不存在')
        await API.sendSupportMessage(conv.id, content, 'customer')
        input.value = ''
        render()
      } catch (e) {
        toast(API.friendlyError(e))
      } finally {
        sendBtn.disabled = false
      }
    }

    sendBtn.addEventListener('click', doSend)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSend()
    })

    const closeBtn = $('#supportCloseBtn')
    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        if (!confirm('结束后客服将无法继续回复，如需再次咨询可重新发起。确定结束？')) return
        try {
          const convs = await API.listMySupportConversations()
          if (convs[0]) await API.closeSupportConversation(convs[0].id)
          toast('会话已结束')
          render()
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    }

    // 滚到底部
    const box = $('#supportMessages')
    if (box) box.scrollTop = box.scrollHeight
  }

  /* ---------------- 消息通知 ---------------- */

  VIEWS.notifications = async function () {
    if (!S.session || !S.session.user) {
      return `<div class="card card-pad"><div class="empty">
        <div class="empty-icon">🔔</div>
        <span class="empty-text">登录后查看消息</span>
        <span class="empty-hint">接单、交付、审核结果都会在这里提醒你</span>
        <button class="btn btn-primary btn-sm" id="notifyLoginBtn" style="margin-top:16px">去登录</button>
      </div></div>`
    }

    const rows = await API.listNotifications(60)
    const typeText = { order: '订单', system: '系统', review: '评价', apply: '审核' }
    const unread = rows.filter((n) => !n.is_read).length

    return `
      <div class="page-head">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="page-title">消息通知</div>
          ${unread ? `<span class="badge badge-pending">${unread} 条未读</span>` : ''}
        </div>
        ${unread ? '<button class="btn btn-ghost btn-sm" id="readAllBtn">全部已读</button>' : ''}
      </div>

      ${
        rows.length
          ? `<div class="card notify-list">${rows
              .map(
                (n) => `
          <div class="notify-item ${n.is_read ? '' : 'notify-unread'}" data-id="${n.id}"
               ${n.link_type ? `data-link-type="${API.esc(n.link_type)}" data-link-id="${API.esc(n.link_id || '')}"` : ''}>
            ${n.is_read ? '' : '<span class="notify-dot"></span>'}
            <div class="notify-body">
              <div class="notify-head">
                <span class="notify-title">${API.esc(n.title)}</span>
                <span class="notify-type">${API.esc(typeText[n.type] || '通知')}</span>
              </div>
              ${n.body ? `<div class="notify-text">${API.esc(n.body)}</div>` : ''}
              <div class="notify-time">${API.fromNow(n.created_at)}</div>
            </div>
          </div>`
              )
              .join('')}</div>`
          : `<div class="card card-pad"><div class="empty">
        <div class="empty-icon">📭</div>
        <span class="empty-text">暂时没有新消息</span>
        <span class="empty-hint">接单与订单进展会在这里提醒你</span>
      </div></div>`
      }
    `
  }

  BINDINGS.notifications = function () {
    const loginBtn = $('#notifyLoginBtn')
    if (loginBtn) loginBtn.addEventListener('click', openLogin)

    const readAllBtn = $('#readAllBtn')
    if (readAllBtn) {
      readAllBtn.addEventListener('click', async () => {
        try {
          const n = await API.markAllNotificationsRead()
          toast(n ? `已标记 ${n} 条为已读` : '没有未读消息')
          render()
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    }

    document.querySelectorAll('.notify-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = Number(el.dataset.id)
        if (el.classList.contains('notify-unread')) {
          try {
            await API.markNotificationRead(id)
          } catch (e) {
            // 标记失败不阻断跳转
          }
        }
        const linkType = el.dataset.linkType
        const linkId = el.dataset.linkId
        if (linkType === 'order' && linkId) {
          navigate(`/order/${linkId}`)
        } else {
          render()
        }
      })
    })
  }

  /* ---------------- 需求大厅 ---------------- */

  VIEWS.hall = async function () {
    const orders = await API.listOpenOrders()
    return `
      <div class="page-head">
        <div class="page-title">需求大厅</div>
        <div class="page-sub">客户公开发布的需求，任何服务者都可以接单。先接先得</div>
      </div>

      ${
        orders.length
          ? `<div class="hall-grid">${orders
              .map((o) => {
                const svc = o.service_id
                return `
          <div class="card hall-card">
            <div class="hall-head">
              <span class="hall-title ellipsis">${API.esc(o.title)}</span>
              <span class="hall-amount">¥${API.yuan(o.amount)}</span>
            </div>
            <div class="hall-req ellipsis-2">${API.esc(o.requirement || '客户未填写额外要求')}</div>
            <div class="hall-meta">
              <span>${API.esc(o.customer_name || '匿名客户')}</span>
              <span>·</span>
              <span>${API.fromNow(o.created_at)}</span>
              ${o.shoot_date ? `<span>·</span><span>期望 ${API.esc(o.shoot_date)}</span>` : ''}
            </div>
            <div class="hall-actions">
              <a class="btn btn-ghost" href="#/order/${o.id}">查看详情</a>
              <button class="btn btn-primary" data-claim="${o.id}">我要接单</button>
            </div>
          </div>`
              })
              .join('')}</div>`
          : `<div class="empty"><div class="empty-icon">📭</div>
            <span class="empty-text">需求大厅暂时是空的</span>
            <span class="empty-hint">客户发布公开需求后会出现在这里</span></div>`
      }
    `
  }

  BINDINGS.hall = function () {
    document.querySelectorAll('[data-claim]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!S.session || !S.session.user) {
          openLogin()
          return
        }
        if (!S.provider) {
          if (!confirm('你还不是服务者，接单前需要先开通服务者身份。是否现在开通？')) return
          navigate('#/studio?tab=identity')
          return
        }
        if (!confirm('接单后客户会看到你的服务信息，请尽快联系客户沟通细节。确认接单？')) return
        try {
          await API.takeOrder(Number(btn.dataset.claim), S.provider.id, S.session.user.id)
          toast('接单成功')
          render()
        } catch (e) {
          toast(API.friendlyError(e))
          render()
        }
      })
    })
  }

  /* ---------------- 工作台 ---------------- */

  VIEWS.studio = async function (id, query) {
    if (query.tab === 'identity') S.studioTab = 'identity'
    const uid = S.session && S.session.user.id

    if (!uid) {
      return `<div class="empty"><div class="empty-icon">🎬</div>
        <span class="empty-text">登录后进入接单工作台</span>
        <span class="empty-hint">接单、上架服务、查看收益</span>
        <button class="btn btn-primary" id="goLogin2">去登录</button></div>`
    }

    if (!S.provider) {
      return `
        <div class="page-head">
          <div class="page-title">接单工作台</div>
          <div class="page-sub">开通服务者身份后即可接单、上架服务、查看收益</div>
        </div>
        <div class="form-panel">
          <div class="card card-pad">
            <div class="block-title">开通服务者身份</div>
            <div class="field">
              <label class="field-label">服务者名称</label>
              <input class="input" id="pNickname" maxlength="20" placeholder="例如：晨末映画">
            </div>
            <div class="form-row">
              <div class="field">
                <label class="field-label">所在城市</label>
                <input class="input" id="pCity" maxlength="20" value="银川" placeholder="如 银川 / 北京 / 成都；远程服务可填「远程」" />
                <div class="preset-row">
                  ${CITY_PRESETS.map((c) => `<span class="preset-chip" data-city="${API.esc(c)}">${API.esc(c)}</span>`).join('')}
                </div>
              </div>
              <div class="field">
                <label class="field-label">擅长方向</label>
                <input class="input" id="pTags" maxlength="60" placeholder="补充细分技能，如 婚礼跟拍、航拍、字幕包装" />
              </div>
            </div>
            <div class="field">
              <label class="field-label">专业方向（可多选）</label>
              <div class="role-list">
                ${ROLE_PRESETS.map((r) => `<span class="role-chip" data-role="${API.esc(r.name)}"><span class="role-chip-icon">${r.icon}</span>${API.esc(r.name)}</span>`).join('')}
              </div>
              <div class="field-hint">选了哪个方向，客户就能按这个方向找到你</div>
            </div>
            <div class="field">
              <label class="field-label">个人简介</label>
              <textarea class="textarea" id="pBio" maxlength="200" placeholder="介绍你的从业年限、风格、擅长场景，让客户更信任你"></textarea>
            </div>
            <button class="btn btn-primary btn-block" id="becomeProvider">开通身份</button>
          </div>
        </div>
      `
    }

    const [claimable, myOrders, myServices] = await Promise.all([
      API.listOpenOrders(),
      API.listOrders({ role: 'provider', providerIds: [S.provider.id], limit: 60 }),
      API.listMyServices(S.provider.id)
    ])
    const pending = myOrders.filter((o) => ['open', 'taken'].includes(o.status)).length
    const doing = myOrders.filter((o) => ['producing', 'delivered'].includes(o.status)).length
    const done = myOrders.filter((o) => o.status === 'completed').length
    const income = myOrders
      .filter((o) => o.status === 'completed')
      .reduce((s, o) => s + (Number(o.amount || 0) - Number(o.platform_fee || 0)), 0)

    // 会员状态与我的佣金率
    let memberStatus = null
    let commissionRate = 0
    try {
      const settings = S.settings || (await API.getSettings())
      const comm = await API.getProviderCommission(S.provider.id, settings.commission_rate)
      commissionRate = Math.round(Number(comm.rate || 0) * 100)
    } catch (e) { /* 忽略 */ }
    try {
      memberStatus = await API.getMyMemberStatus(S.session.user.id)
    } catch (e) { /* 忽略 */ }
    const isMember = !!(memberStatus && memberStatus.isMember)

    const tabs = [
      { k: 'hall', l: `需求大厅${claimable.length ? ` (${claimable.length})` : ''}` },
      { k: 'orders', l: '我的订单' },
      { k: 'services', l: '我的服务' },
      { k: 'publish', l: '上架服务' }
    ]

    let content = ''
    if (S.studioTab === 'hall') {
      content = claimable.length
        ? `<div class="hall-grid">${claimable
            .map(
              (o) => `
        <div class="card hall-card">
          <div class="hall-head">
            <span class="hall-title ellipsis">${API.esc(o.title)}</span>
            <span class="hall-amount">¥${API.yuan(o.amount)}</span>
          </div>
          <div class="hall-req ellipsis-2">${API.esc(o.requirement || '客户未填写额外要求')}</div>
          <div class="hall-meta">
            <span>${API.esc(o.customer_name || '匿名客户')}</span><span>·</span>
            <span>${API.fromNow(o.created_at)}</span>
          </div>
          <div class="hall-actions">
            <a class="btn btn-ghost" href="#/order/${o.id}">查看详情</a>
            <button class="btn btn-primary" data-claim2="${o.id}">我要接单</button>
          </div>
        </div>`
            )
            .join('')}</div>`
        : `<div class="empty"><div class="empty-icon">📭</div>
            <span class="empty-text">需求大厅暂时是空的</span>
            <span class="empty-hint">客户发布需求后会出现在这里</span></div>`
    } else if (S.studioTab === 'orders') {
      content = myOrders.length
        ? myOrders
            .map((o) => {
              const st = API.ORDER_STATUS[o.status] || { text: o.status, cls: 'badge-pending' }
              return `
        <a class="list-row" href="#/order/${o.id}">
          <div class="list-row-cover" style="background:${o.coverUrl ? 'transparent' : API.coverTheme(o.service_id)}">${o.coverUrl ? `<img class="list-row-cover-img" src="${API.esc(o.coverUrl)}" alt="" loading="lazy" />` : '<span>MG</span>'}</div>
          <div class="list-row-main">
            <div style="display:flex;align-items:center;gap:12px">
              <span class="list-row-title ellipsis">${API.esc(o.title)}</span>
              <span class="badge ${st.cls}">${st.text}</span>
            </div>
            <div class="list-row-sub">
              <span>客户 ${API.esc(o.customer_name || '匿名')}</span><span>·</span>
              <span>${API.fromNow(o.created_at)}</span>
            </div>
          </div>
          <div class="list-row-right">
            <div class="list-row-amount" style="color:var(--olive)">¥${API.yuan(Number(o.amount) - Number(o.platform_fee))}</div>
            <div class="list-row-time">处理订单 ›</div>
          </div>
        </a>`
            })
            .join('')
        : `<div class="empty"><div class="empty-icon">📋</div>
            <span class="empty-text">还没有接到订单</span>
            <span class="empty-hint">去需求大厅看看</span></div>`
    } else if (S.studioTab === 'services') {
      const mySamples = await API.listProviderSamples(S.provider.id)
      content = myServices.length
        ? `<div class="svc-grid">${myServices
            .map((s) => {
              const count = mySamples.filter((x) => x.service_id === s.id).length
              return `
        <div class="card svc-card">
          <div class="svc-cover" style="background:${API.coverTheme(s.id)}">
            <span class="svc-cover-mark">MG</span>
            <span class="svc-cover-badge">${s.status === 'on' ? '已上架' : '已下架'}</span>
          </div>
          <div class="svc-body">
            <span class="svc-title ellipsis">${API.esc(s.title)}</span>
            <span class="svc-sub ellipsis">${API.esc(s.subtitle)}</span>
            <div class="svc-meta"><span>★ ${s.rating}</span><span class="svc-meta-dot">·</span><span>已售 ${s.sales_count}</span><span class="svc-meta-dot">·</span><span>${count} 个样片</span></div>
            <div class="svc-foot">
              <span class="price"><span class="price-value">¥${API.yuanShort(s.price)}</span></span>
              <span style="display:flex;gap:8px">
                <button class="btn btn-soft btn-sm" data-upload-sample="${s.id}" data-name="${API.esc(s.title)}">上传样片</button>
                <button class="btn btn-ghost btn-sm" data-toggle="${s.id}" data-next="${s.status === 'on' ? 'off' : 'on'}">${s.status === 'on' ? '下架' : '上架'}</button>
              </span>
            </div>
          </div>
        </div>`
            })
            .join('')}</div>`
        : `<div class="empty"><div class="empty-icon">🧩</div>
            <span class="empty-text">还没有上架服务</span>
            <span class="empty-hint">上架后客户就能看到并下单</span>
            <button class="btn btn-primary" data-goto-publish>立即上架</button></div>`
    } else {
      content = `
        <div class="form-panel">
          <div class="card card-pad">
            <div class="block-title">上架新服务</div>
            <div class="field">
              <label class="field-label">服务名称</label>
              <input class="input" id="pubTitle" maxlength="40" placeholder="例如：AI 婚礼微电影 · 快剪版">
            </div>
            <div class="field">
              <label class="field-label">副标题</label>
              <input class="input" id="pubSub" maxlength="40" placeholder="一句话卖点，如「3 分钟成片，含 AI 修色」">
            </div>
            <div class="form-row">
              <div class="field">
                <label class="field-label">服务分类</label>
                <select class="select" id="pubCat"></select>
              </div>
              <div class="field">
                <label class="field-label">价格（元）</label>
                <input class="input" id="pubPrice" type="number" placeholder="0.00">
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label class="field-label">计价单位</label>
                <input class="input" id="pubUnit" maxlength="6" value="单">
              </div>
              <div class="field">
                <label class="field-label">交付周期（工作日）</label>
                <input class="input" id="pubDays" type="number" value="7">
              </div>
            </div>
            <div class="field">
              <label class="field-label">服务标签</label>
              <input class="input" id="pubTags" maxlength="60" placeholder="最多 6 个，如 双机位、含精修30张">
            </div>
            <div class="field">
              <label class="field-label">详细描述</label>
              <textarea class="textarea" id="pubDesc" maxlength="500" placeholder="说明服务包含什么、流程是怎样的、交付什么内容"></textarea>
            </div>
            <button class="btn btn-primary btn-block" id="doPublish">确认上架</button>
          </div>
        </div>
      `
    }

    return `
      <div class="page-head">
        <div class="page-title">接单工作台</div>
        <div class="page-sub">${API.esc(S.provider.nickname)} · ★ ${S.provider.rating} · 完成 ${S.provider.orders_done} 单 · ${API.esc(S.provider.city || '')}</div>
      </div>

      <div class="mem-banner ${isMember ? '' : 'mem-banner-off'}">
        <div class="mem-banner-left">
          <div class="mem-banner-title">${isMember ? API.esc(memberStatus.planName) : '未开通会员'}</div>
          <div class="mem-banner-sub">${isMember ? `剩余 ${memberStatus.daysLeft} 天 · 我的佣金率 ${commissionRate}%` : '开通会员后才能接单 · 点击开通'}</div>
        </div>
        <a class="mem-banner-badge" href="#/membership">${isMember ? '👑' : '🔒'}</a>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">待处理</div></div>
        <div class="stat-card"><div class="stat-value">${doing}</div><div class="stat-label">进行中</div></div>
        <div class="stat-card"><div class="stat-value">${done}</div><div class="stat-label">已完成</div></div>
        <div class="stat-card"><div class="stat-value stat-income">¥${API.yuanShort(income)}</div><div class="stat-label">累计收入</div></div>
        <div class="stat-card"><div class="stat-value">${commissionRate}%</div><div class="stat-label">我的佣金率</div></div>
      </div>

      <div class="dash">
        <div class="side-menu">
          ${tabs.map((t) => `<div class="side-item ${S.studioTab === t.k ? 'active' : ''}" data-st="${t.k}">${t.l}</div>`).join('')}
        </div>
        <div>${content}</div>
      </div>
    `
  }

  BINDINGS.studio = function () {
    const goLogin = $('#goLogin2')
    if (goLogin) goLogin.addEventListener('click', openLogin)

    document.querySelectorAll('[data-st]').forEach((item) => {
      item.addEventListener('click', () => {
        S.studioTab = item.dataset.st
        render()
      })
    })

    const gotoPublish = document.querySelector('[data-goto-publish]')
    if (gotoPublish) {
      gotoPublish.addEventListener('click', () => {
        S.studioTab = 'publish'
        render()
      })
    }

    // 接单
    document.querySelectorAll('[data-claim2]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('接单后客户会看到你的服务信息，请尽快联系客户沟通细节。确认接单？')) return
        try {
          await API.takeOrder(Number(btn.dataset.claim2), S.provider.id, S.session.user.id)
          toast('接单成功')
          render()
        } catch (e) {
          if (e && e.code === 'NEED_MEMBER') {
            if (confirm('开通会员后才能接单。会员按月付费，可降低平台佣金并获得更多曝光。\n\n现在去开通？')) {
              navigate('#/membership')
            }
            return
          }
          toast(API.friendlyError(e))
          render()
        }
      })
    })

    // 上下架
    document.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await API.updateService(Number(btn.dataset.toggle), { status: btn.dataset.next })
          toast(btn.dataset.next === 'on' ? '已上架' : '已下架')
          render()
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    })

    // 上传宣传样片
    document.querySelectorAll('[data-upload-sample]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const serviceId = Number(btn.dataset.uploadSample)
        const serviceName = btn.dataset.name || ''
        openAction(
          '上传宣传样片 · ' + serviceName,
          `<p class="muted" style="margin-bottom:14px;line-height:1.7">
             客户在服务详情页可以观看这些样片。支持视频（MP4/MOV，不超过 ${window.SAMPLES.MAX_VIDEO_MB}MB）和图片（JPG/PNG，不超过 ${window.SAMPLES.MAX_IMAGE_MB}MB）。
           </p>
           <div class="field">
             <label class="field-label">选择文件（可多选）</label>
             <input type="file" id="sampleFiles" accept="${window.SAMPLES.ACCEPT}" multiple>
           </div>
           <div class="field">
             <label class="field-label">样片标题（选填）</label>
             <input class="input" id="sampleTitle" placeholder="例如：2026 婚礼当日快剪">
           </div>
           <div class="field" style="margin-bottom:0">
             <label class="field-label">说明（选填）</label>
             <input class="input" id="sampleDesc" placeholder="例如：银川某婚礼，纪实风格，含快剪">
           </div>
           <p class="muted" id="uploadMsg" style="margin-top:12px"></p>`,
          async () => {
            const input = $('#sampleFiles')
            const files = Array.from(input.files || [])
            if (!files.length) throw new Error('请先选择要上传的文件')
            const msg = $('#uploadMsg')
            msg.textContent = `正在上传 0/${files.length}…`
            const res = await window.SAMPLES.uploadMany(files, {
              serviceId,
              providerId: S.provider.id,
              providerOwnerId: S.session.user.id,
              title: $('#sampleTitle').value.trim(),
              description: $('#sampleDesc').value.trim()
            })
            if (res.ok.length) {
              toast(`成功上传 ${res.ok.length} 个样片`)
              render()
            } else {
              throw new Error(res.failed.map((f) => f.message).join('；'))
            }
          },
          '开始上传'
        )
      })
    })

    // 开通身份
    const become = $('#becomeProvider')
    if (become) {
      // 城市预设：点击填入
      document.querySelectorAll('[data-city]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const input = $('#pCity')
          if (input) input.value = chip.dataset.city
        })
      })
      // 专业方向：多选切换
      const pickedRoles = new Set()
      document.querySelectorAll('[data-role]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const name = chip.dataset.role
          if (pickedRoles.has(name)) {
            pickedRoles.delete(name)
            chip.classList.remove('role-chip-on')
          } else {
            pickedRoles.add(name)
            chip.classList.add('role-chip-on')
          }
        })
      })

      become.addEventListener('click', async () => {
        const nickname = $('#pNickname').value.trim()
        if (!nickname) {
          toast('请填写服务者名称')
          $('#pNickname').focus()
          return
        }
        become.disabled = true
        try {
          const manual = $('#pTags').value.split(/[,，、\s]+/).filter(Boolean)
          // 专业方向 + 手动填的擅长方向合并去重
          const tags = [...new Set([...pickedRoles, ...manual])].slice(0, 8)
          S.provider = await API.becomeProvider(
            { nickname, bio: $('#pBio').value.trim(), city: $('#pCity').value.trim() || '银川', tags },
            S.session.user.id,
            S.session.user.name || null
          )
          toast('开通成功')
          S.studioTab = 'hall'
          render()
        } catch (e) {
          toast(API.friendlyError(e))
          become.disabled = false
        }
      })
    }

    // 上架服务
    const doPublish = $('#doPublish')
    if (doPublish) {
      const catSelect = $('#pubCat')
      API.listCategories().then((cats) => {
        catSelect.innerHTML = cats.map((c) => `<option value="${c.id}">${API.esc(c.name)}</option>`).join('')
      })
      doPublish.addEventListener('click', async () => {
        const title = $('#pubTitle').value.trim()
        const price = Math.round(Number($('#pubPrice').value) * 100)
        if (!title) {
          toast('请填写服务名称')
          $('#pubTitle').focus()
          return
        }
        if (!price || price <= 0) {
          toast('请填写有效的价格')
          $('#pubPrice').focus()
          return
        }
        doPublish.disabled = true
        try {
          await API.publishService({
            provider_id: S.provider.id,
            category_id: Number(catSelect.value),
            title,
            subtitle: $('#pubSub').value.trim(),
            description: $('#pubDesc').value.trim(),
            price,
            original_price: null,
            unit: $('#pubUnit').value.trim() || '单',
            duration: '标准',
            delivery_days: Number($('#pubDays').value) || 7,
            tags: $('#pubTags').value.split(/[,，、\s]+/).filter(Boolean).slice(0, 6),
            rating: 5.0,
            sales_count: 0,
            status: 'on'
          })
          toast('上架成功')
          S.studioTab = 'services'
          render()
        } catch (e) {
          toast(API.friendlyError(e))
          doPublish.disabled = false
        }
      })
    }
  }

  /* ---------------- 服务者主页 ---------------- */

  VIEWS.provider = async function (id) {
    const [provider, services, reviews] = await Promise.all([
      API.getProvider(id),
      API.listServices({ providerId: id, limit: 30 }),
      API.listReviews(null, 10)
    ])
    if (!provider) {
      return `<div class="empty"><div class="empty-icon">👤</div><span class="empty-text">服务者不存在</span></div>`
    }
    const p = provider
    const related = reviews.filter((r) => r.provider_owner_id === p.owner_id)

    return `
      <div class="page-head">
        <div style="display:flex;gap:20px;align-items:center">
          <span class="avatar avatar-lg" style="width:76px;height:76px;font-size:30px">${API.esc(p.nickname.charAt(0))}</span>
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="page-title">${API.esc(p.nickname)}</span>
              ${p.is_verified ? '<span class="prov-verified" style="font-size:12px;padding:2px 10px">✓ 认证服务者</span>' : ''}
            </div>
            <div class="page-sub">★ ${Number(p.rating || 5).toFixed(1)} · 完成 ${p.orders_done} 单 · 作品 ${p.works_count} 个 · ${API.esc(p.city || '')}</div>
          </div>
        </div>
      </div>

      <div class="card card-pad" style="margin-bottom:24px">
        <div class="block-title">服务者简介</div>
        <div class="block-text">${API.esc(p.bio || '这位服务者还没有填写简介。')}</div>
        <div style="margin-top:12px">${(p.tags || []).map((t) => `<span class="tag">${API.esc(t)}</span>`).join('')}</div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">在架服务<span class="count">${services.length} 项</span></span></div>
        ${
          services.length
            ? `<div class="svc-grid">${services.map(svcCard).join('')}</div>`
            : `<div class="empty"><div class="empty-icon">🧩</div><span class="empty-text">暂无在架服务</span></div>`
        }
      </div>

      ${
        related.length
          ? `<div class="section">
        <div class="section-head"><span class="section-title">客户评价<span class="count">${related.length} 条</span></span></div>
        <div class="card card-pad">
          ${related
            .map(
              (r) => `
          <div class="review-item">
            <span class="avatar avatar-sm">${API.esc((r.customer_name || '客').charAt(0))}</span>
            <div class="review-body">
              <div class="review-head">
                <span class="review-name">${API.esc(r.customer_name || '匿名客户')}</span>
                <span class="review-stars">${'★'.repeat(r.rating)}</span>
                <span class="review-time">${API.fromNow(r.created_at)}</span>
              </div>
              <div class="review-text">${API.esc(r.content)}</div>
            </div>
          </div>`
            )
            .join('')}
        </div>
      </div>`
          : ''
      }
    `
  }

  /* ---------------- 后台 ---------------- */

  VIEWS.admin = async function () {
    if (!S.isStaff) {
      return `<div class="empty"><div class="empty-icon">🔐</div>
        <span class="empty-text">仅平台管理员可见</span>
        <span class="empty-hint">需要平台运营账号权限</span></div>`
    }
    const [stats, orders] = await Promise.all([API.adminStats(), API.adminListOrders(S.orderFilter === 'all' ? '' : S.orderFilter)])
    const filters = [
      { k: 'all', l: '全部' }, { k: 'open', l: '待接单' }, { k: 'taken', l: '已接单' },
      { k: 'producing', l: '制作中' }, { k: 'delivered', l: '待确认' },
      { k: 'completed', l: '已完成' }, { k: 'cancelled', l: '已取消' }
    ]

    return `
      <div class="page-head">
        <div class="page-title">平台后台</div>
        <div class="page-sub">银川AIGC数字文化产业基地 · 运营数据与订单管理</div>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-value">${stats.total}</div><div class="stat-label">订单总数</div></div>
        <div class="stat-card"><div class="stat-value">${stats.open}</div><div class="stat-label">待接单</div></div>
        <div class="stat-card"><div class="stat-value">${stats.inProgress}</div><div class="stat-label">进行中</div></div>
        <div class="stat-card"><div class="stat-value">${stats.completed}</div><div class="stat-label">已完成</div></div>
      </div>

      <div class="card card-pad" style="margin-bottom:16px;background:linear-gradient(135deg,#FBF3EA,#F7EFE4)">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:14px;color:var(--ink-2)">累计成交额</span>
          <span class="muted">已扣除取消订单</span>
        </div>
        <div style="font-size:32px;font-weight:700;color:var(--brand);margin-top:8px">¥${API.yuan(stats.gmv)}</div>
      </div>

      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card"><div class="stat-value">${stats.providers}</div><div class="stat-label">服务者</div></div>
        <div class="stat-card"><div class="stat-value">${stats.services}</div><div class="stat-label">在架服务</div></div>
        <div class="stat-card"><div class="stat-value">${stats.categories}</div><div class="stat-label">服务分类</div></div>
        <div class="stat-card"><div class="stat-value">${stats.cancelled}</div><div class="stat-label">已取消</div></div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">订单管理</span></div>
        <div class="filter-bar">
          ${filters.map((f) => `<button class="filter-chip ${S.orderFilter === f.k ? 'active' : ''}" data-af="${f.k}">${f.l}</button>`).join('')}
        </div>
        ${
          orders.length
            ? orders
                .map((o) => {
                  const st = API.ORDER_STATUS[o.status] || { text: o.status, cls: 'badge-pending' }
                  return `
          <a class="list-row" href="#/order/${o.id}">
            <div class="list-row-cover" style="background:${o.coverUrl ? 'transparent' : API.coverTheme(o.service_id)}">${o.coverUrl ? `<img class="list-row-cover-img" src="${API.esc(o.coverUrl)}" alt="" loading="lazy" />` : '<span>MG</span>'}</div>
            <div class="list-row-main">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="list-row-title ellipsis">${API.esc(o.title)}</span>
                <span class="badge ${st.cls}">${st.text}</span>
              </div>
              <div class="list-row-sub">
                <span>${API.esc(o.order_no)}</span><span>·</span>
                <span>${API.esc(o.customer_name || '匿名')}</span><span>·</span>
                <span>${API.fromNow(o.created_at)}</span>
              </div>
            </div>
            <div class="list-row-right">
              <div class="list-row-amount">¥${API.yuan(o.amount)}</div>
              <div class="list-row-time">服务费 ¥${API.yuan(o.platform_fee)}</div>
            </div>
          </a>`
                })
                .join('')
            : `<div class="empty"><div class="empty-icon">📊</div><span class="empty-text">该状态下暂无订单</span></div>`
        }
      </div>
    `
  }

  BINDINGS.admin = function () {
    document.querySelectorAll('[data-af]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.orderFilter = btn.dataset.af
        render()
      })
    })
  }

  /* ---------------- 启动 ---------------- */

  async function boot() {
    // 等云服务 SDK 加载完成（CDN 异步脚本，可能晚于本脚本执行）
    if (window.cloudReady) {
      try {
        await window.cloudReady
      } catch (e) {
        console.error('[boot] cloud SDK not ready', e)
        app.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div>
          <span class="empty-text">云服务加载失败</span>
          <span class="empty-hint">${API.esc(e.message || '请检查网络后刷新重试')}</span></div>`
        return
      }
    }

    // 先确认云服务端点可达 —— 平台分配的域名可能临时解析失败，
    // 端点不通时自动切到备用（见 config.js 的 ensureEndpoint）
    let endpointOk = true
    if (window.ensureEndpoint) {
      try {
        await window.ensureEndpoint()
      } catch (e) {
        console.error('[boot] ensureEndpoint failed', e)
      }
      // activeEndpoint 为 null 表示所有候选端点都不可达
      endpointOk = !!(window.APP_CONFIG && window.APP_CONFIG.activeEndpoint)
    }

    // 微信授权回调优先处理，必须在路由守卫之前
    const url = new URL(window.location.href)
    if (url.searchParams.has('code') && url.searchParams.get('provider') === 'wechat') {
      try {
        const session = await API.handleWechatCallback()
        url.searchParams.delete('code')
        url.searchParams.delete('state')
        url.searchParams.delete('provider')
        window.history.replaceState(null, '', url.toString())
        await onLogin(session)
        toast('微信登录成功')
      } catch (e) {
        console.error('wechat callback failed', e)
        showLoginError(API.friendlyError(e))
        loginModal.classList.add('show')
      }
    } else {
      const session = await API.getSession()
      if (session) await onLogin(session)
    }
    updateUserChip()

    // 端点不可达：直接显示明确的故障页，不做无谓的渲染
    if (!endpointOk) {
      const hint = (window.APP_CONFIG && window.APP_CONFIG.endpointFailureHint) || '服务暂时无法连接，请稍后刷新重试'
      app.innerHTML = `<div class="empty" style="padding:80px 24px">
        <div class="empty-icon">🔌</div>
        <span class="empty-text">服务暂时无法连接</span>
        <span class="empty-hint">${API.esc(hint)}</span>
        <button class="btn btn-primary" style="margin-top:20px" onclick="location.reload()">重新加载</button>
      </div>`
      const bar = document.createElement('div')
      bar.className = 'endpoint-warn'
      bar.textContent = hint
      document.body.appendChild(bar)
      return
    }

    render()
  }

  // 移动端菜单
  $('#mobileMenuBtn').addEventListener('click', () => {
    const nav = document.querySelector('.nav')
    if (!nav) return
    nav.classList.toggle('mobile-open')
  })

  // 点击导航项后收起移动端菜单
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelector('.nav').classList.remove('mobile-open')
    })
  })

  boot()
})()
