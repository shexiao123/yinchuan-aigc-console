/**
 * 全局命令面板（Ctrl/⌘ + K）
 * ------------------------------------------------------------------
 * 把「服务 / 品类 / 商家任务 / 店铺 / 功能页」收进一个搜索框，
 * 支持键盘上下选择、回车跳转、Esc 关闭，匹配片段高亮。
 *
 * 数据源优先走云端 API；端点不可达时自动回退到 SEED_DATA 只读快照，
 * 因此 GitHub Pages（无云数据权限）与官方托管域都能正常使用。
 * 纯前端、零依赖，不改动现有哈希路由。
 */
;(function () {
  'use strict'

  var API = window.API || {}
  var esc = API.esc || function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    })
  }

  var STATIC_ITEMS = [
    { group: '功能页', title: '智能工作台', desc: 'AI 撮合 · 报价测算', hash: '#/smart', keys: 'ai match quote 智能 报价 测算' },
    { group: '功能页', title: '首页', desc: '平台实时数据与推荐', hash: '#/', keys: 'home 首页' },
    { group: '功能页', title: '全部服务', desc: '按品类筛选在架服务', hash: '#/services', keys: 'services 服务' },
    { group: '功能页', title: '需求大厅', desc: '发布需求 / 抢单', hash: '#/hall', keys: 'hall 需求 抢单' },
    { group: '功能页', title: '任务广场', desc: '企业商家发布的制作任务', hash: '#/tasks', keys: 'tasks 任务' },
    { group: '功能页', title: '企业商家', desc: '入驻店铺与商家街', hash: '#/merchants', keys: 'merchant 商家' },
    { group: '功能页', title: '群聊广场', desc: '按项目找人沟通', hash: '#/groups', keys: 'group 群聊' },
    { group: '功能页', title: '我的订单', desc: '订单进度与交付', hash: '#/orders', keys: 'orders 订单' },
    { group: '功能页', title: '接单工作台', desc: '档期 / 订单 / 结算', hash: '#/studio', keys: 'studio 工作台 接单' },
    { group: '功能页', title: '会员中心', desc: '档位与佣金率', hash: '#/membership', keys: 'member 会员' },
    { group: '功能页', title: '商家控制台', desc: '开店 / 发任务 / 传视频', hash: '#/merchant-console', keys: 'console 控制台' },
    { group: '功能页', title: '消息通知', desc: '订单与系统消息', hash: '#/notifications', keys: 'notice 消息 通知' },
    { group: '功能页', title: '在线客服', desc: '发起会话', hash: '#/support', keys: 'support 客服' }
  ]

  var allItems = null
  var loading = false
  var activeIndex = 0
  var visible = []
  var overlay = null
  var input = null
  var resultsEl = null
  var footEl = null

  function buildDom() {
    overlay = document.createElement('div')
    overlay.className = 'cmd-overlay'
    overlay.id = 'cmdOverlay'
    overlay.hidden = true
    overlay.innerHTML =
      '<div class="cmd-panel" role="dialog" aria-label="全局搜索">' +
        '<div class="cmd-input-row">' +
          '<svg class="cmd-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input class="cmd-input" id="cmdInput" type="text" autocomplete="off" spellcheck="false" placeholder="搜索服务、品类、任务、店铺或功能页…" />' +
          '<kbd class="cmd-esc">ESC</kbd>' +
        '</div>' +
        '<div class="cmd-results" id="cmdResults"></div>' +
        '<div class="cmd-foot"><span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span><span id="cmdCount"></span></div>' +
      '</div>'
    document.body.appendChild(overlay)
    input = overlay.querySelector('#cmdInput')
    resultsEl = overlay.querySelector('#cmdResults')
    footEl = overlay.querySelector('#cmdCount')

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close()
    })
    input.addEventListener('input', function () { activeIndex = 0; renderResults() })
    input.addEventListener('keydown', onKey)
    resultsEl.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.cmd-row') : null
      if (!row) return
      var idx = Number(row.dataset.idx)
      if (visible[idx]) go(visible[idx])
    })
    resultsEl.addEventListener('mousemove', function (e) {
      var row = e.target.closest ? e.target.closest('.cmd-row') : null
      if (!row) return
      var idx = Number(row.dataset.idx)
      if (idx !== activeIndex) { activeIndex = idx; markActive() }
    })
  }

  function safeList(fn, arg) {
    try {
      var p = arg === undefined ? fn() : fn(arg)
      return Promise.resolve(p).then(function (r) {
        if (Array.isArray(r)) return r
        if (r && Array.isArray(r.data)) return r.data
        return []
      }).catch(function () { return [] })
    } catch (e) { return Promise.resolve([]) }
  }

  function loadItems() {
    if (loading) return
    loading = true
    var seed = window.SEED_DATA || {}
    Promise.all([
      safeList(API.listServices ? API.listServices.bind(API) : function () { return [] }, { limit: 200 }),
      safeList(API.listCategories ? API.listCategories.bind(API) : function () { return [] }),
      safeList(API.listMerchantTasks ? API.listMerchantTasks.bind(API) : function () { return [] }),
      safeList(API.listMerchants ? API.listMerchants.bind(API) : function () { return [] })
    ]).then(function (res) {
      var services = res[0].length ? res[0] : (seed.services || [])
      var categories = res[1].length ? res[1] : (seed.categories || [])
      var tasks = res[2].length ? res[2] : (seed.merchant_tasks || [])
      var merchants = res[3]
      var items = STATIC_ITEMS.slice()

      categories.forEach(function (c) {
        items.push({
          group: '服务品类', title: c.name, desc: c.description || '浏览该品类全部服务',
          hash: '#/services?category=' + encodeURIComponent(c.slug || ''),
          keys: (c.slug || '') + ' ' + (c.name || '')
        })
      })
      services.forEach(function (s) {
        items.push({
          group: '在架服务', title: s.title || s.name || '未命名服务',
          desc: '¥' + (API.yuan ? API.yuan(s.price) : (Number(s.price) / 100).toFixed(2)) +
                ' · ' + (s.delivery_days || '–') + ' 天交付',
          hash: '#/service/' + s.id,
          keys: [s.title, s.subtitle, s.description, (s.tags || []).join(' ')].join(' ')
        })
      })
      tasks.forEach(function (t) {
        items.push({
          group: '商家任务', title: t.title || '未命名任务',
          desc: '预算 ¥' + ((Number(t.budget) || 0) / 100).toFixed(0) + ' · ' + (t.deadline || '截止待定'),
          hash: '#/task/' + t.id,
          keys: [t.title, t.description, t.category_slug].join(' ')
        })
      })
      merchants.forEach(function (m) {
        items.push({
          group: '入驻商家', title: m.shop_name || m.name || m.company_name || '未命名店铺',
          desc: m.city || m.description || '查看店铺主页',
          hash: '#/merchant/' + m.id,
          keys: [m.shop_name, m.name, m.company_name, m.city].join(' ')
        })
      })
      allItems = items
      renderResults()
      loading = false
    })
  }

  function score(item, q) {
    if (!q) return 1
    var t = String(item.title || '').toLowerCase()
    var d = String(item.desc || '').toLowerCase()
    var k = String(item.keys || '').toLowerCase()
    if (t.indexOf(q) === 0) return 100
    if (t.indexOf(q) > 0) return 80
    if (k.indexOf(q) >= 0) return 60
    if (d.indexOf(q) >= 0) return 40
    return 0
  }

  function highlight(text, q) {
    var s = String(text == null ? '' : text)
    if (!q) return esc(s)
    var lower = s.toLowerCase()
    var i = lower.indexOf(q)
    if (i < 0) return esc(s)
    return esc(s.slice(0, i)) + '<mark class="cmd-mark">' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length))
  }

  function renderResults() {
    if (!resultsEl) return
    var q = (input.value || '').trim().toLowerCase()
    var pool = allItems || STATIC_ITEMS
    var scored = pool.map(function (it) { return { it: it, s: score(it, q) } })
      .filter(function (x) { return x.s > 0 })
      .sort(function (a, b) { return b.s - a.s })
    visible = scored.slice(0, 40).map(function (x) { return x.it })
    if (activeIndex >= visible.length) activeIndex = 0

    var html = ''
    var lastGroup = ''
    visible.forEach(function (it, i) {
      if (it.group !== lastGroup) {
        html += '<div class="cmd-group">' + esc(it.group) + '</div>'
        lastGroup = it.group
      }
      html += '<div class="cmd-row' + (i === activeIndex ? ' is-active' : '') + '" data-idx="' + i + '">' +
        '<span class="cmd-row-main">' +
          '<span class="cmd-row-title">' + highlight(it.title, q) + '</span>' +
          '<span class="cmd-row-desc">' + highlight(it.desc, q) + '</span>' +
        '</span>' +
        '<span class="cmd-row-go">↵</span>' +
      '</div>'
    })
    if (!visible.length) {
      html = '<div class="cmd-empty">没有匹配结果，换个关键词试试</div>'
    }
    resultsEl.innerHTML = html
    if (footEl) footEl.textContent = (allItems ? '已索引 ' + allItems.length + ' 项' : '正在索引…')
  }

  function markActive() {
    if (!resultsEl) return
    var rows = resultsEl.querySelectorAll('.cmd-row')
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('is-active', i === activeIndex)
    var cur = rows[activeIndex]
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' })
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, visible.length - 1); markActive() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); markActive() }
    else if (e.key === 'Enter') { e.preventDefault(); if (visible[activeIndex]) go(visible[activeIndex]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  function go(item) {
    close()
    if (item && item.hash) window.location.hash = item.hash
  }

  function open() {
    if (!overlay) buildDom()
    overlay.hidden = false
    document.body.classList.add('cmd-open')
    input.value = ''
    activeIndex = 0
    renderResults()
    setTimeout(function () { input.focus() }, 0)
    if (!allItems) loadItems()
  }

  function close() {
    if (!overlay) return
    overlay.hidden = true
    document.body.classList.remove('cmd-open')
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      overlay && !overlay.hidden ? close() : open()
    }
  })

  function bindTrigger() {
    var btn = document.getElementById('cmdBtn')
    if (btn) btn.addEventListener('click', open)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindTrigger)
  else bindTrigger()

  window.CommandPalette = { open: open, close: close, reload: function () { allItems = null; loadItems() } }
})()
