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
    settings: '平台设置',
    members: '会员管理',
    support: '客服会话',
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

  function render() {
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
  }

  const BINDS = {}

  /* ---------------- 运营概览 ---------------- */

  VIEWS.dashboard = async function () {
    const stats = await API.adminStats()
    S.stats = stats

    const maxTrend = Math.max(1, ...stats.trend.map((t) => t.count))
    const totalServices = stats.byCategory.reduce((s, c) => s + c.count, 0) || 1
    const distColors = ['#C4703F', '#6E7F5C', '#5B7186', '#B5707A', '#9C8449']

    return `
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
