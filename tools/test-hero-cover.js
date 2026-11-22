/**
 * Hero 背景回归验证（2026-11-23，最终版）
 * 舍先生最终要求「不透明的背景图、实景、东方审美」：Hero 背景换成
 * assets/covers/light/oriental-hero.jpg（苏州园林实景摄影），opacity 严格 1，
 * Hero 自身不透明实底，盖在图上方的半透明护罩全部移除。
 * 本测试断言不透明、图正确、文字可读、右侧照片卡不受影响。
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
  // rgb(...) 本身就是不透明；只有 rgba(...) 才取第四个参数
  if (!/^rgba\(/.test(s || '')) return 1
  const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(s)
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
      copyShieldDisplay: cb ? cb.display : '',
      titleColor: t ? getComputedStyle(t).color : '',
      mediaBg: m ? getComputedStyle(m).backgroundImage : '',
      heroHeight: Math.round(h.getBoundingClientRect().height)
    }
  })())`)
  let s = {}; try { s = JSON.parse(raw) } catch (e) { console.error('取值失败：' + raw); process.exit(1) }

  // 真正读背景图像素：镜像后建筑（黛瓦/花窗/灯笼）应集中在左半边，
  // 用左右半边的灰度梯度能量比来断言方向，而不是只看文件名。
  const mirrorRaw = await ev(`(async()=>{
    try {
      const h = document.querySelector('.home-hero')
      const bi = h ? getComputedStyle(h, '::before').backgroundImage : ''
      const u = (bi.match(/url\\(["']?([^"')]+)/) || [])[1]
      if (!u) return JSON.stringify({ ok: false, why: 'no url' })
      const img = new Image(); img.src = u
      await img.decode()
      const c = document.createElement('canvas'); c.width = 480; c.height = 160
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 480, 160)
      const d = ctx.getImageData(0, 0, 480, 160).data
      let L = 0, R = 0, nL = 0, nR = 0
      const lum = i => d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114
      for (let y = 0; y < 160; y++) for (let x = 0; x < 479; x++) {
        const e = Math.abs(lum((y * 480 + x) * 4) - lum((y * 480 + x + 1) * 4))
        if (x < 240) { L += e; nL++ } else { R += e; nR++ }
      }
      return JSON.stringify({ ok: true, url: u, left: L / nL, right: R / nR })
    } catch (err) { return JSON.stringify({ ok: false, why: String(err) }) }
  })()`)
  let m = {}; try { m = JSON.parse(mirrorRaw) } catch (e) { m = { ok: false, why: mirrorRaw } }

  console.log('\n[' + MODE + '] ' + url)
  ok('Hero 已渲染', s.ok === true, s.heroHeight + 'px')
  ok('Hero 实底为不透明纯色', alpha(s.heroBgColor) === 1 && /247, 239, 225/.test(s.heroBgColor), s.heroBgColor)
  ok('全页柔焦底图仍在（不受 Hero 换图影响）', /warm-stage-page\.jpg/.test(s.bodyBg))
  ok('Hero 背景图严格不透明', s.beforeOpacity === '1', 'opacity=' + s.beforeOpacity)
  ok('背景图指向东方实景镜像版', /oriental-hero\.jpg\?v=20261123l/.test(s.beforeBg), (s.beforeBg.match(/oriental-hero\.jpg[^"')]*/) || [''])[0])
  ok('建筑细节集中在左半边（水平镜像已生效）',
    m.ok === true && m.left > m.right * 1.25,
    m.ok ? '左 ' + m.left.toFixed(2) + ' / 右 ' + m.right.toFixed(2) + ' = ' + (m.left / m.right).toFixed(2) + '×' : m.why)
  ok('Hero 自身不再叠第二张背景图', s.heroBgImg === 'none', s.heroBgImg)
  ok('图上方的半透明护罩已移除', s.copyShieldDisplay === 'none', 'display=' + s.copyShieldDisplay)
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
