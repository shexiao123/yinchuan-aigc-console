/**
 * 平台在线人数（真实心跳，不编造数字）
 *
 * - 每 30 秒上报一次心跳，取数据库「近 2 分钟活跃会话数」
 * - 顶部导航胶囊 + 首页实时数据 KPI 共用一个数值
 * - SPA 重渲染后自动把当前值回填到新节点
 * - 心跳失败显示「–」，绝不填充假数字
 */
(function () {
  'use strict'

  var BEAT_MS = 30000
  var current = null
  var lastBeat = 0
  var appEl = document.getElementById('app')

  function paint(n) {
    var txt = n == null ? '–' : String(n)
    var nodes = document.querySelectorAll('[data-online-count]')
    for (var i = 0; i < nodes.length; i++) {
      // 值没变就不写，避免与下面的 MutationObserver 形成自触发循环
      if (nodes[i].textContent !== txt) nodes[i].textContent = txt
    }
    var chip = document.getElementById('onlineChip')
    if (chip) chip.classList.toggle('is-live', n != null)
  }

  function set(n) {
    current = n
    paint(n)
  }

  async function beat(force) {
    if (!force && document.hidden) return
    if (!window.API || typeof window.API.reportOnline !== 'function') return
    var now = Date.now()
    if (!force && now - lastBeat < BEAT_MS - 3000) return
    lastBeat = now
    // reportOnline 内部已捕获异常并返回 null
    set(await window.API.reportOnline())
  }

  // 等云服务 SDK 就绪后立刻上报（最多等 8 秒，超时仍尝试一次）
  ;(async function boot() {
    if (window.cloudReady) {
      try {
        await Promise.race([
          window.cloudReady,
          new Promise(function (resolve) { setTimeout(resolve, 8000) })
        ])
      } catch (e) { /* SDK 加载失败，交给下面的心跳重试 */ }
    }
    await beat(true)
  })()

  setInterval(function () { beat(false) }, BEAT_MS)

  // 切回标签页、切换路由、网络恢复时立即刷新
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) beat(true)
  })
  window.addEventListener('hashchange', function () { beat(true) })
  window.addEventListener('online', function () { beat(true) })

  // #app 重渲染（SPA 路由切换）后回填在线数。
  // 只观察 #app 的直接子节点变化，不能开 subtree —— paint() 改 textContent
  // 也会产生 childList 记录，开 subtree 会自触发成无限循环把页面卡死。
  if (appEl && window.MutationObserver) {
    new MutationObserver(function () { paint(current) })
      .observe(appEl, { childList: true })
  }

  window.WBOnline = {
    beat: function () { return beat(true) },
    set: set,
    get: function () { return current }
  }
})()
