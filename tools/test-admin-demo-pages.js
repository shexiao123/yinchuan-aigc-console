/**
 * 管理端「离线只读演示」逐页巡检（真浏览器 + CDP）
 * 阻断全部云端点，模拟 GitHub Pages 的 CORS 环境，逐页检查渲染结果。
 * 用法：node tools/test-admin-demo-pages.js
 */
const http = require('http')
const WebSocket = require('ws')

const BASE = 'http://127.0.0.1:8900'
const PAGES = [
  ['dashboard', '运营概览'], ['risks', '风险预警'], ['orders', '订单管理'],
  ['settlements', '结算与提现'], ['providers', '服务者管理'], ['applications', '入驻审核'],
  ['services', '服务与分类'], ['content', '首页与内容'], ['merchants', '商家管理'],
  ['billing', '商家收费'], ['notice', '公告管理'], ['reviews', '评价管理'],
  ['settings', '平台设置'], ['members', '会员管理'], ['support', '客服会话'],
  ['chat', '群聊管理'], ['logs', '操作日志']
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getJson = (p) =>
  new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, (r) => {
      let b = ''
      r.on('data', (d) => (b += d))
      r.on('end', () => res(JSON.parse(b)))
    }).on('error', rej)
  })

;(async () => {
  const t = (await getJson('/json')).find((x) => x.type === 'page')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((r) => ws.once('open', r))
  let seq = 0
  const pend = new Map()
  const exceptions = []
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description)
    }
  })
  const send = (method, params) =>
    new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })) })
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result && r.result.exceptionDetails) return 'EVAL_ERR: ' + r.result.exceptionDetails.text
    return r.result && r.result.result ? r.result.result.value : undefined
  }

  await send('Runtime.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Network.setBlockedURLs', { urls: ['*app.workbuddy.host*'] })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${BASE}/admin.html?debug=1&r=${Date.now()}` })
  await sleep(6500)

  const boot = await ev(`(() => {
    const bar = document.querySelector('.offline-bar')
    return { offline: !!(window.cloud && window.cloud.__offline), bar: !!bar,
             mask: (document.getElementById('loginMask')||{}).className || '',
             hasDebug: !!window.__wbDebug }
  })()`)
  console.log('入口状态：', JSON.stringify(boot))

  console.log('\n页面'.padEnd(14) + '字数'.padStart(7) + '表格行'.padStart(8) + '卡片'.padStart(6) + '  首段')
  console.log('-'.repeat(96))
  let bad = 0
  for (const [key, label] of PAGES) {
    const r = await ev(`(async () => {
      await window.__wbDebug.switchPage('${key}')
      await new Promise(r => setTimeout(r, 420))
      const c = document.getElementById('adminContent')
      const txt = c ? c.innerText.replace(/\\s+/g, ' ').trim() : ''
      const rows = c ? c.querySelectorAll('tbody tr').length : 0
      const cards = c ? c.querySelectorAll('.card, .stat-card, .kpi-card').length : 0
      const empty = c ? c.querySelectorAll('.empty').length : 0
      return { len: txt.length, rows, cards, empty, head: txt.slice(0, 46) }
    })()`)
    const flag = r.len > 120 && (r.rows > 0 || r.cards > 0) ? ' ' : '!'
    if (flag === '!') bad++
    console.log(
      flag + label.padEnd(12) + String(r.len).padStart(7) + String(r.rows).padStart(8) +
      String(r.cards).padStart(6) + '  ' + r.head
    )
  }

  console.log('\n运行时异常：', exceptions.length ? exceptions.slice(0, 3).join(' | ') : '无')
  console.log(bad === 0 ? '\n✅ 17 个页面全部有内容' : `\n⚠️ ${bad} 个页面内容偏少，需检查`)
  ws.close()
  process.exit(0)
})()
