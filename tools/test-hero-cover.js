/**
 * Hero 覆盖层透明度回归验证（2026-11-23）
 * 背景：舍先生反馈「上面一层不透明度太高了」—— Hero 实底 100% + 全页 50% 遮罩
 * 把背景照片洗白。本测试断言覆盖层已减薄，且背景图本身仍严格 50%。
 *
 * 用法：node tools/test-hero-cover.js local|pages|live
 * 前置：本机 8899 静态服务、9222 无头 Chrome 调试端口
 */
const http = require('http')
const fs = require('fs')
const WebSocket = require('ws')

const MODE = process.argv[2] || 'local'
const URLS = {
  local: 'http://127.0.0.1:8899/index.html',
  pages: 'https://shexiao123.github.io/yinchuan-aigc-console/',
  live: 'https://guangying-web.app.workbuddy.host/?sharecode=L4AF6QVF4Q'
}
const url = URLS[MODE]
if (!url) { console.error('未知模式：' + MODE); process.exit(1) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
const getJson = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
    let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b)))
  }).on('error', rej)
})

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  \u2713 ' + name + (extra ? '  ' + extra : '')) }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  ' + extra : '')) }
}
const alpha = s => {
  const m = /rgba?\([^)]*?,\s*([\d.]+)\s*\)/.exec(s || '')
  return m ? Number(m[1]) : 1
}

;(async () => {
  const tab = (await getJson('/json')).find(x => x.type === 'page')
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise(r => ws.once('open', r))
  let seq = 0; const pend = new Map()
  ws.on('message', raw => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  })
  const send = (method, params) => new Promise(res => {
    const id = ++seq; pend.set(id, res)
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
    return r.result && r.result.result ? r.result.result.value : ''
  }

  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  const sep = url.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: url + sep + 'r=' + Date.now() })
  await sleep(MODE === 'local' ? 5500 : 7500)

  const raw = await ev(`JSON.stringify((()=>{
    const h = document.querySelector('.home-hero')
    if (!h) return { ok: false }
    const hs = getComputedStyle(h), b = getComputedStyle(h, '::before')
    const c = document.querySelector('.home-hero-copy')
    const cb = c ? getComputedStyle(c, '::before') : null
    const m = document.querySelector('.home-hero-media')
    const t = document.querySelector('.home-hero-title')
    return {
      ok: true,
      heroBgColor: hs.backgroundColor,
      heroBgImg: hs.backgroundImage,
      beforeOpacity: b.opacity,
      beforeBg: b.backgroundImage,
      bodyBg: getComputedStyle(document.body).backgroundImage,
      copyShield: cb ? cb.backgroundImage : '',
      titleColor: t ? getComputedStyle(t).color : '',
      mediaBg: m ? getComputedStyle(m).backgroundImage : '',
      heroHeight: Math.round(h.getBoundingClientRect().height)
    }
  })())`)
  let s = {}; try { s = JSON.parse(raw) } catch (e) { console.error('取值失败：' + raw); process.exit(1) }

  console.log('\n[' + MODE + '] ' + url)
  ok('Hero 已渲染', s.ok === true, s.heroHeight + 'px')
  ok('Hero 实底已减薄（不再 100% 不透明）', alpha(s.heroBgColor) <= 0.30, s.heroBgColor)
  ok('全页底图遮罩 ≤ 20%', /rgba\(250, 245, 236, 0\.18\)/.test(s.bodyBg), (s.bodyBg.match(/rgba\([^)]*\)/) || [''])[0])
  ok('全页柔焦底图存在', /warm-stage-page\.jpg/.test(s.bodyBg))
  ok('Hero 背景图仍严格 50%', s.beforeOpacity === '0.5', 'opacity=' + s.beforeOpacity)
  ok('Hero 背景图指向暖金夜景', /warm-hero-bg\.jpg/.test(s.beforeBg))
  ok('Hero 自身不再叠第二张背景图', s.heroBgImg === 'none', s.heroBgImg)
  ok('左侧文字护罩已减薄', /0\.42/.test(s.copyShield))
  ok('标题仍为深棕（可读性）', /rgb\(36, 26, 18\)/.test(s.titleColor), s.titleColor)
  ok('右侧清晰照片卡仍有实图', /\.jpg/.test(s.mediaBg))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot.result && shot.result.data) {
    fs.mkdirSync('tools/shots', { recursive: true })
    fs.writeFileSync('tools/shots/hero-cover-' + MODE + '.png', Buffer.from(shot.result.data, 'base64'))
    console.log('  截图 tools/shots/hero-cover-' + MODE + '.png')
  }
  console.log((fail ? '\u274C ' : '\u2705 ') + MODE + '  ' + pass + '/' + (pass + fail) + ' 通过')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
