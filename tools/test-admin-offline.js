/**
 * 管理端离线只读演示验证（真浏览器 + CDP）
 * 用法：
 *   node tools/test-admin-offline.js local     # 阻断云域名，验证降级路径
 *   node tools/test-admin-offline.js live      # 直连 Pages，验证真实 CORS 环境
 */
const http = require('http')
const WebSocket = require('ws')

const MODE = process.argv[2] || 'local'
const URLS = {
  local: 'http://127.0.0.1:8900/admin.html',
  live: 'https://shexiao123.github.io/yinchuan-aigc-console/admin.html'
}
const TARGET = URLS[MODE]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getJson = (p) =>
  new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, (r) => {
      let b = ''
      r.on('data', (d) => (b += d))
      r.on('end', () => res(JSON.parse(b)))
    }).on('error', rej)
  })

let pass = 0, fail = 0
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' —— ' + detail : '')) }
}

;(async () => {
  const targets = await getJson('/json')
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.once('open', r))
  let seq = 0
  const pend = new Map()
  const netErrs = []
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') netErrs.push(m.params.entry.text)
  })
  const send = (method, params) =>
    new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })) })
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return r.result && r.result.result ? r.result.result.value : undefined
  }

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  if (MODE === 'local') {
    // 模拟「域名不在白名单」：把所有云端点整个断掉（主端点 + 备用端点）
    await send('Network.setBlockedURLs', { urls: ['*app.workbuddy.host*'] })
  } else {
    await send('Network.setBlockedURLs', { urls: [] })
  }

  await send('Page.navigate', { url: TARGET + '?r=' + Date.now() })
  await sleep(7000)

  const st = await evalJs(`(() => {
    const bar = document.querySelector('.offline-bar')
    const mask = document.getElementById('loginMask')
    const content = document.getElementById('adminContent')
    const nav = [...document.querySelectorAll('.side-nav a, .side-nav button, [data-page]')].length
    return {
      title: document.title,
      offlineCloud: !!(window.cloud && window.cloud.__offline),
      barShown: !!bar,
      barText: bar ? bar.innerText.replace(/\\s+/g, ' ').trim().slice(0, 90) : '',
      maskShown: mask ? mask.classList.contains('show') : null,
      maskDisplay: mask ? getComputedStyle(mask).display : null,
      contentLen: content ? content.innerText.trim().length : -1,
      contentHead: content ? content.innerText.replace(/\\s+/g, ' ').trim().slice(0, 220) : '',
      adminName: (document.getElementById('adminName') || {}).textContent || '',
      navCount: nav,
      cards: document.querySelectorAll('.stat-card, .kpi, .card').length,
      tables: document.querySelectorAll('table').length
    }
  })()`)

  console.log(`=== ${MODE} : ${TARGET} ===`)
  console.log(JSON.stringify(st, null, 2))
  console.log('网络错误条数:', netErrs.length, netErrs.slice(0, 2).join(' | '))
  console.log('--- 断言 ---')
  ok('进入离线模式', st.offlineCloud === true)
  ok('显示只读提示条', st.barShown === true, st.barText)
  ok('登录遮罩已隐藏', st.maskShown === false || st.maskDisplay === 'none', String(st.maskShown))
  ok('内容区已渲染（>200 字）', st.contentLen > 200, st.contentLen + ' 字')
  ok('演示身份已落到顶栏', st.adminName.includes('演示'), st.adminName)
  ok('无残留云请求报错', netErrs.length === 0, netErrs.length + ' 条')
  console.log(`\n通过 ${pass} / 失败 ${fail}`)
  ws.close()
  process.exit(fail ? 1 : 0)
})()
