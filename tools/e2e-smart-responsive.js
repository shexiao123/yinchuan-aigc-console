/**
 * 智能工作台 · 响应式真浏览器 E2E
 *
 * 前置：Chrome 已带 --remote-debugging-port=9222 启动。
 * 用 CDP 逐档切换视口宽度，量真实布局：
 *   - .smart-page 是否铺满主容器（不再锁 1180px）
 *   - 撮合结果卡列数是否随宽度分档，且 6 条刚好铺满不留半排
 *   - 是否产生横向滚动（scrollWidth > innerWidth）
 *   - 表单列数与 hero 是否随宽度自适应
 */
const fs = require('fs')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')

const PORT = process.env.CDP_PORT || 9222
const URL = process.env.E2E_URL || 'http://127.0.0.1:8899/index.html'
const SHOT_DIR = path.join(__dirname, '..', 'shots')

const getJson = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
    let buf = ''
    res.on('data', (d) => { buf += d })
    res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (e) { reject(e) } })
  }).on('error', reject)
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')) }
}

// 各宽度预期：结果卡列数 / 表单列数
const CASES = [
  { w: 2560, cols: 3, form: 4 },
  { w: 1700, cols: 3, form: 4 },
  { w: 1500, cols: 3, form: 4 },
  { w: 1440, cols: 2, form: 4 },
  { w: 1280, cols: 2, form: 4 },
  { w: 1024, cols: 2, form: 2 },
  { w: 900,  cols: 2, form: 2 },
  { w: 768,  cols: 1, form: 1 },
  { w: 390,  cols: 1, form: 1 }
]

const METRICS = `(() => {
  const q = (s) => document.querySelector(s)
  const page = q('.smart-page'), hero = q('.smart-hero'), form = q('.smart-form'), results = q('.smart-results')
  if (!page || !results) return { ready: false }
  const cols = (el) => el ? getComputedStyle(el).gridTemplateColumns.split(/\\s+/).filter(Boolean).length : 0
  const r = page.getBoundingClientRect()
  return {
    ready: true,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageWidth: Math.round(r.width),
    pageLeft: Math.round(r.left),
    pageRight: Math.round(window.innerWidth - r.right),
    heroWidth: hero ? Math.round(hero.getBoundingClientRect().width) : 0,
    resultCols: cols(results),
    formCols: cols(form),
    cards: results.children.length,
    quoteCols: q('.smart-quote-grid') ? cols(q('.smart-quote-grid')) : 0
  }
})()`

async function main() {
  console.log('=== 智能工作台 · 响应式真浏览器 E2E ===\n')
  let targets
  for (let i = 0; i < 25; i++) {
    try { targets = await getJson('/json'); break } catch (e) { await sleep(300) }
  }
  if (!targets) throw new Error('无法连接 Chrome DevTools (' + PORT + ')')
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('没有可用的 page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  let seq = 0
  const pending = new Map()
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw))
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
  })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }

  for (const c of CASES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: c.w, height: 1000, deviceScaleFactor: 1, mobile: c.w < 600
    })
    await send('Page.navigate', { url: URL + '?r=' + c.w + '-' + Date.now() + '#/smart' })
    let m = null
    for (let i = 0; i < 40; i++) {
      await sleep(250)
      try {
        m = await evaluate(METRICS)
        if (m && m.ready && m.cards >= 6) break
      } catch (e) { /* 导航中 */ }
    }
    console.log(`\n【${c.w}px】` + (m ? ` 内容 ${m.pageWidth}px｜左右留白 ${m.pageLeft}/${m.pageRight}px｜结果 ${m.resultCols} 列 × ${m.cards} 张｜表单 ${m.formCols} 列` : ' 未渲染'))
    if (!m || !m.ready) { ok('页面渲染', false); continue }
    ok('智能工作台正常渲染 6 张结果卡', m.cards >= 6, m.cards)
    // 主容器由 .app 提供 24px 内边距，容差放宽到 80px（含移动模式额外边距）
    ok('内容铺满屏幕宽度（左右留白 ≤ 80px）', m.pageLeft <= 80 && m.pageRight <= 80, [m.pageLeft, m.pageRight])
    ok('无横向溢出', m.scrollWidth <= m.innerWidth + 2, [m.scrollWidth, m.innerWidth])
    ok(`结果卡 ${c.cols} 列`, m.resultCols === c.cols, m.resultCols)
    ok(`表单 ${c.form} 列`, m.formCols === c.form, m.formCols)
    ok('6 张卡铺满不留半排', m.cards % m.resultCols === 0, [m.cards, m.resultCols])
    ok('横幅随容器铺满', m.heroWidth >= m.pageWidth - 4, [m.heroWidth, m.pageWidth])

    if (c.w === 1700 || c.w === 390) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const out = path.join(SHOT_DIR, `smart-responsive-${c.w}.png`)
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
      console.log('  · 截图 ' + out)
    }
  }

  ws.close()
  console.log(`\n通过 ${pass} / 失败 ${fail}`)
  if (fail) process.exit(1)
}
main().catch((e) => { console.error('E2E 异常:', e.message); process.exit(1) })
