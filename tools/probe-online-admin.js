/**
 * 线上管理端探针：打开 GitHub Pages 的 admin.html，看它到底能不能进去
 * 用法：先起无头 Chrome（9222），再 node tools/probe-online-admin.js [url]
 */
const http = require('http')
const WebSocket = require('ws')

const URL_ = process.argv[2] || 'https://shexiao123.github.io/yinchuan-aigc-console/admin.html'
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
  const targets = await getJson('/json')
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.once('open', r))
  let seq = 0
  const pend = new Map()
  const logs = []
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value || a.description || a.type).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description))
    }
    if (m.method === 'Log.entryAdded') logs.push('NET/' + m.params.entry.level + ': ' + m.params.entry.text)
  })
  const send = (method, params) =>
    new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })) })
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result && r.result.exceptionDetails) return 'EVAL_ERR: ' + JSON.stringify(r.result.exceptionDetails.text)
    return r.result && r.result.result ? r.result.result.value : undefined
  }

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: URL_ + '?r=' + Date.now() })
  await sleep(6000)

  const state = await evalJs(`(() => {
    const mask = document.getElementById('loginMask')
    const content = document.getElementById('adminContent')
    return {
      title: document.title,
      maskShown: mask ? mask.classList.contains('show') : null,
      maskDisplay: mask ? getComputedStyle(mask).display : null,
      loginErr: (document.getElementById('adminLoginError') || {}).textContent || '',
      cloudOffline: !!(window.cloud && window.cloud.__offline),
      hasSeed: !!window.SEED_DATA,
      contentTextLen: content ? content.innerText.trim().length : -1,
      contentHead: content ? content.innerText.trim().slice(0, 160) : '',
      cloudEndpoints: window.CLOUD_ENDPOINTS ? Object.keys(window.CLOUD_ENDPOINTS).slice(0,3) : null,
      apiReady: typeof window.API
    }
  })()`)
  console.log('=== 页面状态 ===')
  console.log(JSON.stringify(state, null, 2))
  console.log('=== 控制台/网络（末 12 条）===')
  console.log(logs.slice(-12).join('\n') || '(无)')
  ws.close()
  process.exit(0)
})()
