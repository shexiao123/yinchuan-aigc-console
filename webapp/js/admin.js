/**
 * 宁夏云辇文化科技有限公司 · 管理端主逻辑
 * PC 优先的运营后台。侧栏导航 + 单页视图切换。
 */
(function () {
  const API = window.API
  const $ = (sel) => document.querySelector(sel)
  const content = $('#adminContent')

  const S = {
    session: null,
    isStaff: false,
    page: 'dashboard',
    stats: null,
    orderFilter: 'all',
    orderKeyword: '',
    appFilter: 'pending',
    settleFilter: 'all',
    providers: [],
    services: [],
    categories: [],
    banners: [],
    settings: null,
    logs: [],
    staffName: '',
    uid: '',
    supportConvs: []
  }

  const PAGE_TITLES = {
    dashboard: '运营概览',
    orders: '订单管理',
    settlements: '结算与提现',
    providers: '服务者管理',
    applications: '入驻审核',
    services: '服务与分类',
    content: '首页与内容',
    merchants: '商家管理',
    billing: '商家收费',
    notice: '公告管理',
    settings: '平台设置',
    members: '会员管理',
    support: '客服会话',
    chat: '群聊管理',
    logs: '操作日志'
  }

  /* ---------------- 通用 ---------------- */

  let toastTimer
  function toast(msg) {
    const t = $('#toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600)
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  const yuan = (cents) => (Number(cents || 0) / 100).toFixed(2)
  const yuanShort = (cents) => {
    const n = Number(cents || 0) / 100
    return n % 1 === 0 ? String(n) : n.toFixed(2)
  }
  const fromNow = (iso) => {
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

  const ORDER_STATUS = {
    open: { text: '待接单', cls: 'badge-pending' },
    taken: { text: '已接单', cls: 'badge-taken' },
    producing: { text: '制作中', cls: 'badge-busy' },
    delivered: { text: '待确认', cls: 'badge-delivered' },
    completed: { text: '已完成', cls: 'badge-done' },
    cancelled: { text: '已取消', cls: 'badge-cancelled' }
  }

  /* ---------------- 操作弹层 ---------------- */

  let actionHandler = null

  function openAction(title, bodyHtml, onOk, okText) {
    $('#actionTitle').textContent = title
    $('#actionBody').innerHTML = bodyHtml
    $('#actionOk').textContent = okText || '确定'
    actionHandler = onOk
    // 纯展示弹层：隐藏确定按钮，只留关闭
    $('#actionOk').style.display = onOk ? '' : 'none'
    $('#actionMask').classList.add('show')
  }

  function closeAction() {
    $('#actionMask').classList.remove('show')
    $('#actionOk').style.display = ''
    actionHandler = null
  }

  $('#actionClose').addEventListener('click', closeAction)
  $('#actionCancel').addEventListener('click', closeAction)
  $('#actionMask').addEventListener('click', (e) => {
    if (e.target === $('#actionMask')) closeAction()
  })
  $('#actionOk').addEventListener('click', async () => {
    if (!actionHandler) return
    $('#actionOk').disabled = true
    try {
      await actionHandler()
      closeAction()
    } catch (e) {
      toast(API.friendlyError(e))
    } finally {
      $('#actionOk').disabled = false
    }
  })

  /* ---------------- 登录 ---------------- */

  let pendingOtp2 = null
  let verifiedCode = null

  async function sendCode(phoneInputId, codeInputId, btnId, setPending) {
    const phone = $(phoneInputId).value.trim()
    if (!/^1\d{10}$/.test(phone)) {
      $('#adminLoginError').textContent = '请输入正确的 11 位手机号'
      return
    }
    $('#adminLoginError').textContent = ''
    const btn = $(btnId)
    btn.disabled = true
    try {
      const sent = await API.sendPhoneCode(phone)
      setPending({
        phone,
        verificationId: sent.verificationId,
        isExistingUser: sent.isExistingUser
      })
      $(codeInputId).disabled = false
      $(codeInputId).focus()
      toast('验证码已发送')
      let left = 60
      const timer = setInterval(() => {
        left -= 1
        if (left <= 0) {
          clearInterval(timer)
          btn.disabled = false
          btn.textContent = '重新获取'
        } else {
          btn.textContent = `${left} 秒`
        }
      }, 1000)
    } catch (e) {
      $('#adminLoginError').textContent = API.friendlyError(e)
      btn.disabled = false
    }
  }

  $('#adminSendCode2').addEventListener('click', () => {
    sendCode('#adminPhone2', '#adminCode2', '#adminSendCode2', (v) => { pendingOtp2 = v })
  })

  /**
   * 第一步：验证管理码。
   * 这里只做格式与存在性校验，不消耗码——真正兑换发生在绑定成功时，
   * 避免用户填错手机号就把码浪费掉。
   */
  $('#adminCheckCode').addEventListener('click', async () => {
    const code = $('#adminInvite').value.trim()
    if (!code) {
      $('#adminLoginError').textContent = '请输入管理码'
      return
    }
    $('#adminLoginError').textContent = ''
    try {
      const row = await API.checkAdminInvite(code)
      verifiedCode = code
      $('#paneBind').hidden = false
      $('#bindTip').textContent = `管理码有效（${row.label || '管理员'}）。请验证手机号以绑定管理员账号。`
      $('#adminPhone2').focus()
      toast('管理码有效')
    } catch (e) {
      verifiedCode = null
      $('#paneBind').hidden = true
      $('#adminLoginError').textContent = API.friendlyError(e)
    }
  })

  /** 第二步：验证手机号并兑换管理码 */
  $('#adminBindBtn').addEventListener('click', async () => {
    if (!verifiedCode) {
      $('#adminLoginError').textContent = '请先验证管理码'
      return
    }
    const phone = $('#adminPhone2').value.trim()
    const token = $('#adminCode2').value.trim()
    if (!pendingOtp2 || pendingOtp2.phone !== phone) {
      $('#adminLoginError').textContent = '请先为当前手机号获取并填写验证码'
      return
    }
    if (!token) {
      $('#adminLoginError').textContent = '请输入短信验证码'
      return
    }
    try {
      const session = await API.verifyPhoneCode({ ...pendingOtp2, token })
      pendingOtp2 = null
      await API.claimAdminInvite(verifiedCode)
      verifiedCode = null
      S.session = session
      S.isStaff = true
      $('#loginMask').classList.remove('show')
      await onLogin(session)
      toast('管理员身份已激活')
      render()
    } catch (e) {
      $('#adminLoginError').textContent = API.friendlyError(e)
    }
  })

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await API.signOut()
    } catch (e) {
      console.error('signOut failed', e.message)
    }
    S.session = null
    S.isStaff = false
    $('#loginMask').classList.add('show')
    toast('已退出')
  })

  /* ---------------- 身份 ---------------- */

  async function onLogin(session) {
    const uid = session.user.id
    S.isStaff = await API.isStaff(uid)
    const name = session.user.name || '管理员'
    S.staffName = name
    S.uid = uid
    $('#adminName').textContent = name
    $('#adminAvatar').textContent = name.charAt(0)
    $('#sideUser').textContent = name
  }

  // 调试钩子：仅在 ?debug=1 时开放，供自动化测试注入会话状态
  if (/(^|[?&])debug=1(&|$)/.test(window.location.search)) {
    window.__wbDebug = {
      setSession: (session) => onLogin(session),
      getState: () => S,
      render: () => render(),
      switchPage: (p) => switchPage(p)
    }
  }

  /* ---------------- 导航 ---------------- */

  function switchPage(page) {
    S.page = page
    document.querySelectorAll('.side-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.page === page)
    })
    $('#pageTitle').textContent = PAGE_TITLES[page] || '管理端'
    $('#sidebar').classList.remove('open')
    $('#drawerMask').classList.remove('show')
    render()
  }

  document.querySelectorAll('.side-item').forEach((el) => {
    el.addEventListener('click', () => switchPage(el.dataset.page))
  })

  $('#drawerToggle').addEventListener('click', () => {
    $('#sidebar').classList.add('open')
    $('#drawerMask').classList.add('show')
  })
  $('#drawerMask').addEventListener('click', () => {
    $('#sidebar').classList.remove('open')
    $('#drawerMask').classList.remove('show')
  })

  /* ---------------- 渲染 ---------------- */

  const VIEWS = {}

  let lastBillingBadgeAt = 0
  function refreshBillingBadge() {
    const el = $('#badgeBilling')
    if (!el || Date.now() - lastBillingBadgeAt < 30000) return
    lastBillingBadgeAt = Date.now()
    API.adminListEnrollOrders('pending').then((rows) => {
      const n = (rows || []).length
      el.textContent = n
      el.hidden = n === 0
    }).catch(() => {})
  }

  function render() {
    refreshBillingBadge()
    content.innerHTML = '<div class="loading">加载中…</div>'
    Promise.resolve(VIEWS[S.page]())
      .then((html) => {
        content.innerHTML = html
        bindView()
        // 自适应网格：按项数与屏幕宽度算列数，内容铺满不留白
        if (window.AdaptiveGrid) window.AdaptiveGrid.fitAll(content)
      })
      .catch((e) => {
        console.error('admin render failed', e)
        content.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div>
          <span class="empty-text">加载失败</span>
          <span class="empty-hint">${esc(API.friendlyError(e))}</span></div>`
      })
  }

  function bindView() {
    const handler = BINDS[S.page]
    if (typeof handler === 'function') handler()
    else if (Array.isArray(handler)) handler.forEach((fn) => fn())

    // 可视化数据版（Remotion）：概览页挂载实时数据大屏
    if (S.page === 'dashboard' && S.stats && window.WBDataViz) {
      mountDataViz(S.stats)
    }
  }

  /**
   * 把 adminStats 的数据喂给 Remotion Player
   * 字段名与 video/src/tokens.ts 的 DashboardData 一一对应
   */
  function mountDataViz(stats) {
    const stage = document.getElementById('datavizStage')
    if (!stage) return
    try {
      window.WBDataViz.mount(
        stage,
        {
          total: stats.total,
          open: stats.open,
          taken: stats.taken,
          producing: stats.producing,
          delivered: stats.delivered,
          completed: stats.completed,
          cancelled: stats.cancelled,
          gmv: stats.gmv,
          commission: stats.commission,
          providers: stats.providers,
          verifiedProviders: stats.verifiedProviders,
          services: stats.services,
          onShelf: stats.onShelf,
          categories: stats.categories,
          reviews: stats.reviews,
          avgRating: stats.avgRating,
          pendingApplications: stats.pendingApplications,
          pendingSettlements: stats.pendingSettlements,
          trend: stats.trend || [],
          topServices: stats.topServices || [],
          byCategory: stats.byCategory || []
        },
        {loop: true}
      )
    } catch (e) {
      console.error('dataviz mount failed', e)
      stage.innerHTML = '<div class="dataviz-fallback">可视化数据版加载失败，下方为静态明细</div>'
    }
  }

  const BINDS = {}

  /* ---------------- 运营概览 ---------------- */

  VIEWS.dashboard = async function () {
    const stats = await API.adminStats()
    S.stats = stats

    const maxTrend = Math.max(1, ...stats.trend.map((t) => t.count))
    const totalServices = stats.byCategory.reduce((s, c) => s + c.count, 0) || 1
    const distColors = ['#C4703F', '#6E7F5C', '#5B7186', '#B5707A', '#9C8449', '#4F7DF3', '#0EA5E9', '#7C5CF0']

    return `
      <div class="dataviz-stage" id="datavizStage">
        <div class="dataviz-fallback">可视化数据版加载中…</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi kpi-1">
          <span class="kpi-accent"></span>
          <div class="kpi-label">累计成交额</div>
          <div class="kpi-value">¥${yuanShort(stats.gmv)}</div>
          <div class="kpi-sub">已完成 ${stats.completed} 单 · 抽成 ¥${yuanShort(stats.commission)}</div>
        </div>
        <div class="kpi kpi-2">
          <span class="kpi-accent"></span>
          <div class="kpi-label">订单总数</div>
          <div class="kpi-value">${stats.total}</div>
          <div class="kpi-sub">进行中 ${stats.taken + stats.producing + stats.delivered} · 待接单 ${stats.open}</div>
        </div>
        <div class="kpi kpi-3">
          <span class="kpi-accent"></span>
          <div class="kpi-label">服务者</div>
          <div class="kpi-value">${stats.providers}</div>
          <div class="kpi-sub">已认证 ${stats.verifiedProviders} · 待审核 ${stats.pendingApplications}</div>
        </div>
        <div class="kpi kpi-4">
          <span class="kpi-accent"></span>
          <div class="kpi-label">在架服务</div>
          <div class="kpi-value">${stats.onShelf}</div>
          <div class="kpi-sub">共 ${stats.services} 个 · ${stats.categories} 个分类</div>
        </div>
      </div>

      <div class="chart-grid">
        <div class="chart-block">
          <div class="card-head">
            <div>
              <div class="card-title">近 7 天订单趋势</div>
              <div class="card-sub">按下单日期统计</div>
            </div>
          </div>
          <div class="card-pad">
            <div class="trend-chart">
              ${stats.trend
                .map(
                  (t) => `
                <div class="trend-col">
                  <div class="trend-bar-wrap">
                    <div class="trend-bar" style="height:${Math.round((t.count / maxTrend) * 100)}%">
                      <span class="trend-bar-tip">${t.count} 单 · ¥${yuanShort(t.amount)}</span>
                    </div>
                  </div>
                  <span class="trend-label">${t.date}</span>
                </div>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="chart-block">
          <div class="card-head"><div class="card-title">服务分类分布</div></div>
          <div class="card-pad">
            <div class="dist-bar">
              ${stats.byCategory
                .map(
                  (c, i) =>
                    `<div class="dist-seg" style="width:${(c.count / totalServices) * 100}%;background:${distColors[i % distColors.length]}"></div>`
                )
                .join('')}
            </div>
            <div class="dist-legend">
              ${stats.byCategory
                .map(
                  (c, i) =>
                    `<span class="dist-item"><span class="dist-dot" style="background:${distColors[i % distColors.length]}"></span>${esc(c.name)} ${c.count}</span>`
                )
                .join('')}
            </div>
            <div class="divider"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px">
              <span class="muted">客户评价</span>
              <span><b>${stats.reviews}</b> 条 · 平均 ${stats.avgRating} 星</span>
            </div>
          </div>
        </div>
      </div>

      <div class="chart-grid">
        <div class="chart-block">
          <div class="card-head"><div class="card-title">热销服务 Top 5</div></div>
          <div class="card-pad">
            <div class="rank-list">
              ${
                stats.topServices.length
                  ? stats.topServices
                      .map(
                        (s, i) => `
                <div class="rank-item">
                  <span class="rank-no ${i < 3 ? 'rank-no-' + (i + 1) : ''}">${i + 1}</span>
                  <div class="rank-body">
                    <div class="rank-title ellipsis">${esc(s.title)}</div>
                    <div class="rank-sub">${esc(s.provider)} · ¥${yuanShort(s.price)}</div>
                  </div>
                  <span class="rank-value">${s.sales} 单</span>
                </div>`
                      )
                      .join('')
                  : '<div class="empty"><span class="empty-text">暂无数据</span></div>'
              }
            </div>
          </div>
        </div>

        <div class="chart-block">
          <div class="card-head"><div class="card-title">待处理事项</div></div>
          <div class="card-pad">
            <div class="rank-list">
              <div class="rank-item">
                <span class="rank-no rank-no-1">审</span>
                <div class="rank-body">
                  <div class="rank-title">服务者入驻申请</div>
                  <div class="rank-sub">需要审核后才能接单</div>
                </div>
                <span class="rank-value">${stats.pendingApplications}</span>
              </div>
              <div class="rank-item">
                <span class="rank-no rank-no-2">结</span>
                <div class="rank-body">
                  <div class="rank-title">待打款结算单</div>
                  <div class="rank-sub">服务者提现待处理</div>
                </div>
                <span class="rank-value">${stats.pendingSettlements}</span>
              </div>
              <div class="rank-item">
                <span class="rank-no rank-no-3">单</span>
                <div class="rank-body">
                  <div class="rank-title">待接单需求</div>
                  <div class="rank-sub">客户已发布，等待服务者接单</div>
                </div>
                <span class="rank-value">${stats.open}</span>
              </div>
              <div class="rank-item">
                <span class="rank-no">确</span>
                <div class="rank-body">
                  <div class="rank-title">待客户确认</div>
                  <div class="rank-sub">成片已交付，等待客户确认</div>
                </div>
                <span class="rank-value">${stats.delivered}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  /* ---------------- 订单管理 ---------------- */

  VIEWS.orders = async function () {
    const orders = await API.adminListOrders(S.orderFilter === 'all' ? '' : S.orderFilter, 200)
    const filtered = S.orderKeyword
      ? orders.filter(
          (o) =>
            o.title.includes(S.orderKeyword) ||
            o.order_no.includes(S.orderKeyword) ||
            (o.customer_name || '').includes(S.orderKeyword)
        )
      : orders

    const filters = [
      { k: 'all', l: '全部' },
      { k: 'open', l: '待接单' },
      { k: 'taken', l: '已接单' },
      { k: 'producing', l: '制作中' },
      { k: 'delivered', l: '待确认' },
      { k: 'completed', l: '已完成' },
      { k: 'cancelled', l: '已取消' }
    ]

    return `
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input class="input" id="orderSearch" placeholder="搜索订单号 / 标题 / 客户" value="${esc(S.orderKeyword)}">
        </div>
        ${filters.map((f) => `<button class="filter-chip ${S.orderFilter === f.k ? 'active' : ''}" data-of="${f.k}">${f.l}</button>`).join('')}
        <span class="toolbar-spacer"></span>
        <span class="muted">共 ${filtered.length} 条</span>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>订单号</th><th>订单标题</th><th>客户</th><th>金额</th>
                <th>平台服务费</th><th>状态</th><th>下单时间</th><th style="text-align:right">操作</th>
              </tr>
            </thead>
            <tbody>
              ${
                filtered.length
                  ? filtered
                      .map((o) => {
                        const st = ORDER_STATUS[o.status] || { text: o.status, cls: 'badge-pending' }
                        return `
                  <tr>
                    <td class="mono">${esc(o.order_no)}</td>
                    <td class="td-strong">${esc(o.title)}</td>
                    <td>${esc(o.customer_name || '匿名')}</td>
                    <td class="td-amount td-num">¥${yuan(o.amount)}</td>
                    <td class="td-num muted">¥${yuan(o.platform_fee)}</td>
                    <td><span class="badge ${st.cls}">${st.text}</span></td>
                    <td class="muted">${fromNow(o.created_at)}</td>
                    <td>
                      <div class="td-actions">
                        <button class="btn btn-ghost btn-sm" data-order-act="${o.id}" data-status="${o.status}">改状态</button>
                      </div>
                    </td>
                  </tr>`
                      })
                      .join('')
                  : '<tr><td colspan="8"><div class="empty"><span class="empty-text">没有符合条件的订单</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  BINDS.orders = function () {
    document.querySelectorAll('[data-of]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.orderFilter = btn.dataset.of
        render()
      })
    })

    const search = $('#orderSearch')
    if (search) {
      let timer
      search.addEventListener('input', (e) => {
        S.orderKeyword = e.target.value
        clearTimeout(timer)
        timer = setTimeout(() => {
          const pos = search.selectionStart
          render()
          const n = $('#orderSearch')
          if (n) {
            n.focus()
            n.setSelectionRange(pos, pos)
          }
        }, 320)
      })
    }

    document.querySelectorAll('[data-order-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.orderAct)
        const options = Object.keys(ORDER_STATUS)
          .map(
            (k) =>
              `<option value="${k}" ${k === btn.dataset.status ? 'selected' : ''}>${ORDER_STATUS[k].text}</option>`
          )
          .join('')
        openAction(
          '修改订单状态',
          `<div class="field">
             <label class="field-label">目标状态</label>
             <select class="select" id="actStatus">${options}</select>
           </div>
           <div class="field">
             <label class="field-label">操作备注（可选）</label>
             <input class="input" id="actNote" placeholder="例如：客户申请退款，协商后关闭">
           </div>`,
          async () => {
            const next = $('#actStatus').value
            const note = $('#actNote').value.trim()
            await API.adminUpdateOrderStatus(
              id,
              next,
              note,
              S.session.user.id,
              S.session.user.name || null
            )
            toast('订单状态已更新')
            render()
          },
          '确认修改'
        )
      })
    })
  }

  /* ---------------- 服务者管理 ---------------- */

  VIEWS.providers = async function () {
    const providers = await API.listProvidersAdmin()
    S.providers = providers
    return `
      <div class="toolbar">
        <span class="muted">共 ${providers.length} 位服务者</span>
        <span class="toolbar-spacer"></span>
        <span class="muted">点击「认证」可变更服务者认证状态</span>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr><th>服务者</th><th>简介</th><th>城市</th><th>擅长</th><th>评分</th><th>完成单量</th><th>认证</th><th style="text-align:right">操作</th></tr>
            </thead>
            <tbody>
              ${
                providers.length
                  ? providers
                      .map(
                        (p) => `
                <tr>
                  <td class="td-strong">${esc(p.nickname)}</td>
                  <td class="muted" style="max-width:280px"><div class="ellipsis-2">${esc(p.bio || '—')}</div></td>
                  <td>${esc(p.city || '—')}</td>
                  <td>${(p.tags || []).map((t) => `<span class="badge badge-pending" style="margin-right:3px">${esc(t)}</span>`).join('') || '—'}</td>
                  <td class="td-num">★ ${Number(p.rating || 5).toFixed(1)}</td>
                  <td class="td-num">${p.orders_done}</td>
                  <td>${p.is_verified ? '<span class="badge badge-done">已认证</span>' : '<span class="badge badge-cancelled">未认证</span>'}</td>
                  <td>
                    <div class="td-actions">
                      <button class="btn ${p.is_verified ? 'btn-ghost' : 'btn-soft'} btn-sm" data-verify="${p.id}" data-next="${p.is_verified ? '0' : '1'}">
                        ${p.is_verified ? '取消认证' : '认证'}
                      </button>
                    </div>
                  </td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="8"><div class="empty"><span class="empty-text">还没有服务者</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  BINDS.providers = function () {
    document.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.verify)
        const next = btn.dataset.next === '1'
        try {
          await API.setProviderVerified(id, next)
          toast(next ? '已认证' : '已取消认证')
          render()
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    })
  }

  /* ---------------- 入驻审核 ---------------- */

  VIEWS.applications = async function () {
    const apps = await API.listApplications(S.appFilter)
    const filters = [
      { k: 'pending', l: '待审核' },
      { k: 'approved', l: '已通过' },
      { k: 'rejected', l: '已驳回' },
      { k: 'all', l: '全部' }
    ]
    return `
      <div class="toolbar">
        ${filters.map((f) => `<button class="filter-chip ${S.appFilter === f.k ? 'active' : ''}" data-af="${f.k}">${f.l}</button>`).join('')}
        <span class="toolbar-spacer"></span>
        <span class="muted">共 ${apps.length} 条</span>
      </div>

      ${
        apps.length
          ? apps
              .map((a) => {
                const st =
                  a.status === 'approved'
                    ? { text: '已通过', cls: 'badge-approved' }
                    : a.status === 'rejected'
                      ? { text: '已驳回', cls: 'badge-rejected' }
                      : { text: '待审核', cls: 'badge-pending' }
                return `
          <div class="card card-pad" style="margin-bottom:14px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
              <div style="flex:1;min-width:240px">
                <div style="display:flex;align-items:center;gap:9px">
                  <span class="td-strong" style="font-size:15px">${esc(a.nickname)}</span>
                  <span class="badge ${st.cls}">${st.text}</span>
                </div>
                <div class="muted" style="margin-top:7px;line-height:1.7">${esc(a.bio || '未填写简介')}</div>
                <div class="muted" style="margin-top:7px">
                  ${esc(a.city || '—')} ·
                  ${(a.tags || []).map((t) => esc(t)).join('、') || '未填擅长方向'}
                </div>
                <div class="muted" style="margin-top:5px">申请人 ${esc(a.applicant_name || a.applicant_uid)} · ${fromNow(a.created_at)}</div>
                ${a.admin_note ? `<div style="margin-top:8px;font-size:12.5px;color:#A8463A">审核备注：${esc(a.admin_note)}</div>` : ''}
              </div>
              ${
                a.status === 'pending'
                  ? `<div style="display:flex;gap:8px">
                       <button class="btn btn-success btn-sm" data-approve="${a.id}">通过并开通</button>
                       <button class="btn btn-danger btn-sm" data-reject="${a.id}">驳回</button>
                     </div>`
                  : ''
              }
            </div>
          </div>`
              })
              .join('')
          : `<div class="card"><div class="empty"><div class="empty-icon">📋</div>
              <span class="empty-text">${S.appFilter === 'pending' ? '没有待审核的申请' : '暂无记录'}</span></div></div>`
      }
    `
  }

  BINDS.applications = function () {
    document.querySelectorAll('[data-af]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.appFilter = btn.dataset.af
        render()
      })
    })

    document.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.approve)
        openAction(
          '通过服务者申请',
          `<p class="muted" style="margin-bottom:14px;line-height:1.7">通过后系统会自动为该用户开通服务者身份，可立即接单和上架服务。</p>
           <div class="field">
             <label class="field-label">审核备注（可选）</label>
             <input class="input" id="actNote" placeholder="例如：作品集符合要求">
           </div>`,
          async () => {
            await API.reviewApplication(
              id,
              true,
              S.session.user.id,
              S.session.user.name || null,
              $('#actNote').value.trim()
            )
            toast('已通过并开通服务者身份')
            render()
          },
          '确认通过'
        )
      })
    })

    document.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.reject)
        openAction(
          '驳回服务者申请',
          `<div class="field">
             <label class="field-label">驳回原因</label>
             <textarea class="textarea" id="actNote" placeholder="说明原因，申请人可修改后重新提交"></textarea>
           </div>`,
          async () => {
            const note = $('#actNote').value.trim()
            if (!note) throw new Error('请填写驳回原因')
            await API.reviewApplication(
              id,
              false,
              S.session.user.id,
              S.session.user.name || null,
              note
            )
            toast('已驳回')
            render()
          },
          '确认驳回'
        )
      })
    })
  }

  /* ---------------- 服务与分类 ---------------- */

  VIEWS.services = async function () {
    const [services, categories, allSamples] = await Promise.all([
      API.listServices({ limit: 200 }),
      API.listCategories(),
      API.listProviderSamples()
    ])
    S.services = services
    S.categories = categories
    const sampleCount = (sid) => allSamples.filter((s) => s.service_id === sid).length
    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-head">
          <div>
            <div class="card-title">服务分类</div>
            <div class="card-sub">共 ${categories.length} 个分类</div>
          </div>
          <button class="btn btn-primary btn-sm" id="catAddBtn">＋ 新增分类</button>
        </div>
        <div class="card-pad">
          ${categories
            .map(
              (c) => `
            <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)">
              <span style="font-size:17px;width:26px">${c.icon || '🎬'}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13.5px;font-weight:500">${esc(c.name)}</div>
                <div class="muted">${esc(c.description || '')}</div>
              </div>
              <span class="muted">${services.filter((s) => s.category_id === c.id).length} 个服务</span>
              <button class="btn btn-ghost btn-sm" data-cat-edit="${c.id}">编辑</button>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">全部服务</div>
            <div class="card-sub">共 ${services.length} 个（含已下架）· 全站共 ${allSamples.length} 个宣传样片</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr><th>服务名称</th><th>分类</th><th>服务者</th><th>价格</th><th>销量</th><th>样片</th><th>状态</th><th style="text-align:right">操作</th></tr>
            </thead>
            <tbody>
              ${
                services.length
                  ? services
                      .map((s) => {
                        const cat = categories.find((c) => c.id === s.category_id)
                        const n = sampleCount(s.id)
                        return `
                <tr>
                  <td class="td-strong">${esc(s.title)}</td>
                  <td>${esc(cat ? cat.name : '—')}</td>
                  <td class="muted">服务者 #${s.provider_id}</td>
                  <td class="td-amount td-num">¥${yuanShort(s.price)}</td>
                  <td class="td-num">${s.sales_count}</td>
                  <td>${n ? `<span class="badge badge-done">${n} 个</span>` : '<span class="muted">无</span>'}</td>
                  <td>${s.status === 'on' ? '<span class="badge badge-done">在架</span>' : '<span class="badge badge-cancelled">已下架</span>'}</td>
                  <td>
                    <div class="td-actions">
                      ${n ? `<button class="btn btn-ghost btn-sm" data-samples="${s.id}">查看样片</button>` : ''}
                      <button class="btn ${s.status === 'on' ? 'btn-ghost' : 'btn-soft'} btn-sm" data-toggle-svc="${s.id}" data-next="${s.status === 'on' ? 'off' : 'on'}">
                        ${s.status === 'on' ? '下架' : '上架'}
                      </button>
                    </div>
                  </td>
                </tr>`
                      })
                      .join('')
                  : '<tr><td colspan="8"><div class="empty"><span class="empty-text">暂无服务</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  BINDS.services = function () {
    document.querySelectorAll('[data-toggle-svc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.toggleSvc)
        try {
          await API.updateService(id, { status: btn.dataset.next })
          toast(btn.dataset.next === 'on' ? '已上架' : '已下架')
          render()
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    })

    // 查看某服务的样片
    document.querySelectorAll('[data-samples]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const serviceId = Number(btn.dataset.samples)
        try {
          const all = await API.listProviderSamples()
          const list = all.filter((s) => s.service_id === serviceId)
          if (!list.length) {
            toast('该服务还没有样片')
            return
          }
          const svc = S.services.find((x) => x.id === serviceId)
          openAction(
            '宣传样片 · ' + (svc ? svc.title : ''),
            `<div style="display:flex;flex-direction:column;gap:10px">
              ${list
                .map(
                  (s) => `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#FAF6F1;border-radius:10px">
                  <span style="font-size:18px">${s.media_type === 'video' ? '🎬' : '🖼'}</span>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:500" class="ellipsis">${esc(s.title || '样片')}</div>
                    <div class="muted">${s.file_size ? (s.file_size / 1024 / 1024).toFixed(1) + 'MB' : ''} ${s.description ? '· ' + esc(s.description) : ''}</div>
                  </div>
                  <button class="btn btn-danger btn-sm" data-del-sample="${s.id}" data-sname="${esc(s.title || '')}">删除</button>
                </div>`
                )
                .join('')}
            </div>`,
            null,
            '关闭'
          )
          // 弹层内的删除按钮
          document.querySelectorAll('[data-del-sample]').forEach((dbtn) => {
            dbtn.addEventListener('click', async (e) => {
              e.stopPropagation()
              const id = Number(dbtn.dataset.delSample)
              try {
                await API.deleteSample(id)
                toast('已删除')
                closeAction()
                render()
              } catch (err) {
                toast(API.friendlyError(err))
              }
            })
          })
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    })

    const catAddBtn = document.getElementById('catAddBtn')
    if (catAddBtn) {
      catAddBtn.addEventListener('click', () => {
        openAction(
          '新增服务分类',
          `<div class="field">
             <label class="field-label">分类名称</label>
             <input class="input" id="addCatName" placeholder="例如：漫剧制作">
           </div>
           <div class="field">
             <label class="field-label">分类标识 slug（小写英文 + 短横线，全站唯一）</label>
             <input class="input" id="addCatSlug" placeholder="例如：comic-drama">
           </div>
           <div class="field">
             <label class="field-label">图标（emoji）</label>
             <input class="input" id="addCatIcon" value="🎬">
           </div>
           <div class="field">
             <label class="field-label">描述</label>
             <textarea class="textarea" id="addCatDesc"></textarea>
           </div>
           <div class="field">
             <label class="field-label">配图地址（可选，留空显示 emoji）</label>
             <input class="input" id="addCatImage" placeholder="https://.../assets/covers/light/l-cat-08.jpg">
           </div>
           <div class="field">
             <label class="field-label">排序（可选，留空排到末尾）</label>
             <input class="input" id="addCatSort" type="number" min="1" placeholder="自动">
           </div>`,
          async () => {
            await API.createCategory({
              name: $('#addCatName').value.trim(),
              slug: $('#addCatSlug').value.trim(),
              icon: $('#addCatIcon').value.trim(),
              description: $('#addCatDesc').value.trim(),
              image_url: $('#addCatImage').value.trim(),
              sort_order: $('#addCatSort').value ? Number($('#addCatSort').value) : null
            })
            toast('分类已新增')
            render()
          },
          '新增'
        )
      })
    }

    document.querySelectorAll('[data-cat-edit]').forEach((btn) => {      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.catEdit)
        const c = S.categories.find((x) => x.id === id)
        openAction(
          '编辑分类 · ' + c.name,
          `<div class="field">
             <label class="field-label">分类名称</label>
             <input class="input" id="catName" value="${esc(c.name)}">
           </div>
           <div class="field">
             <label class="field-label">图标（emoji）</label>
             <input class="input" id="catIcon" value="${esc(c.icon || '')}">
           </div>
           <div class="field">
             <label class="field-label">描述</label>
             <textarea class="textarea" id="catDesc">${esc(c.description || '')}</textarea>
           </div>`,
          async () => {
            await API.updateCategory(id, {
              name: $('#catName').value.trim() || c.name,
              icon: $('#catIcon').value.trim(),
              description: $('#catDesc').value.trim()
            })
            toast('分类已更新')
            render()
          },
          '保存'
        )
      })
    })
  }

  /* ---------------- 首页内容 ---------------- */

  VIEWS.content = async function () {
    const banners = await API.listBanners()
    S.banners = banners
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">首页轮播位</div>
            <div class="card-sub">共 ${banners.length} 个 · 第一个为大横幅，其余为侧边小卡</div>
          </div>
          <button class="btn btn-primary btn-sm" id="addBanner">+ 新增轮播</button>
        </div>
        <div class="card-pad">
          ${
            banners.length
              ? banners
                  .map(
                    (b) => `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600">${esc(b.title)}</div>
                <div class="muted" style="margin-top:3px">${esc(b.subtitle || '')}</div>
                <div class="muted" style="margin-top:4px">跳转分类：${esc(b.link_value || '无')}</div>
              </div>
              <button class="btn btn-ghost btn-sm" data-banner-edit="${b.id}">编辑</button>
              <button class="btn btn-ghost btn-sm" data-banner-del="${b.id}">删除</button>
            </div>`
                  )
                  .join('')
              : '<div class="empty"><span class="empty-text">还没有轮播位</span></div>'
          }
        </div>
      </div>
    `
  }

  BINDS.content = function () {
    document.querySelectorAll('[data-banner-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.bannerEdit)
        const b = S.banners.find((x) => x.id === id)
        openAction(
          '编辑轮播位',
          `<div class="field">
             <label class="field-label">标题</label>
             <input class="input" id="bnTitle" value="${esc(b.title)}">
           </div>
           <div class="field">
             <label class="field-label">副标题</label>
             <input class="input" id="bnSub" value="${esc(b.subtitle || '')}">
           </div>
           <div class="field">
             <label class="field-label">跳转分类 slug</label>
             <input class="input" id="bnLink" value="${esc(b.link_value || '')}" placeholder="如 wedding-film">
           </div>`,
          async () => {
            await API.updateBanner(id, {
              title: $('#bnTitle').value.trim() || b.title,
              subtitle: $('#bnSub').value.trim(),
              link_value: $('#bnLink').value.trim()
            })
            toast('轮播已更新')
            render()
          },
          '保存'
        )
      })
    })

    document.querySelectorAll('[data-banner-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.bannerDel)
        openAction(
          '删除轮播位',
          '<p class="muted" style="line-height:1.7">删除后该位置不再展示，此操作不可撤销。</p>',
          async () => {
            await API.deleteBanner(id)
            toast('已删除')
            render()
          },
          '确认删除'
        )
      })
    })

    const add = $('#addBanner')
    if (add) {
      add.addEventListener('click', () => {
        openAction(
          '新增轮播位',
          `<div class="field">
             <label class="field-label">标题</label>
             <input class="input" id="bnTitle" placeholder="例如：品牌宣传片一站式">
           </div>
           <div class="field">
             <label class="field-label">副标题</label>
             <input class="input" id="bnSub" placeholder="一句话说明">
           </div>
           <div class="field">
             <label class="field-label">跳转分类 slug</label>
             <input class="input" id="bnLink" placeholder="如 brand-film">
           </div>`,
          async () => {
            const title = $('#bnTitle').value.trim()
            if (!title) throw new Error('请填写标题')
            await API.createBanner({
              title,
              subtitle: $('#bnSub').value.trim(),
              theme: 'amber',
              link_type: 'category',
              link_value: $('#bnLink').value.trim(),
              sort_order: 99
            })
            toast('已新增')
            render()
          },
          '新增'
        )
      })
    }
  }

  /* ---------------- 平台设置 ---------------- */

  VIEWS.settings = async function () {
    const settings = await API.getSettings()
    S.settings = settings
    const rate = Number(settings.commission_rate || 0) * 100
    return `
      <div class="card" style="max-width: 680px">
        <div class="card-head">
          <div>
            <div class="card-title">平台设置</div>
            <div class="card-sub">抽成比例、最低下单金额、客服信息</div>
          </div>
        </div>
        <div class="card-pad">
          <div class="field">
            <label class="field-label">平台抽成比例（%，从服务者收入中扣除）</label>
            <input class="input" id="setRate" type="number" step="0.1" value="${rate}">
          </div>
          <div class="field">
            <label class="field-label">最低下单金额（元）</label>
            <input class="input" id="setMin" type="number" value="${yuanShort(settings.min_order_amount)}">
          </div>
          <div class="field">
            <label class="field-label">客服电话</label>
            <input class="input" id="setPhone" value="${esc(settings.support_phone || '')}">
          </div>
          <div class="field">
            <label class="field-label">平台规则（展示在客户端首页与我的页面）</label>
            <textarea class="textarea" id="setNotice" style="height:100px">${esc(settings.notice || '')}</textarea>
            <div class="field-hint" id="setNoticeHint"></div>
          </div>
          <button class="btn btn-primary" id="saveSettings">保存设置</button>
        </div>
      </div>
    `
  }

  BINDS.settings = function () {
    const save = $('#saveSettings')
    if (!save) return

    // 抽成比例变化时，同步平台规则文案里的费率，避免客户端显示过期数字
    const rateInput = $('#setRate')
    const noticeInput = $('#setNotice')
    const hintEl = $('#setNoticeHint')

    // 实时提示：文案里的费率与实际费率是否一致
    const updateHint = () => {
      if (!rateInput || !noticeInput || !hintEl || !window.PlatformRules) return
      const rate = Number(rateInput.value)
      if (!Number.isFinite(rate)) {
        hintEl.textContent = ''
        hintEl.style.color = ''
        return
      }
      if (window.PlatformRules.isNoticeRateSynced(noticeInput.value, rate)) {
        hintEl.textContent = '文案中的服务费比例与上方抽成比例一致'
        hintEl.style.color = 'var(--ink-3)'
      } else {
        hintEl.textContent = '⚠️ 文案里的服务费比例与上方抽成比例不一致，保存时会自动同步'
        hintEl.style.color = '#A8463A'
      }
    }

    const syncNotice = () => {
      if (!rateInput || !noticeInput || !window.PlatformRules) return
      const rate = Number(rateInput.value)
      if (!Number.isFinite(rate)) return
      const next = window.PlatformRules.syncNoticeRate(noticeInput.value, rate)
      if (next !== noticeInput.value) {
        noticeInput.value = next
        toast('平台规则里的服务费比例已同步')
      }
      updateHint()
    }
    if (rateInput) {
      rateInput.addEventListener('change', syncNotice)
      rateInput.addEventListener('blur', syncNotice)
      rateInput.addEventListener('input', updateHint)
    }
    if (noticeInput) noticeInput.addEventListener('input', updateHint)
    updateHint()

    save.addEventListener('click', async () => {
      const rate = Number($('#setRate').value)
      if (Number.isNaN(rate) || rate < 0 || rate > 100) {
        toast('抽成比例需在 0–100 之间')
        return
      }
      try {
        // 保存前再同步一次（防止只填了费率没失焦）
        syncNotice()
        await API.updateSettings({
          commission_rate: rate / 100,
          min_order_amount: Math.round(Number($('#setMin').value) * 100),
          support_phone: $('#setPhone').value.trim(),
          notice: $('#setNotice').value.trim()
        })
        toast('设置已保存')
        render()
      } catch (e) {
        toast(API.friendlyError(e))
      }
    })
  }

  /* ---------------- 结算 ---------------- */

  VIEWS.settlements = async function () {
    const settlements = await API.listSettlements(S.settleFilter)
    const filters = [
      { k: 'all', l: '全部' },
      { k: 'pending', l: '待打款' },
      { k: 'paid', l: '已打款' }
    ]
    return `
      <div class="toolbar">
        ${filters.map((f) => `<button class="filter-chip ${S.settleFilter === f.k ? 'active' : ''}" data-sf="${f.k}">${f.l}</button>`).join('')}
        <span class="toolbar-spacer"></span>
        <button class="btn btn-primary btn-sm" id="genSettle">按已完成订单生成结算单</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr><th>结算周期</th><th>服务者</th><th>订单数</th><th>订单总额</th><th>平台抽成</th><th>应结金额</th><th>状态</th><th>生成时间</th><th style="text-align:right">操作</th></tr>
            </thead>
            <tbody>
              ${
                settlements.length
                  ? settlements
                      .map(
                        (st) => `
                <tr>
                  <td class="td-strong">${esc(st.period)}</td>
                  <td>服务者 #${st.provider_id}</td>
                  <td class="td-num">${st.order_count}</td>
                  <td class="td-num">¥${yuan(st.gross_amount)}</td>
                  <td class="td-num muted">¥${yuan(st.commission_amount)}</td>
                  <td class="td-amount td-num">¥${yuan(st.net_amount)}</td>
                  <td>${st.status === 'paid' ? '<span class="badge badge-paid">已打款</span>' : '<span class="badge badge-pending">待打款</span>'}</td>
                  <td class="muted">${fromNow(st.created_at)}</td>
                  <td>
                    <div class="td-actions">
                      ${
                        st.status === 'pending'
                          ? `<button class="btn btn-success btn-sm" data-pay="${st.id}">标记已打款</button>`
                          : '<span class="muted">—</span>'
                      }
                    </div>
                  </td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="9"><div class="empty"><div class="empty-icon">💰</div><span class="empty-text">还没有结算单</span><span class="empty-hint">点击右上角按已完成订单生成</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  BINDS.settlements = function () {
    document.querySelectorAll('[data-sf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.settleFilter = btn.dataset.sf
        render()
      })
    })

    const gen = $('#genSettle')
    if (gen) {
      gen.addEventListener('click', () => {
        const now = new Date()
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        openAction(
          '生成结算单',
          `<p class="muted" style="line-height:1.7;margin-bottom:14px">
             将按服务者汇总所有「已完成」订单，生成待打款结算单。订单总额扣掉平台抽成后为应结金额。
           </p>
           <div class="field">
             <label class="field-label">结算周期</label>
             <input class="input" id="stPeriod" value="${period}">
           </div>`,
          async () => {
            const created = await API.generateSettlements(
              $('#stPeriod').value.trim() || period,
              S.session.user.id,
              S.session.user.name || null
            )
            toast(`已生成 ${created.length} 张结算单`)
            render()
          },
          '生成'
        )
      })
    }

    document.querySelectorAll('[data-pay]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.pay)
        try {
          await API.paySettlement(id, S.session.user.id, S.session.user.name || null)
          toast('已标记打款')
          render()
        } catch (e) {
          toast(API.friendlyError(e))
        }
      })
    })
  }

  /* ---------------- 操作日志 ---------------- */

  VIEWS.logs = async function () {
    const logs = await API.listAdminActions(80)
    S.logs = logs
    const actionText = {
      approve_application: '通过入驻申请',
      reject_application: '驳回入驻申请',
      update_order_status: '修改订单状态',
      generate_settlements: '生成结算单',
      pay_settlement: '结算打款'
    }
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">操作日志</div>
            <div class="card-sub">记录管理端的写操作，用于追溯</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th></tr></thead>
            <tbody>
              ${
                logs.length
                  ? logs
                      .map(
                        (l) => `
                <tr>
                  <td class="muted">${fromNow(l.created_at)}</td>
                  <td>${esc(l.admin_name || l.admin_uid)}</td>
                  <td class="td-strong">${esc(actionText[l.action] || l.action)}</td>
                  <td class="mono">${esc(l.target_type || '')}${l.target_id ? ' #' + esc(l.target_id) : ''}</td>
                  <td class="muted">${esc(l.detail || '')}</td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="5"><div class="empty"><span class="empty-text">暂无操作记录</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  /* ---------------- 群聊管理 ---------------- */

  /* ---------------- 商家管理 ---------------- */

  VIEWS.merchants = async function () {
    const [shops, tasks, stats] = await Promise.all([
      API.adminListMerchants(), API.adminListMerchantTasks(), API.merchantStats()
    ])
    S.merchantShops = shops
    S.merchantTasks = tasks
    const shopMap = {}
    shops.forEach((m) => { shopMap[m.id] = m })
    const nowTs = Date.now()
    const payOf = (m) => {
      const until = m.paid_until ? new Date(m.paid_until).getTime() : 0
      const ok = m.payment_status === 'paid' && until > nowTs
      return {
        ok,
        label: ok ? '已缴费' : m.payment_status === 'paid' ? '已到期' : '未缴费',
        until: String(m.paid_until || '').slice(0, 10)
      }
    }
    const paidShops = shops.filter((m) => payOf(m).ok).length
    const cards = [
      ['入驻商家', stats.merchants, '家'], ['启用中', stats.active, '家'],
      ['已缴费', paidShops, '家'], ['发布任务', stats.tasks, '条'],
      ['招募中', stats.open, '条'], ['收到报名', stats.applications, '条']
    ].map(([label, val, unit]) => `
      <div class="card card-pad" style="padding:16px 18px">
        <div style="font-size:12px;color:#61738A;margin-bottom:8px">${label}</div>
        <div style="font-size:25px;font-weight:800;color:#0B1F33;line-height:1">${val}<span style="font-size:12px;font-weight:600;color:#8A9AAE;margin-left:4px">${unit}</span></div>
      </div>`).join('')

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:18px">${cards}</div>

      <div class="card">
        <div class="card-head"><div><div class="card-title">商家店铺</div><div class="card-sub">共 ${shops.length} 家 · 可认证、停用；停用后店铺与其任务对用户端不可见</div></div>
          <button class="btn btn-ghost btn-sm" id="mcAdmRefresh">刷新</button></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>店铺</th><th>店主</th><th>分类 / 城市</th><th>认证</th><th>缴费</th><th>状态</th><th>开通时间</th><th>操作</th></tr></thead>
          <tbody>
            ${shops.length ? shops.map((m) => `
              <tr>
                <td class="td-strong">${esc(m.name)}</td>
                <td class="muted ellipsis" style="max-width:150px">${esc(m.owner_id || '')}</td>
                <td class="muted">${esc(m.category_slug || '—')} / ${esc(m.city || '—')}</td>
                <td style="white-space:nowrap"><span class="badge ${m.is_verified ? '' : 'badge-pending'}">${m.is_verified ? '已认证' : '待认证'}</span></td>
                <td style="white-space:nowrap"><span class="badge ${payOf(m).ok ? '' : 'badge-pending'}">${payOf(m).label}</span><div class="muted" style="font-size:11px;margin-top:4px">${payOf(m).until ? '至 ' + esc(payOf(m).until) : '未开通'}</div></td>
                <td style="white-space:nowrap"><span class="badge ${m.status === 'active' ? '' : 'badge-cancelled'}">${m.status === 'active' ? '启用中' : '已停用'}</span></td>
                <td class="muted" style="white-space:nowrap">${fromNow(m.created_at)}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-soft btn-sm" data-mc-verify="${m.id}" data-next="${m.is_verified ? '0' : '1'}">${m.is_verified ? '取消认证' : '认证'}</button>
                  <button class="btn btn-ghost btn-sm" data-mc-shop-status="${m.id}" data-next="${m.status === 'active' ? 'suspended' : 'active'}">${m.status === 'active' ? '停用' : '启用'}</button>
                </td>
              </tr>`).join('')
              : '<tr><td colspan="8"><div class="empty"><span class="empty-text">还没有商家入驻</span></div></td></tr>'}
          </tbody>
        </table></div>
      </div>

      <div class="card" style="margin-top:18px">
        <div class="card-head"><div><div class="card-title">商家任务</div><div class="card-sub">共 ${tasks.length} 条 · 含参考视频标记；下架后用户端立即不可见</div></div></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>任务</th><th>所属商家</th><th>预算</th><th>参考视频</th><th>状态</th><th>发布时间</th><th>操作</th></tr></thead>
          <tbody>
            ${tasks.length ? tasks.map((t) => `
              <tr>
                <td class="td-strong" style="min-width:220px">${esc(t.title)}</td>
                <td class="muted">${esc((shopMap[t.merchant_id] || {}).name || '—')}</td>
                <td style="white-space:nowrap">${Number(t.budget) > 0 ? '¥' + yuanShort(t.budget) : '面议'}</td>
                <td style="white-space:nowrap">${t.reference_video_path ? '▶ 已上传' : '<span class="muted">—</span>'}</td>
                <td style="white-space:nowrap"><span class="badge ${t.status === 'open' ? '' : 'badge-pending'}">${t.status === 'open' ? '招募中' : t.status === 'hidden' ? '已下架' : '已结束'}</span></td>
                <td class="muted" style="white-space:nowrap">${fromNow(t.created_at)}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-soft btn-sm" data-mc-task-status="${t.id}" data-next="${t.status === 'hidden' ? 'open' : 'hidden'}">${t.status === 'hidden' ? '恢复' : '下架'}</button>
                </td>
              </tr>`).join('')
              : '<tr><td colspan="7"><div class="empty"><span class="empty-text">还没有商家发布任务</span></div></td></tr>'}
          </tbody>
        </table></div>
      </div>
    `
  }

  BINDS.merchants = function () {
    const refresh = $('#mcAdmRefresh')
    if (refresh) refresh.addEventListener('click', () => render())

    document.querySelectorAll('[data-mc-verify]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await API.setMerchantVerified(Number(btn.dataset.mcVerify), btn.dataset.next === '1')
          toast(btn.dataset.next === '1' ? '已认证' : '已取消认证')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })
    document.querySelectorAll('[data-mc-shop-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await API.setMerchantStatus(Number(btn.dataset.mcShopStatus), btn.dataset.next)
          toast(btn.dataset.next === 'active' ? '店铺已启用' : '店铺已停用')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })
    document.querySelectorAll('[data-mc-task-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await API.setMerchantTaskStatus(Number(btn.dataset.mcTaskStatus), btn.dataset.next)
          toast(btn.dataset.next === 'open' ? '任务已恢复' : '任务已下架')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })
  }

  /* ---------------- 商家收费管理 ---------------- */

  function billPlanFormHtml(p) {
    const v = p || {}
    const benefits = Array.isArray(v.benefits) ? v.benefits.join('\n') : ''
    const money = (c) => (Number(c || 0) / 100)
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label class="field-label">套餐编码（唯一） <span style="color:#DC2626">*</span></label><input class="input" id="bpCode" maxlength="30" value="${esc(v.code || '')}" placeholder="例：pro"></div>
        <div><label class="field-label">套餐名称 <span style="color:#DC2626">*</span></label><input class="input" id="bpName" maxlength="40" value="${esc(v.name || '')}" placeholder="例：标准入驻"></div>
      </div>
      <label class="field-label" style="margin-top:10px">副标题</label>
      <input class="input" id="bpSubtitle" maxlength="80" value="${esc(v.subtitle || '')}" placeholder="例：稳定发布需求 · 最受欢迎">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:10px">
        <div><label class="field-label">入驻服务费（元）</label><input class="input" id="bpPrice" type="number" min="0" step="1" value="${money(v.price_cents)}"></div>
        <div><label class="field-label">一次性开店费（元）</label><input class="input" id="bpOnboard" type="number" min="0" step="1" value="${money(v.onboarding_fee_cents)}"></div>
        <div><label class="field-label">可退保证金（元）</label><input class="input" id="bpDeposit" type="number" min="0" step="1" value="${money(v.deposit_cents)}"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:10px">
        <div><label class="field-label">服务周期（天）</label><input class="input" id="bpPeriod" type="number" min="1" value="${Number(v.period_days || 365)}"></div>
        <div><label class="field-label">每年任务上限（0 不限）</label><input class="input" id="bpTasks" type="number" min="0" value="${Number(v.max_tasks || 0)}"></div>
        <div><label class="field-label">视频上限（MB）</label><input class="input" id="bpVideo" type="number" min="1" value="${Number(v.max_video_mb || 100)}"></div>
        <div><label class="field-label">排序权重</label><input class="input" id="bpSort" type="number" min="0" value="${Number(v.sort_order || 0)}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <div><label class="field-label">推荐优先级（&gt;0 自动认证）</label><input class="input" id="bpPriority" type="number" min="0" value="${Number(v.priority_level || 0)}"></div>
        <div><label class="field-label">状态</label><select class="input" id="bpStatus"><option value="on" ${v.status !== 'off' ? 'selected' : ''}>上架销售</option><option value="off" ${v.status === 'off' ? 'selected' : ''}>下架停售</option></select></div>
      </div>
      <label class="field-label" style="margin-top:10px">套餐权益（每行一条）</label>
      <textarea class="input" id="bpBenefits" rows="5" placeholder="独立店铺主页&#10;每年 30 个制作任务">${esc(benefits)}</textarea>
      <label class="field-label" style="margin-top:10px">费用说明</label>
      <textarea class="input" id="bpDesc" rows="2" maxlength="300" placeholder="入驻服务费 ¥2,980/年 + 开店服务费 ¥500 + 可退保证金 ¥1,000">${esc(v.description || '')}</textarea>
      <p class="muted" style="margin-top:10px;font-size:12px;line-height:1.7">金额以「分」存入数据库，由服务端按套餐表回写订单金额，客户端无法改价。</p>`
  }

  function billReadPlanForm() {
    const val = (id) => (document.getElementById(id) || {}).value || ''
    return {
      code: val('bpCode').trim(),
      name: val('bpName').trim(),
      subtitle: val('bpSubtitle').trim(),
      price_cents: Math.round(Number(val('bpPrice') || 0) * 100),
      onboarding_fee_cents: Math.round(Number(val('bpOnboard') || 0) * 100),
      deposit_cents: Math.round(Number(val('bpDeposit') || 0) * 100),
      period_days: Number(val('bpPeriod') || 365),
      max_tasks: Number(val('bpTasks') || 0),
      max_video_mb: Number(val('bpVideo') || 100),
      sort_order: Number(val('bpSort') || 0),
      priority_level: Number(val('bpPriority') || 0),
      status: val('bpStatus'),
      benefits: val('bpBenefits'),
      description: val('bpDesc')
    }
  }

  VIEWS.billing = async function () {
    const [orders, plans, stats, shops, cfg] = await Promise.all([
      API.adminListEnrollOrders('all').catch(() => []),
      API.listMerchantPlans(true).catch(() => []),
      API.merchantBillingStats().catch(() => ({})),
      API.adminListMerchants().catch(() => []),
      API.getMerchantPayConfig().catch(() => ({}))
    ])
    S.billOrders = orders
    S.billPlans = plans
    S.billShops = shops
    const shopMap = {}
    shops.forEach((s) => { shopMap[s.id] = s })
    const now = Date.now()
    const yuan0 = (c) => '¥' + (Number(c || 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
    const cards = [
      ['累计实收', yuan0(stats.paidAmount), '已确认到账'],
      ['待收款', yuan0(stats.pendingAmount), stats.pendingOrders + ' 笔待审核'],
      ['付费有效商家', (stats.paidShops || 0) + ' 家', '服务期内'],
      ['欠费 / 到期', (stats.unpaidShops || 0) + ' 家', '已停止对外展示'],
      ['30 天内到期', (stats.expiringSoon || 0) + ' 家', '建议提醒续费']
    ].map(([label, value, sub]) => `
      <div class="card card-pad" style="padding:16px 18px">
        <div style="font-size:12px;color:#61738A;margin-bottom:8px">${label}</div>
        <div style="font-size:24px;font-weight:800;color:#0B1F33;line-height:1.1">${value}</div>
        <div style="font-size:11px;color:#8A9AAE;margin-top:6px">${sub}</div>
      </div>`).join('')

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;margin-bottom:18px">${cards}</div>

      <div class="card">
        <div class="card-head">
          <div><div class="card-title">入驻缴费订单</div>
            <div class="card-sub">共 ${orders.length} 笔 · 待审核 ${orders.filter((o) => o.status === 'pending').length} 笔 · 确认收款后自动激活店铺并写入服务期</div></div>
          <button class="btn btn-ghost btn-sm" id="billRefresh">刷新</button>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>订单号</th><th>店铺</th><th>套餐</th><th>应付</th><th>付款信息</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
          <tbody>
            ${orders.length ? orders.map((o) => {
              const s = shopMap[o.merchant_id] || {}
              return `<tr>
                <td class="td-strong" style="white-space:nowrap">${esc(o.order_no)}</td>
                <td>${esc(s.name || '店铺已删除')}</td>
                <td>${esc(o.plan_name || o.plan_code || '—')}</td>
                <td class="td-strong" style="white-space:nowrap">${yuan0(o.amount_cents)}</td>
                <td class="muted ellipsis" style="max-width:190px">
                  ${esc(o.transaction_id || '—')}
                  ${o.payment_proof_path ? `<button class="btn btn-ghost btn-sm" style="margin-left:6px" data-bill-proof="${esc(o.payment_proof_path)}">看凭证</button>` : ''}
                </td>
                <td style="white-space:nowrap"><span class="badge ${o.status === 'paid' ? '' : o.status === 'pending' ? 'badge-pending' : 'badge-cancelled'}">${API.ENROLL_STATUS_TEXT[o.status] || esc(o.status)}</span></td>
                <td class="muted" style="white-space:nowrap">${fromNow(o.created_at)}</td>
                <td style="white-space:nowrap">
                  ${o.status === 'pending'
                    ? `<button class="btn btn-primary btn-sm" data-bill-approve="${o.id}">确认收款</button>
                       <button class="btn btn-ghost btn-sm" data-bill-reject="${o.id}" style="color:#B42318">驳回</button>`
                    : `<span class="muted">${esc(o.review_note || '—')}</span>`}
                </td>
              </tr>`
            }).join('') : '<tr><td colspan="8"><div class="empty"><span class="empty-text">还没有入驻缴费订单</span></div></td></tr>'}
          </tbody>
        </table></div>
      </div>

      <div class="card" style="margin-top:18px">
        <div class="card-head">
          <div><div class="card-title">入驻套餐与定价</div><div class="card-sub">共 ${plans.length} 档 · 改价立即影响新订单，已生成订单按提交时套餐结算</div></div>
          <button class="btn btn-soft btn-sm" id="billAddPlan">＋ 新增套餐</button>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>套餐</th><th>年费</th><th>开店费</th><th>保证金</th><th>首期合计</th><th>周期 / 任务 / 视频</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${plans.length ? plans.map((p) => `<tr>
              <td class="td-strong">${esc(p.name)}<div class="muted" style="font-size:11px;font-weight:400">${esc(p.code)}</div></td>
              <td>${yuan0(p.price_cents)}</td>
              <td>${yuan0(p.onboarding_fee_cents)}</td>
              <td>${yuan0(p.deposit_cents)}</td>
              <td class="td-strong">${yuan0(p.totalCents)}</td>
              <td class="muted">${Number(p.period_days || 365)} 天 / ${Number(p.max_tasks) > 0 ? p.max_tasks + ' 个' : '不限'} / ${p.max_video_mb || 100}MB</td>
              <td style="white-space:nowrap"><span class="badge ${p.status === 'on' ? '' : 'badge-cancelled'}">${p.status === 'on' ? '销售中' : '已下架'}</span></td>
              <td style="white-space:nowrap">
                <button class="btn btn-soft btn-sm" data-plan-edit="${p.id}">编辑</button>
                <button class="btn btn-ghost btn-sm" data-plan-toggle="${p.id}" data-next="${p.status === 'on' ? 'off' : 'on'}">${p.status === 'on' ? '下架' : '上架'}</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="8"><div class="empty"><span class="empty-text">还没有配置入驻套餐</span></div></td></tr>'}
          </tbody>
        </table></div>
      </div>

      <div class="card card-pad" style="margin-top:18px;max-width:760px">
        <div class="card-title">对公收款账户</div>
        <div class="card-sub" style="margin-bottom:14px">展示在用户端入驻页与缴费面板；请勿填写私人账户</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label class="field-label">户名</label><input class="input" id="billPayName" maxlength="80" value="${esc(cfg.payName || '')}"></div>
          <div><label class="field-label">开户行</label><input class="input" id="billPayBank" maxlength="120" value="${esc(cfg.payBank || '')}"></div>
        </div>
        <label class="field-label" style="margin-top:10px">对公账号</label>
        <input class="input" id="billPayAccount" maxlength="120" value="${esc(cfg.payAccount || '')}" placeholder="企业银行账号">
        <label class="field-label" style="margin-top:10px">转账说明</label>
        <textarea class="input" id="billPayNote" rows="2" maxlength="300">${esc(cfg.payNote || '')}</textarea>
        <button class="btn btn-primary btn-sm" id="billPaySave" style="margin-top:12px">保存收款信息</button>
      </div>

      <div class="card" style="margin-top:18px">
        <div class="card-head"><div><div class="card-title">商家缴费台账</div>
          <div class="card-sub">共 ${shops.length} 家 · 欠费或到期店铺自动对用户端隐藏，且无法发布任务</div></div></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>店铺</th><th>套餐</th><th>缴费状态</th><th>服务到期</th><th>剩余</th><th>店铺状态</th><th>操作</th></tr></thead>
          <tbody>
            ${shops.length ? shops.map((s) => {
              const until = s.paid_until ? new Date(s.paid_until).getTime() : 0
              const valid = s.payment_status === 'paid' && until > now
              const days = valid ? Math.ceil((until - now) / 86400000) : 0
              return `<tr>
                <td class="td-strong">${esc(s.name)}</td>
                <td class="muted">${esc(s.plan_code || '—')}</td>
                <td style="white-space:nowrap"><span class="badge ${valid ? '' : 'badge-pending'}">${valid ? '已缴费' : s.payment_status === 'paid' ? '已到期' : '未缴费'}</span></td>
                <td class="muted" style="white-space:nowrap">${esc(String(s.paid_until || '').slice(0, 10)) || '—'}</td>
                <td class="muted" style="white-space:nowrap">${valid ? days + ' 天' : '—'}</td>
                <td style="white-space:nowrap">${s.status === 'active' ? '启用中' : '已停用'}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-soft btn-sm" data-bill-activate="${s.id}">标记已收款（1 年）</button>
                  <button class="btn btn-ghost btn-sm" data-bill-suspend="${s.id}" style="color:#B42318">停用</button>
                </td>
              </tr>`
            }).join('') : '<tr><td colspan="7"><div class="empty"><span class="empty-text">还没有商家入驻</span></div></td></tr>'}
          </tbody>
        </table></div>
      </div>
    `
  }

  BINDS.billing = function () {
    const refresh = $('#billRefresh')
    if (refresh) refresh.addEventListener('click', () => render())

    document.querySelectorAll('[data-bill-approve]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const order = (S.billOrders || []).filter((o) => String(o.id) === String(btn.dataset.billApprove))[0]
        if (!order) return
        openAction(
          '确认收款 · ' + order.order_no,
          `<p class="muted" style="line-height:1.8;margin-bottom:14px">确认后系统会把订单置为「已收款」，同时激活关联店铺、写入 ${Number(order.period_days || 365)} 天服务期与套餐权益。请务必先核实对公账户已到账。</p>
           <label class="field-label">银行流水号（可选）</label>
           <input class="input" id="billTxn" maxlength="80" value="${esc(order.transaction_id || '')}" placeholder="例：20261105 对公转账">
           <label class="field-label" style="margin-top:10px">审核备注（可选）</label>
           <textarea class="input" id="billNote" rows="2" maxlength="200" placeholder="例：已核对到账，金额一致"></textarea>`,
          async () => {
            await API.adminReviewEnrollOrder(Number(order.id), true, (document.getElementById('billNote') || {}).value, (document.getElementById('billTxn') || {}).value)
            toast('已确认收款，店铺已开通')
            render()
          },
          '确认收款并开通'
        )
      })
    })

    document.querySelectorAll('[data-bill-reject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openAction(
          '驳回缴费订单',
          `<label class="field-label">驳回原因（用户可见）</label>
           <textarea class="input" id="billNote" rows="3" maxlength="200" placeholder="例：未查询到该笔到账，请核对金额与订单号后重新上传凭证"></textarea>`,
          async () => {
            await API.adminReviewEnrollOrder(Number(btn.dataset.billReject), false, (document.getElementById('billNote') || {}).value, '')
            toast('订单已驳回，商家可重新提交')
            render()
          },
          '确认驳回'
        )
      })
    })

    document.querySelectorAll('[data-bill-proof]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = await API.resolveMedia(btn.dataset.billProof)
        openAction('付款凭证', url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="付款凭证" style="max-width:100%;border-radius:10px;border:1px solid #E1EAFB"></a><p class="muted" style="margin-top:10px;font-size:12px">点图片可打开原图</p>`
          : '<p class="muted">凭证地址已过期或无法生成访问链接，请让商家重新上传。</p>', null)
      })
    })

    document.querySelectorAll('[data-plan-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = (S.billPlans || []).filter((x) => String(x.id) === String(btn.dataset.planEdit))[0]
        if (!p) return
        openAction('编辑入驻套餐', billPlanFormHtml(p), async () => {
          await API.adminSaveMerchantPlan({ ...billReadPlanForm(), id: p.id })
          toast('套餐已保存')
          render()
        }, '保存套餐')
      })
    })

    const addBtn = $('#billAddPlan')
    if (addBtn) addBtn.addEventListener('click', () => {
      openAction('新增入驻套餐', billPlanFormHtml({ period_days: 365, max_video_mb: 100, sort_order: (S.billPlans || []).length + 1, status: 'on' }), async () => {
        await API.adminSaveMerchantPlan(billReadPlanForm())
        toast('套餐已创建')
        render()
      }, '创建套餐')
    })

    document.querySelectorAll('[data-plan-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = (S.billPlans || []).filter((x) => String(x.id) === String(btn.dataset.planToggle))[0]
        if (!p) return
        btn.disabled = true
        try {
          await API.adminSaveMerchantPlan({ ...p, status: btn.dataset.next })
          toast(btn.dataset.next === 'on' ? '套餐已上架' : '套餐已下架')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })

    const paySave = $('#billPaySave')
    if (paySave) paySave.addEventListener('click', async () => {
      paySave.disabled = true
      try {
        await API.adminSaveMerchantPayConfig({
          enabled: true,
          payName: ($('#billPayName') || {}).value,
          payBank: ($('#billPayBank') || {}).value,
          payAccount: ($('#billPayAccount') || {}).value,
          payNote: ($('#billPayNote') || {}).value
        })
        toast('收款信息已保存，用户端即时生效')
      } catch (e) { toast(API.friendlyError(e)) } finally { paySave.disabled = false }
    })

    document.querySelectorAll('[data-bill-activate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await API.adminSetMerchantPayment(Number(btn.dataset.billActivate), true, 365)
          toast('已标记收款并开通 1 年服务期')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })

    document.querySelectorAll('[data-bill-suspend]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await API.adminSetMerchantPayment(Number(btn.dataset.billSuspend), false)
          toast('店铺已停用并标记为欠费')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })
  }

  /* ---------------- 公告管理 ---------------- */

  function noticeFormHtml(a) {
    const v = a || {}
    const toLocal = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    return `
      <label class="field-label">公告标题 <span style="color:#DC2626">*</span></label>
      <input class="input" id="ntTitle" maxlength="80" placeholder="例：新版首页上线 · 平台数据实时可视化" value="${esc(v.title || '')}">
      <label class="field-label">公告正文</label>
      <textarea class="input" id="ntContent" rows="4" maxlength="600" placeholder="点击公告后展示的完整内容">${esc(v.content || '')}</textarea>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="field-label">标签</label>
          <input class="input" id="ntTag" maxlength="8" placeholder="公告 / 活动 / 提醒" value="${esc(v.tag || '公告')}">
        </div>
        <div>
          <label class="field-label">级别（决定标签颜色）</label>
          <select class="input" id="ntLevel">
            <option value="info" ${v.level === 'info' || !v.level ? 'selected' : ''}>普通 · 蓝</option>
            <option value="activity" ${v.level === 'activity' ? 'selected' : ''}>活动 · 紫</option>
            <option value="important" ${v.level === 'important' ? 'selected' : ''}>重要 · 红</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="field-label">排序权重（越大越靠前）</label>
          <input class="input" id="ntSort" type="number" value="${Number(v.sort_order) || 0}">
        </div>
        <div>
          <label class="field-label">跳转链接（可选，如 #/groups）</label>
          <input class="input" id="ntLink" maxlength="200" placeholder="留空则只展示正文" value="${esc(v.link || '')}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="field-label">开始展示（可选）</label>
          <input class="input" id="ntStart" type="datetime-local" value="${toLocal(v.starts_at)}">
        </div>
        <div>
          <label class="field-label">结束展示（可选）</label>
          <input class="input" id="ntEnd" type="datetime-local" value="${toLocal(v.ends_at)}">
        </div>
      </div>
      <div style="display:flex;gap:22px;margin-top:14px">
        <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:#475569;cursor:pointer">
          <input type="checkbox" id="ntPinned" ${v.is_pinned ? 'checked' : ''}> 置顶
        </label>
        <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:#475569;cursor:pointer">
          <input type="checkbox" id="ntActive" ${v.is_active !== false ? 'checked' : ''}> 立即启用
        </label>
      </div>
    `
  }

  /** 从表单读数；datetime-local 转 ISO，空值转 null */
  function readNoticeForm() {
    const iso = (id) => {
      const val = ($(id) && $(id).value) || ''
      if (!val) return null
      const d = new Date(val)
      return isNaN(d.getTime()) ? null : d.toISOString()
    }
    return {
      title: $('#ntTitle').value.trim(),
      content: $('#ntContent').value.trim(),
      tag: $('#ntTag').value.trim(),
      level: $('#ntLevel').value,
      link: $('#ntLink').value.trim(),
      sort_order: Number($('#ntSort').value) || 0,
      starts_at: iso('#ntStart'),
      ends_at: iso('#ntEnd'),
      is_pinned: $('#ntPinned').checked,
      is_active: $('#ntActive').checked
    }
  }

  /** 新建 / 编辑公告，提交后立刻重绘（上方预览同步变化） */
  function openNoticeForm(row) {
    const isEdit = !!row
    openAction(
      isEdit ? '编辑公告' : '发布新公告',
      noticeFormHtml(row),
      async () => {
        const payload = readNoticeForm()
        if (!payload.title) throw new Error('请填写公告标题')
        if (payload.starts_at && payload.ends_at && new Date(payload.starts_at) >= new Date(payload.ends_at)) {
          throw new Error('结束时间必须晚于开始时间')
        }
        if (isEdit) {
          await API.updateAnnouncement(row.id, payload)
          await API.setAnnouncementActive(row.id, payload.is_active)
        } else {
          await API.createAnnouncement(payload)
        }
        toast(isEdit ? '公告已保存' : '公告已发布')
        render()
      },
      isEdit ? '保存' : '发布'
    )
  }

  VIEWS.notice = async function () {
    const rows = await API.adminListAnnouncements()
    S.announcements = rows
    const now = Date.now()
    const isLive = (a) =>
      a.is_active &&
      (!a.starts_at || new Date(a.starts_at).getTime() <= now) &&
      (!a.ends_at || new Date(a.ends_at).getTime() >= now)
    const live = rows.filter(isLive)
    const pinned = rows.filter((a) => a.is_pinned && isLive(a)).length

    const statCards = [
      ['公告总数', rows.length, '条'],
      ['展示中', live.length, '条'],
      ['置顶', pinned, '条'],
      ['已停用 / 过期', rows.length - live.length, '条']
    ]
      .map(([label, val, unit]) => `
        <div class="card card-pad" style="padding:18px 20px">
          <div style="font-size:12px;color:#61738A;margin-bottom:8px">${label}</div>
          <div style="font-size:26px;font-weight:800;color:#0B1F33;line-height:1">${val}<span style="font-size:12px;font-weight:600;color:#8A9AAE;margin-left:4px">${unit}</span></div>
        </div>`)
      .join('')

    // 实时预览：与用户端同一套 notice-* 视觉，直接看得到滚动效果
    const pv = live.length ? live : rows.slice(0, 3)
    const lvCls = (l) => (l === 'important' ? 'nt-important' : l === 'activity' ? 'nt-activity' : 'nt-info')
    const one = pv.length
      ? pv.map((a) => `<span class="notice-item"><span class="notice-tag ${lvCls(a.level)}">${esc(a.tag || '公告')}</span><span class="notice-title">${esc(a.title)}</span>${a.is_pinned ? '<span class="notice-pin">置顶</span>' : ''}<span class="notice-sep">·</span></span>`).join('')
      : '<span class="notice-item"><span class="notice-title">暂无展示中的公告，发布后这里会实时预览</span><span class="notice-sep">·</span></span>'
    const group = one + one + one
    const preview = `
      <div class="admin-notice-preview">
        <div class="notice-bar-inner">
          <span class="notice-label"><span class="notice-label-icon">📢</span>平台公告</span>
          <div class="notice-viewport">
            <div class="notice-track">
              <div class="notice-group">${group}</div>
              <div class="notice-group" aria-hidden="true">${group}</div>
            </div>
          </div>
          <span class="notice-more">全部 ›</span>
        </div>
      </div>`

    const period = (a) => {
      const d = (iso) => (iso ? fromNow(iso) : '')
      if (!a.starts_at && !a.ends_at) return '<span class="muted">长期有效</span>'
      if (!a.ends_at) return `<span class="muted">${d(a.starts_at)}起</span>`
      return `<span class="muted">至 ${d(a.ends_at)}</span>`
    }

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:18px">${statCards}</div>

      <div style="font-size:12px;color:#61738A;margin:0 0 8px 2px">用户端滚动栏实时预览</div>
      ${preview}

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">公告列表</div>
            <div class="card-sub">共 ${rows.length} 条 · 置顶优先，其次按排序权重 · 停用或过期后用户端立即不显示</div>
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost btn-sm" id="ntRefresh">刷新</button>
            <button class="btn btn-primary btn-sm" id="ntCreate">＋ 发布公告</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>公告</th><th>正文摘要</th><th>状态</th><th>有效期</th><th>权重</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map((a) => `
                <tr>
                  <td class="td-strong" style="min-width:270px;max-width:340px">
                    <span class="notice-tag ${lvCls(a.level)}">${esc(a.tag || '公告')}</span>
                    ${esc(a.title)}
                    ${a.is_pinned ? '<span class="notice-pin" style="margin-left:6px">置顶</span>' : ''}
                  </td>
                  <td class="muted ellipsis" style="max-width:240px">${esc(a.content || '—')}</td>
                  <td style="white-space:nowrap"><span class="badge ${isLive(a) ? '' : 'badge-pending'}">${isLive(a) ? '展示中' : a.is_active ? '未到期 / 已过期' : '已停用'}</span></td>
                  <td style="white-space:nowrap">${period(a)}</td>
                  <td class="muted">${Number(a.sort_order) || 0}</td>
                  <td class="muted">${fromNow(a.updated_at || a.created_at)}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-soft btn-sm" data-nt-edit="${a.id}">编辑</button>
                    <button class="btn btn-ghost btn-sm" data-nt-pin="${a.id}" data-next="${a.is_pinned ? '0' : '1'}">${a.is_pinned ? '取消置顶' : '置顶'}</button>
                    <button class="btn btn-ghost btn-sm" data-nt-toggle="${a.id}" data-next="${a.is_active ? '0' : '1'}">${a.is_active ? '停用' : '启用'}</button>
                    <button class="btn btn-ghost btn-sm" data-nt-del="${a.id}" style="color:#DC2626">删除</button>
                  </td>
                </tr>`).join('')
                : '<tr><td colspan="7"><div class="empty"><span class="empty-text">还没有公告，点「发布公告」新建一条</span></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  BINDS.notice = function () {
    const refreshBtn = $('#ntRefresh')
    if (refreshBtn) refreshBtn.addEventListener('click', () => render())
    const createBtn = $('#ntCreate')
    if (createBtn) createBtn.addEventListener('click', () => openNoticeForm(null))

    const find = (id) => (S.announcements || []).filter((a) => String(a.id) === String(id))[0]

    document.querySelectorAll('[data-nt-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = find(btn.dataset.ntEdit)
        if (row) openNoticeForm(row)
      })
    })

    document.querySelectorAll('[data-nt-pin]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await API.setAnnouncementPinned(Number(btn.dataset.ntPin), btn.dataset.next === '1')
          toast(btn.dataset.next === '1' ? '已置顶' : '已取消置顶')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })

    document.querySelectorAll('[data-nt-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await API.setAnnouncementActive(Number(btn.dataset.ntToggle), btn.dataset.next === '1')
          toast(btn.dataset.next === '1' ? '已启用' : '已停用')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })

    document.querySelectorAll('[data-nt-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = find(btn.dataset.ntDel)
        if (!row || !confirm(`确定删除公告「${row.title}」？此操作不可恢复。`)) return
        btn.disabled = true
        try {
          await API.deleteAnnouncement(Number(btn.dataset.ntDel))
          toast('公告已删除')
          render()
        } catch (e) { toast(API.friendlyError(e)) } finally { btn.disabled = false }
      })
    })
  }

  VIEWS.chat = async function () {
    const [groups, stats] = await Promise.all([API.adminListChatGroups(), API.chatStats()])
    S.chatGroups = groups
    const statCards = [
      ['公开群', stats.groups, '个'],
      ['启用中', stats.active, '个'],
      ['群消息', stats.messages, '条'],
      ['今日新消息', stats.today, '条'],
      ['入群成员', stats.members, '人']
    ]
      .map(
        ([label, val, unit]) => `
        <div class="card card-pad" style="padding:18px 20px">
          <div style="font-size:12px;color:#61738A;margin-bottom:8px">${label}</div>
          <div style="font-size:26px;font-weight:800;color:#0B1F33;line-height:1">${val}<span style="font-size:12px;font-weight:600;color:#8A9AAE;margin-left:4px">${unit}</span></div>
        </div>`
      )
      .join('')

    return `
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:18px">${statCards}</div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">群聊管理</div>
            <div class="card-sub">共 ${groups.length} 个群 · 可新建、停用与审核消息</div>
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost btn-sm" id="chatRefresh">刷新</button>
            <button class="btn btn-primary btn-sm" id="chatCreateBtn">＋ 新建群聊</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>群聊</th><th>简介</th><th>创建者</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              ${
                groups.length
                  ? groups
                      .map(
                        (g) => `
                <tr>
                  <td class="td-strong">${esc(g.icon || '💬')} ${esc(g.name)}</td>
                  <td class="muted ellipsis" style="max-width:260px">${esc(g.description || '—')}</td>
                  <td class="muted">${esc(g.owner_name || (g.owner_id === 'platform' ? '平台官方' : '用户'))}</td>
                  <td><span class="badge ${g.status === 'active' ? '' : 'badge-pending'}">${g.status === 'active' ? '启用中' : '已停用'}</span></td>
                  <td class="muted">${fromNow(g.created_at)}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-soft btn-sm" data-group-msgs="${g.id}" data-group-name="${esc(g.name)}">消息审核</button>
                    <button class="btn btn-ghost btn-sm" data-toggle-group="${g.id}" data-group-status="${g.status === 'active' ? 'archived' : 'active'}">${g.status === 'active' ? '停用' : '启用'}</button>
                  </td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="6"><div class="empty"><span class="empty-text">还没有群聊</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  /* ---------------- 客服会话 ---------------- */

  VIEWS.support = async function () {
    const [convs, stats] = await Promise.all([
      API.listSupportConversations(),
      API.supportStats()
    ])
    S.supportConvs = convs

    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">客服会话</div>
            <div class="card-sub">进行中 ${stats.open} · 已结束 ${stats.closed} · 未读 ${stats.unread}</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="supportRefresh">刷新</button>
        </div>

        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>客户</th><th>主题</th><th>最后消息</th><th>状态</th><th>接待人</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              ${
                convs.length
                  ? convs
                      .map(
                        (c) => `
                <tr>
                  <td class="td-strong">${esc(c.customer_name || '客户')}</td>
                  <td class="muted">${esc(c.subject || '')}</td>
                  <td class="ellipsis" style="max-width:280px">${esc(c.last_message || '—')}</td>
                  <td>
                    <span class="badge ${c.status === 'open' ? 'badge-pending' : ''}">${c.status === 'open' ? '进行中' : '已结束'}</span>
                    ${c.unread_for_staff > 0 ? `<span class="badge badge-danger">${c.unread_for_staff} 未读</span>` : ''}
                  </td>
                  <td class="muted">${esc(c.assigned_to_name || '未分配')}</td>
                  <td class="muted">${fromNow(c.last_message_at || c.created_at)}</td>
                  <td>
                    <button class="btn btn-soft btn-sm" data-open-conv="${c.id}">查看</button>
                  </td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="7"><div class="empty"><span class="empty-text">暂无客户咨询</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  VIEWS.members = async function () {
    const [subs, orders, deposits, stats] = await Promise.all([
      API.listMemberSubscriptions('all'),
      API.listMemberPaymentOrders('all'),
      API.listProviderDeposits('all'),
      API.memberStats()
    ])
    S.memberSubs = subs
    S.memberOrders = orders
    S.memberDeposits = deposits

    const tierName = { basic: '基础', pro: '专业', studio: '工作室' }
    const yuan = (cents) => (Number(cents || 0) / 100).toFixed(0)

    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">会员概览</div>
            <div class="card-sub">有效会员 ${stats.totalMembers} · 7 天内到期 ${stats.expiringSoon} · 待支付 ${stats.pendingOrders}</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="memberRefresh">刷新</button>
        </div>
        <div class="stat-row">
          <div class="stat-item"><div class="stat-value">${stats.totalMembers}</div><div class="stat-label">有效会员</div></div>
          <div class="stat-item"><div class="stat-value">${stats.byTier.basic}/${stats.byTier.pro}/${stats.byTier.studio}</div><div class="stat-label">基础/专业/工作室</div></div>
          <div class="stat-item"><div class="stat-value">¥${yuan(stats.paidAmount)}</div><div class="stat-label">已收款</div></div>
          <div class="stat-item"><div class="stat-value">¥${yuan(stats.pendingAmount)}</div><div class="stat-label">待收款</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">待支付订单</div>
            <div class="card-sub">确认收款后即可开通会员</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>订单号</th><th>用户</th><th>套餐</th><th>类型</th><th>金额</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              ${
                orders.length
                  ? orders
                      .map(
                        (o) => `
                <tr>
                  <td class="td-strong">${esc(o.order_no)}</td>
                  <td class="muted">${esc(o.user_id)}</td>
                  <td>${esc(o.plan_name)}</td>
                  <td class="muted">${o.fee_type === 'membership_with_deposit' ? '会员+保证金+入驻费' : '会员费'}</td>
                  <td class="td-strong">¥${yuan(o.amount_cents)}</td>
                  <td><span class="badge ${o.status === 'paid' ? '' : 'badge-pending'}">${o.status === 'paid' ? '已支付' : o.status === 'pending' ? '待支付' : esc(o.status)}</span></td>
                  <td class="muted">${fromNow(o.created_at)}</td>
                  <td>
                    ${o.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-activate-order="${esc(o.order_no)}" data-activate-user="${esc(o.user_id)}">确认收款</button>` : '<span class="muted">—</span>'}
                  </td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="8"><div class="empty"><span class="empty-text">暂无订单</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">会员列表</div>
            <div class="card-sub">共 ${subs.length} 条记录</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>用户</th><th>等级</th><th>状态</th><th>开始</th><th>到期</th><th>实付</th><th>操作</th></tr></thead>
            <tbody>
              ${
                subs.length
                  ? subs
                      .map(
                        (s) => `
                <tr>
                  <td class="td-strong">${esc(s.user_id)}</td>
                  <td>${esc(tierName[s.tier] || s.tier)}</td>
                  <td><span class="badge ${s.status === 'active' ? '' : 'badge-pending'}">${s.status === 'active' ? '有效' : s.status === 'expired' ? '已过期' : '已取消'}</span></td>
                  <td class="muted">${String(s.start_at || '').slice(0, 10)}</td>
                  <td class="muted">${String(s.expire_at || '').slice(0, 10)}</td>
                  <td class="muted">¥${yuan(s.price_cents)}</td>
                  <td>
                    ${s.status === 'active' ? `<button class="btn btn-ghost btn-sm" data-cancel-member="${s.id}">取消</button>` : '<span class="muted">—</span>'}
                  </td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="7"><div class="empty"><span class="empty-text">暂无会员</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">保证金台账</div>
            <div class="card-sub">冻结中 ${stats.depositCount} 笔 · 合计 ¥${yuan(stats.heldDeposit)}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>用户</th><th>金额</th><th>状态</th><th>关联订单</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              ${
                deposits.length
                  ? deposits
                      .map(
                        (d) => `
                <tr>
                  <td class="td-strong">${esc(d.user_id)}</td>
                  <td class="td-strong">¥${yuan(d.amount_cents)}</td>
                  <td><span class="badge ${d.status === 'held' ? 'badge-pending' : ''}">${d.status === 'held' ? '冻结中' : '已退还'}</span></td>
                  <td class="muted">${esc(d.order_no || '—')}</td>
                  <td class="muted">${fromNow(d.created_at)}</td>
                  <td>
                    ${d.status === 'held' ? `<button class="btn btn-soft btn-sm" data-refund-deposit="${esc(d.user_id)}">退还</button>` : '<span class="muted">—</span>'}
                  </td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="6"><div class="empty"><span class="empty-text">暂无保证金记录</span></div></td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  BINDS.members = function () {
    const refresh = $('#memberRefresh')
    if (refresh) refresh.addEventListener('click', () => render())

    document.querySelectorAll('[data-activate-order]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const orderNo = btn.dataset.activateOrder
        const userId = btn.dataset.activateUser
        openAction('确认收款', `
          <p class="muted" style="margin-bottom:16px">确认已收到订单 <b>${esc(orderNo)}</b> 的款项？确认后将立即开通会员并冻结保证金。</p>
          <div class="form-row">
            <label class="field-label">收款方式</label>
            <select class="input" id="memberPayMethod">
              <option value="wechat">微信</option>
              <option value="alipay">支付宝</option>
              <option value="bank">对公转账</option>
              <option value="cash">现金</option>
              <option value="manual">其他</option>
            </select>
          </div>
          <div class="form-row">
            <label class="field-label">流水号（可选）</label>
            <input class="input" id="memberTxnId" placeholder="微信/支付宝交易单号" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="actionCancel">取消</button>
            <button class="btn btn-primary" id="actionOk">确认收款并开通</button>
          </div>
        `, async () => {
          const method = ($('#memberPayMethod') || {}).value || 'manual'
          const txn = ($('#memberTxnId') || {}).value || ''
          await API.activateMemberSubscription(userId, orderNo, S.uid, S.staffName, method, txn)
          toast('已开通会员')
          render()
        })
      })
    })

    document.querySelectorAll('[data-cancel-member]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.cancelMember
        openAction('取消会员', `
          <p class="muted" style="margin-bottom:16px">取消后该用户立即失去接单资格。确定继续吗？</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="actionCancel">取消</button>
            <button class="btn btn-primary" id="actionOk">确定取消</button>
          </div>
        `, async () => {
          await API.cancelMemberSubscription(Number(id), S.uid, S.staffName)
          toast('已取消会员')
          render()
        })
      })
    })

    document.querySelectorAll('[data-refund-deposit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.refundDeposit
        openAction('退还保证金', `
          <p class="muted" style="margin-bottom:16px">退还用户 <b>${esc(userId)}</b> 的保证金？</p>
          <div class="form-row">
            <label class="field-label">备注</label>
            <input class="input" id="memberRefundNote" placeholder="例如：退出接单" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="actionCancel">取消</button>
            <button class="btn btn-primary" id="actionOk">确认退还</button>
          </div>
        `, async () => {
          const note = ($('#memberRefundNote') || {}).value || ''
          await API.refundMemberDeposit(userId, S.uid, S.staffName, note)
          toast('保证金已退还')
          render()
        })
      })
    })
  }

  BINDS.chat = function () {
    const refresh = $('#chatRefresh')
    if (refresh) refresh.addEventListener('click', () => render())

    const createBtn = $('#chatCreateBtn')
    if (createBtn) createBtn.addEventListener('click', openCreateChatGroup)

    document.querySelectorAll('[data-group-msgs]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openChatMessages(Number(btn.dataset.groupMsgs), btn.dataset.groupName || '群聊')
      })
    })

    document.querySelectorAll('[data-toggle-group]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.toggleGroup)
        const next = btn.dataset.groupStatus
        const label = next === 'active' ? '启用' : '停用'
        if (!confirm(`确定${label}该群聊？停用后用户端将不再显示。`)) return
        btn.disabled = true
        try {
          await API.setChatGroupStatus(id, next)
          toast(`已${label}`)
          render()
        } catch (e) {
          toast(API.friendlyError(e))
        } finally {
          btn.disabled = false
        }
      })
    })
  }

  /** 管理端新建群 */
  function openCreateChatGroup() {
    openAction(
      '新建群聊',
      `
      <label class="field-label">群名称</label>
      <input class="input" id="admGroupName" maxlength="30" placeholder="例：品牌片创作者交流">
      <label class="field-label">群图标</label>
      <input class="input" id="admGroupIcon" maxlength="4" value="💬" placeholder="一个 emoji">
      <label class="field-label">群简介</label>
      <textarea class="input" id="admGroupDesc" rows="3" maxlength="200" placeholder="这个群主要聊什么？"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button class="btn btn-primary" id="admGroupSubmit">创建群聊</button>
      </div>
      `,
      () => {
        const submit = $('#admGroupSubmit')
        if (!submit) return
        submit.addEventListener('click', async () => {
          const name = ($('#admGroupName') && $('#admGroupName').value.trim()) || ''
          if (!name) {
            toast('请填写群名称')
            return
          }
          submit.disabled = true
          try {
            await API.createChatGroup({
              name,
              icon: ($('#admGroupIcon') && $('#admGroupIcon').value.trim()) || '💬',
              description: ($('#admGroupDesc') && $('#admGroupDesc').value.trim()) || ''
            })
            closeAction()
            toast('群聊已创建')
            render()
          } catch (e) {
            toast(API.friendlyError(e))
          } finally {
            submit.disabled = false
          }
        })
      },
      '取消'
    )
  }

  /** 群消息审核：隐藏 / 恢复违规消息 */
  async function openChatMessages(groupId, groupName) {
    let msgs
    try {
      msgs = await API.adminListChatMessages(groupId)
    } catch (e) {
      toast(API.friendlyError(e))
      return
    }
    const rows = msgs.length
      ? msgs
          .map(
            (m) => `
        <div style="display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-bottom:1px solid #EEF2F7">
          <div style="flex:1;min-width:0">
            <div style="font-size:11.5px;color:#7A8BA0;margin-bottom:4px">${esc(m.sender_name || '成员')} · ${fromNow(m.created_at)}${m.status !== 'normal' ? ' · 已隐藏' : ''}</div>
            <div style="font-size:13px;line-height:1.6;color:#33465C;word-break:break-word;${m.status !== 'normal' ? 'opacity:.5;text-decoration:line-through' : ''}">${esc(m.content)}</div>
          </div>
          <button class="btn btn-soft btn-sm" data-toggle-msg="${m.id}" data-msg-status="${m.status}">${m.status === 'normal' ? '隐藏' : '恢复'}</button>
        </div>`
          )
          .join('')
      : '<div class="empty"><span class="empty-text">暂无消息</span></div>'

    openAction(
      `消息审核 · ${groupName}`,
      `<div class="card-sub" style="margin-bottom:10px">被隐藏的消息对用户端不可见，可随时恢复</div>
       <div style="max-height:360px;overflow-y:auto">${rows}</div>`,
      () => {
        document.querySelectorAll('[data-toggle-msg]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const next = btn.dataset.msgStatus === 'normal' ? 'hidden' : 'normal'
            btn.disabled = true
            try {
              await API.setChatMessageStatus(Number(btn.dataset.toggleMsg), next)
              closeAction()
              toast(next === 'hidden' ? '消息已隐藏' : '消息已恢复')
              render()
            } catch (e) {
              toast(API.friendlyError(e))
            } finally {
              btn.disabled = false
            }
          })
        })
      },
      '关闭'
    )
  }

  BINDS.support = function () {
    const refresh = $('#supportRefresh')
    if (refresh) refresh.addEventListener('click', () => render())

    document.querySelectorAll('[data-open-conv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.openConv)
        openSupportChat(id)
      })
    })
  }

  /** 打开客服聊天窗口 */
  async function openSupportChat(conversationId) {
    const detail = await API.getSupportConversation(conversationId)
    if (!detail) {
      toast('会话不存在')
      return
    }
    const c = detail.conversation
    const messages = detail.messages || []

    openAction(
      `与 ${c.customer_name || '客户'} 的会话`,
      `
      <div class="support-chat-box">
        <div class="support-chat-msgs" id="supportChatMsgs">
          ${
            messages.length
              ? messages
                  .map(
                    (m) => `
            <div class="msg-row ${m.sender_role === 'staff' ? 'msg-row-mine' : ''}">
              <div class="msg-bubble ${m.sender_role === 'staff' ? 'msg-bubble-mine' : ''}">
                ${m.sender_role === 'customer' ? `<div class="msg-sender">${esc(m.sender_name || '客户')}</div>` : ''}
                <div class="msg-text">${esc(m.content)}</div>
              </div>
              <div class="msg-time">${fromNow(m.created_at)}</div>
            </div>`
                  )
                  .join('')
              : '<div class="empty"><span class="empty-text">还没有消息</span></div>'
          }
        </div>
        <div class="support-chat-input">
          <textarea class="input" id="supportChatInput" rows="3" maxlength="1000" placeholder="输入回复内容…"></textarea>
          <button class="btn btn-primary" id="supportChatSend">发送回复</button>
        </div>
      </div>
    `,
      () => {
        const input = $('#supportChatInput')
        const send = $('#supportChatSend')
        if (!input || !send) return
        send.addEventListener('click', async () => {
          const content = input.value.trim()
          if (!content) return
          send.disabled = true
          try {
            await API.sendSupportMessage(conversationId, content, 'staff', S.staffName || '平台客服')
            await API.markSupportRead(conversationId, 'staff')
            closeAction()
            toast('已回复')
            render()
          } catch (e) {
            toast(API.friendlyError(e))
          } finally {
            send.disabled = false
          }
        })
        const box = $('#supportChatMsgs')
        if (box) box.scrollTop = box.scrollHeight
      },
      '关闭'
    )
  }

  /* ---------------- 启动 ---------------- */

  async function boot() {
    const now = new Date()
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
    $('#todayLabel').textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 星期${week}`

    const session = await API.getSession()
    if (session) {
      S.session = session
      await onLogin(session)
      if (!S.isStaff) {
        $('#loginMask').classList.add('show')
        return
      }
      render()
      return
    }
    $('#loginMask').classList.add('show')
  }

  // 屏幕尺寸变化时重算网格列数（内容始终铺满，不留白边）
  let gridResizeTimer = null
  window.addEventListener('resize', () => {
    if (gridResizeTimer) clearTimeout(gridResizeTimer)
    gridResizeTimer = setTimeout(() => {
      gridResizeTimer = null
      if (window.AdaptiveGrid) window.AdaptiveGrid.fitAll(content)
    }, 120)
  })

  boot()
})()
