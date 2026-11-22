/**
 * 管理端新功能 E2E（真浏览器，走 ?debug=1 调试钩子）
 * 验证：风险预警页、评价管理页、商家任务截止列、三处导出按钮
 * 用法：先起 8900 静态服务 + 9222 调试端口无头 Chrome，再 node tools/e2e-admin-console.js
 */
const http = require('http')
const WebSocket = require('ws')

const BASE = 'http://127.0.0.1:8900'
let pass = 0
let fail = 0
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' —— ' + detail : '')) }
}

const getJson = (p) =>
  new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, (r) => {
      let b = ''
      r.on('data', (d) => (b += d))
      r.on('end', () => res(JSON.parse(b)))
    }).on('error', rej)
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const targets = await getJson('/json')
  const page = targets.find((t) => t.type === 'page')
  if (!page) { console.log('找不到调试页面，先启动无头 Chrome'); process.exit(1) }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.once('open', r))
  let seq = 0
  const pend = new Map()
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  })
  const send = (method, params) =>
    new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })) })
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return r.result && r.result.result ? r.result.result.value : undefined
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  // 防缓存随机参数
  await send('Page.navigate', { url: `${BASE}/admin.html?debug=1&r=${Date.now()}` })
  await sleep(4500)

  // 注入调试会话（isStaff 打桩，避免依赖云端人员表）
  const injected = await evalJs(`(async () => {
    if (!window.__wbDebug) return 'no-debug-hook'
    window.API.isStaff = async () => true
    await window.__wbDebug.setSession({ user: { id: 'dbg-admin', name: '测试管理员' } })
    const mask = document.getElementById('loginMask')
    if (mask) mask.classList.remove('show')
    return 'ok'
  })()`)
  ok('?debug=1 调试钩子可用', injected === 'ok', String(injected))

  // 1. 风险预警页
  await evalJs(`window.__wbDebug.switchPage('risks')`)
  await sleep(2500)
  const risks = await evalJs(`(() => {
    const t = document.getElementById('pageTitle').textContent
    const cards = document.querySelectorAll('.risk-grid .risk-card').length
    const tables = document.querySelectorAll('#adminContent table.data').length
    const btns = [...document.querySelectorAll('[data-risk-go]')].length
    const text = document.getElementById('adminContent').textContent
    return { t, cards, tables, btns,
      hasTask: text.includes('商家任务截止风险'),
      hasStale: text.includes('滞留订单与积压事项'),
      hasBad: text.includes('低星评价未回复'),
      hasRefresh: !!document.getElementById('riskRefresh') }
  })()`)
  ok('风险预警页标题正确', risks.t === '风险预警', risks.t)
  ok('6 张风险卡片渲染', risks.cards === 6, String(risks.cards))
  ok('三类风险表齐全', risks.hasTask && risks.hasStale && risks.hasBad)
  ok('重新扫描按钮存在', risks.hasRefresh)
  ok('卡片可跳转绑定', risks.btns >= 6, String(risks.btns))

  // 2. 评价管理页
  await evalJs(`window.__wbDebug.switchPage('reviews')`)
  await sleep(2500)
  const reviews = await evalJs(`(() => {
    const t = document.getElementById('pageTitle').textContent
    const text = document.getElementById('adminContent').textContent
    const rows = document.querySelectorAll('#adminContent [data-review-reply]').length
    const bars = document.querySelectorAll('#adminContent .card-pad > div').length
    return { t, rows,
      hasDist: text.includes('星级分布'),
      hasAvg: text.includes('平均星级'),
      hasRate: text.includes('好评率'),
      hasExport: !!document.getElementById('reviewExport'),
      kpis: document.querySelectorAll('#adminContent .kpi').length }
  })()`)
  ok('评价管理页标题正确', reviews.t === '评价管理', reviews.t)
  ok('星级分布/平均星级/好评率齐全', reviews.hasDist && reviews.hasAvg && reviews.hasRate)
  ok('评价行渲染（云端实际数据）', reviews.rows >= 1, String(reviews.rows))
  ok('评价导出按钮存在', reviews.hasExport)
  ok('顶部 4 张 KPI', reviews.kpis === 4, String(reviews.kpis))

  // 3. 回复弹层打开与取消（不真写库）
  await evalJs(`document.querySelector('[data-review-reply]').click()`)
  await sleep(400)
  const modal = await evalJs(`(() => ({
    shown: document.getElementById('actionMask').classList.contains('show'),
    hasTextarea: !!document.getElementById('replyText'),
    title: document.getElementById('actionTitle').textContent
  }))()`)
  ok('回复弹层可打开', modal.shown && modal.hasTextarea, JSON.stringify(modal))
  await evalJs(`document.getElementById('actionCancel').click()`)
  await sleep(200)

  // 4. 商家页：截止列 + 导出
  await evalJs(`window.__wbDebug.switchPage('merchants')`)
  await sleep(2500)
  const merch = await evalJs(`(() => {
    const head = [...document.querySelectorAll('#adminContent th')].map((t) => t.textContent)
    const text = document.getElementById('adminContent').textContent
    const tables = [...document.querySelectorAll('#adminContent table.data')]
    const taskTable = tables[1]
    const dlCells = taskTable ? [...taskTable.querySelectorAll('tbody tr td:nth-child(4)')].map((td) => td.textContent.trim()) : []
    return {
      hasCol: head.some((h) => h.includes('截止日期')),
      hasExport: !!document.getElementById('merchantExport'),
      dlCells: dlCells.slice(0, 5),
      overdue: text.includes('已逾期'),
      days: text.includes('剩 ') }
  })()`)
  ok('商家任务表有截止日期列', merch.hasCol)
  ok('商家导出按钮存在', merch.hasExport)
  ok('截止日期有值', merch.dlCells.some((c) => /20\d\d-/.test(c)), JSON.stringify(merch.dlCells))
  ok('逾期/临期标记生效', merch.overdue || merch.days)

  // 5. 订单与结算导出按钮
  await evalJs(`window.__wbDebug.switchPage('orders')`)
  await sleep(2200)
  ok('订单导出按钮存在', await evalJs(`!!document.getElementById('orderExport')`))
  await evalJs(`window.__wbDebug.switchPage('settlements')`)
  await sleep(2200)
  ok('结算导出按钮存在', await evalJs(`!!document.getElementById('settleExport')`))

  // 6. CSV 工具函数在闭包内，静态源码检查（IIFE 不可见是正常的）
  const fs = require('fs')
  const adminSrc = fs.readFileSync('webapp/js/admin.js', 'utf8')
  ok('exportCsv/daysSince 已实现（闭包内，静态检查）', adminSrc.includes('function exportCsv') && adminSrc.includes('function daysSince'))

  console.log('')
  console.log(`通过 ${pass} / 失败 ${fail}`)
  ws.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('E2E 异常', e); process.exit(1) })
