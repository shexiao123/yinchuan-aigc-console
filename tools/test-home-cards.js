/**
 * 首页卡片密度 / 封面去重回归测试（真浏览器 CDP）
 *
 * 2026-11-23：舍先生反馈「每个卡片占比太大了，而且卡片插图有重复的」。
 * 根因是封面按 category_id 映射，同分类的两个服务必然撞图。
 * 本脚本断言四档视口下的列数、卡片数、单卡宽度与「整页封面零重复」。
 *
 * 用法：node tools/test-home-cards.js [local|pages|live]
 * 依赖：无头 Chrome 调试端口 9222；local 还需 8899 静态服务。
 */
const fs = require('fs')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: 9222, path: p }, (r) => {
    let b = ''
    r.on('data', (d) => { b += d })
    r.on('end', () => res(JSON.parse(b)))
  }).on('error', rej)
})

const MODE = process.argv[2] || 'local'
const BASE = {
  local: 'http://127.0.0.1:8899/index.html',
  pages: 'https://shexiao123.github.io/yinchuan-aigc-console/',
  live: 'https://guangying-web.app.workbuddy.host/?sharecode=L4AF6QVF4Q'
}[MODE] || 'http://127.0.0.1:8899/index.html'

let pass = 0
let fail = 0
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  → ' + detail : '')) }
}

const PROBE = `JSON.stringify((()=>{
  const grid=document.querySelector('.home-svc-grid');
  const svc=[...document.querySelectorAll('.home-svc')];
  const cats=[...document.querySelectorAll('.home-cat-media')];
  const key=u=>u?u.split('?')[0].split('/').slice(-2).join('/'):'';
  const catSrc=cats.map(e=>key((getComputedStyle(e).backgroundImage.match(/url\\(["']?([^"')]+)/)||[])[1]||''));
  const svcSrc=svc.map(e=>{const im=e.querySelector('img');return key(im?(im.currentSrc||im.src):'')});
  const photos=[...catSrc,...svcSrc].filter(Boolean);
  const media=svc[0]?svc[0].querySelector('.home-svc-media'):null;
  return {
    cols:grid?getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length:0,
    cardW:svc[0]?Math.round(svc[0].getBoundingClientRect().width):0,
    imgH:media?Math.round(media.getBoundingClientRect().height):0,
    catCount:cats.length,svcCount:svc.length,
    photos,uniq:new Set(photos).size,
    broken:svc.filter(e=>{const im=e.querySelector('img');return !im||!im.naturalWidth}).length,
    emptyCat:catSrc.filter(x=>!x).length
  }
})())`

;(async () => {
  const t = (await getJson('/json')).find((x) => x.type === 'page')
  if (!t) throw new Error('没有可用的 Chrome 页面（9222）')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((r) => ws.once('open', r))
  let seq = 0
  const pend = new Map()
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  })
  const send = (method, params) => new Promise((res) => {
    const id = ++seq
    pend.set(id, res)
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    return r.result && r.result.result ? r.result.result.value : ''
  }

  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Network.setBlockedURLs', { urls: [] })

  const cases = [
    { w: 1440, h: 900, cols: 4, cards: 8, maxW: 350 },
    { w: 1200, h: 900, cols: 3, cards: 6, maxW: 400 },
    { w: 900, h: 900, cols: 2, cards: 6, maxW: 460 },
    { w: 390, h: 844, cols: 2, cards: 6, maxW: 220 }
  ]

  for (const c of cases) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: c.w, height: c.h, deviceScaleFactor: 1, mobile: c.w < 600
    })
    const sep = BASE.includes('?') ? '&' : '?'
    await send('Page.navigate', { url: BASE + sep + 'r=' + Date.now() + '_' + c.w })
    await sleep(MODE === 'local' ? 4500 : 7000)
    // 热销服务已折叠：先展开 details，否则卡片 display:none、lazy 图不加载会被误判成裂图
    await ev(`(()=>{const d=document.querySelector('.home-hot-fold');if(d)d.open=true;return 'ok'})()`)
    await sleep(250)
    // 卡片图是 loading="lazy"：先滚动到位再探测，否则 naturalWidth=0 会被误判成裂图
    await ev(`(()=>{const g=document.querySelector('.home-svc-grid');if(g)g.scrollIntoView({block:'center'});return 'ok'})()`)
    await sleep(900)
    let st
    try { st = JSON.parse(await ev(PROBE)) } catch (e) { st = null }
    console.log('\n【' + MODE + ' · ' + c.w + '×' + c.h + '】')
    if (!st) { ok('页面可探测', false, 'probe 失败'); continue }
    ok('热销区 ' + c.cols + ' 列', st.cols === c.cols, '实际 ' + st.cols)
    ok('卡片数 ' + c.cards + ' 张（整行铺满）', st.svcCount === c.cards, '实际 ' + st.svcCount)
    ok('单卡宽度 < ' + c.maxW + 'px', st.cardW > 0 && st.cardW < c.maxW, st.cardW + 'px')
    ok('图片高度已收小', st.imgH > 0 && st.imgH < 170, st.imgH + 'px')
    console.log('     单卡 ' + st.cardW + '×' + (st.imgH + 110) + 'px，图高 ' + st.imgH + 'px')
    ok('分类卡有背景图', st.catCount > 0 && st.emptyCat === 0, st.catCount + ' 张 / 空 ' + st.emptyCat)
    ok('整页封面零重复', st.photos.length > 0 && st.uniq === st.photos.length,
      st.uniq + ' 唯一 / ' + st.photos.length + ' 张：' + st.photos.join(', '))
    ok('服务卡图片全部加载成功', st.broken === 0, '裂图 ' + st.broken)
    console.log('     照片: ' + st.photos.join(' · '))

    if (c.w === 1440) {
      await ev(`window.scrollBy(0,-72);'ok'`)
      await sleep(500)
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      if (shot.result && shot.result.data) {
        const dir = path.resolve(__dirname, 'shots')
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        const out = path.join(dir, 'home-cards-' + MODE + '-1440.png')
        fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
        console.log('     截图: ' + out)
      }
    }
  }

  console.log('\n────────────────────────')
  console.log('通过 ' + pass + ' / ' + (pass + fail) + (fail ? '  ❌ 有 ' + fail + ' 项失败' : '  ✅ 全部通过'))
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('测试异常:', e.message); process.exit(1) })
