/**
 * 平台公告滚动栏（用户端全站常驻）
 *
 * 数据来自云数据库 public.announcements，只显示启用且在投放期内的公告。
 * 无缝横向跑马灯：等宽两组内容 + translateX(-50%)，按实测宽度换算动画时长，
 * 保证不同条数下滚动速度一致。悬停 / 触摸暂停，点击可看全文。
 *
 * 不编造兜底公告：云端不可用时整条隐藏，避免显示假消息。
 */
;(function () {
  'use strict'

  var REFRESH_MS = 60000
  var SPEED_PX_PER_SEC = 58
  var MAX_REPEAT = 12

  var bar, viewport, track, modal
  var announcements = []
  var refreshTimer = null

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function fmtDate(iso) {
    if (!iso) return ''
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  var LEVEL_TEXT = { info: '公告', activity: '活动', important: '重要' }

  function levelClass(level) {
    return level === 'important' ? 'nt-important' : level === 'activity' ? 'nt-activity' : 'nt-info'
  }

  /** 单条公告的滚动单元 */
  function itemHtml(a) {
    return '<button type="button" class="notice-item ' + levelClass(a.level) + '" data-nid="' + a.id + '">' +
      '<span class="notice-tag">' + esc(a.tag || LEVEL_TEXT[a.level] || '公告') + '</span>' +
      '<span class="notice-title">' + esc(a.title) + '</span>' +
      (a.is_pinned ? '<span class="notice-pin">置顶</span>' : '') +
      '<span class="notice-sep">·</span>' +
      '</button>'
  }

  function buildBar() {
    bar = document.getElementById('noticeBar')
    if (!bar) return false
    viewport = document.getElementById('noticeViewport')
    track = document.getElementById('noticeTrack')
    return !!(viewport && track)
  }

  /**
   * 填充滚动轨道：先让一组内容宽于视口，再复制一组做无缝衔接。
   * 用 rAF 后测量，确保字体加载与布局已完成。
   */
  function paintMarquee() {
    if (!announcements.length) {
      bar.hidden = true
      return
    }
    bar.hidden = false
    var one = announcements.map(itemHtml).join('')
    track.style.animation = 'none'
    track.innerHTML = '<div class="notice-group">' + one + '</div>'

    requestAnimationFrame(function () {
      var group = track.firstElementChild
      if (!group) return
      var need = Math.max(viewport.clientWidth || 600, 420)
      var repeats = 0
      while (group.scrollWidth < need && repeats < MAX_REPEAT) {
        group.insertAdjacentHTML('beforeend', one)
        repeats += 1
      }
      var w = group.scrollWidth
      track.appendChild(group.cloneNode(true))
      track.lastElementChild.setAttribute('aria-hidden', 'true')
      var duration = Math.min(90, Math.max(18, w / SPEED_PX_PER_SEC))
      track.style.setProperty('--notice-duration', duration.toFixed(1) + 's')
      track.style.animation = ''
    })
  }

  function renderListModal() {
    var rows = announcements.length
      ? announcements.map(function (a) {
          return '<button type="button" class="notice-list-row" data-nid="' + a.id + '">' +
            '<span class="notice-tag ' + levelClass(a.level) + '">' + esc(a.tag || '公告') + '</span>' +
            '<span class="notice-list-title">' + esc(a.title) + '</span>' +
            '<span class="notice-list-date">' + fmtDate(a.created_at) + '</span>' +
            '</button>'
        }).join('')
      : '<div class="notice-empty">暂无公告</div>'
    openModal('平台公告', '<div class="notice-list">' + rows + '</div>')
  }

  function openDetail(id) {
    var a = announcements.filter(function (x) { return String(x.id) === String(id) })[0]
    if (!a) return
    var body =
      '<div class="notice-detail-head">' +
        '<span class="notice-tag ' + levelClass(a.level) + '">' + esc(a.tag || '公告') + '</span>' +
        (a.is_pinned ? '<span class="notice-pin">置顶</span>' : '') +
        '<span class="notice-detail-date">' + fmtDate(a.created_at) + '</span>' +
      '</div>' +
      '<div class="notice-detail-title">' + esc(a.title) + '</div>' +
      '<div class="notice-detail-content">' + esc(a.content || '（无详细内容）') + '</div>' +
      (a.link
        ? '<a class="btn btn-primary btn-sm notice-detail-link" href="' + esc(a.link) + '">查看详情 ›</a>'
        : '')
    openModal('公告详情', body)
  }

  function openModal(title, bodyHtml) {
    if (!modal) return
    document.getElementById('noticeModalTitle').textContent = title
    document.getElementById('noticeModalBody').innerHTML = bodyHtml
    modal.classList.add('show')
  }

  function closeModal() {
    if (modal) modal.classList.remove('show')
  }

  function buildModal() {
    modal = document.getElementById('noticeModal')
    if (!modal) return
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-notice-close]')) closeModal()
      var row = e.target.closest('[data-nid]')
      if (row) openDetail(row.dataset.nid)
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal()
    })
  }

  function bindEvents() {
    document.getElementById('noticeAllBtn').addEventListener('click', renderListModal)
    document.getElementById('noticeMoreBtn').addEventListener('click', renderListModal)
    viewport.addEventListener('click', function (e) {
      var item = e.target.closest('[data-nid]')
      if (item) openDetail(item.dataset.nid)
    })
    // 触摸时暂停，松手继续（CSS 用 :active 不可靠，这里显式切换）
    viewport.addEventListener('touchstart', function () { track.style.animationPlayState = 'paused' }, { passive: true })
    viewport.addEventListener('touchend', function () { track.style.animationPlayState = '' }, { passive: true })
    window.addEventListener('resize', function () {
      clearTimeout(window.__noticeResizeTimer)
      window.__noticeResizeTimer = setTimeout(paintMarquee, 250)
    })
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh()
    })
  }

  async function refresh() {
    if (!window.API || !window.API.listAnnouncements) return
    try {
      var rows = await window.API.listAnnouncements()
      // 内容变化才重绘，避免打断滚动动画
      var signature = rows.map(function (a) { return a.id + ':' + a.updated_at + ':' + a.title }).join('|')
      if (signature === refresh.signature) return
      refresh.signature = signature
      announcements = rows
      paintMarquee()
    } catch (e) {
      console.warn('[notice] 公告加载失败', e && e.message)
      bar.hidden = true
    }
  }

  async function init() {
    if (!buildBar()) return
    buildModal()
    bindEvents()
    try {
      if (window.cloudReady) await window.cloudReady
    } catch (e) {
      console.warn('[notice] 云服务未就绪', e && e.message)
      return
    }
    await refresh()
    refreshTimer = setInterval(refresh, REFRESH_MS)
  }

  window.WBNotice = { refresh: refresh }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
