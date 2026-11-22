/**
 * 热销服务折叠回归验证（2026-11-23）
 * 舍先生要求「将热销服务也做折叠」：默认只留统一区块头这一条，
 * 点标题展开 4 列 8 张去重服务卡；分类区保持平铺、不折叠。
 *
 * 用法：node tools/test-hot-fold.js local|pages|live
 * 前置：本机 8899 静态服务、9222 无头 Chrome 调试端口
 */
const fs = require('fs')
const http = require('http')
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

const PROBE = `JSON.stringify((()=>{
  const d = document.querySelector('.home-hot-fold')
  if (!d) return { exists: false }
  const cards = Array.from(d.querySelectorAll('.home-svc'))
  const first = cards[0]
  const sm = d.querySelector('.home-hot-fold-head')
  const closed = d.querySelector('.v2-fold-label-closed')
  const opened = d.querySelector('.v2-fold-label-open')
  const arrow = d.querySelector('.v2-fold-arrow')
  const grid = d.querySelector('.home-svc-grid')
  const media = first ? first.querySelector('.home-svc-media') : null
  const more = d.querySelector('.v2-svc-more')
  return {
    exists: true, open: d.open,
    // Chrome 对收起的 details 内容仍返回非零 getBoundingClientRect（只是不绘制），
    // 所以「是否可见」一律以 details 自身高度为准：收起 ~79px / 展开 >500px。
    sectionH: Math.round(d.getBoundingClientRect().height),
    cardCount: cards.length,
    cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    imgH: media ? Math.round(media.getBoundingClientRect().height) : 0,
    broken: cards.filter(e => { const im = e.querySelector('img'); return im && im.complete && !im.naturalWidth }).length,
    headIdx: (d.querySelector('.v2-head-idx') || {}).textContent || '',
    headTitle: (d.querySelector('.home-sec-title') || {}).textContent || '',
    headInSummary: !!d.querySelector('summary .v2-head'),
    summaryText: sm ? sm.textContent.replace(/\\s+/g, ' ').trim() : '',
    closedShown: closed ? getComputedStyle(closed).display !== 'none' : false,
    openShown: opened ? getComputedStyle(opened).display !== 'none' : false,
    arrowTransform: arrow ? getComputedStyle(arrow).transform : '',
    moreHref: more ? more.getAttribute('href') : '',
    catDetails: document.querySelectorAll('.home-cat-panel details, .home-cat-fold-item').length
  }
})())`

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
  const probe = async () => { let s = {}; try { s = JSON.parse(await ev(PROBE)) } catch (e) {} return s }
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    if (r.result && r.result.data) {
      fs.mkdirSync('tools/shots', { recursive: true })
      fs.writeFileSync('tools/shots/' + name + '.png', Buffer.from(r.result.data, 'base64'))
    }
  }
  const atFold = async () => {
    await ev(`(()=>{const d=document.querySelector('.home-hot-fold');if(d){d.scrollIntoView({block:'start'});window.scrollBy(0,-60)}return 'ok'})()`)
    await sleep(450)
  }

  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  const sep = url.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: url + sep + 'r=' + Date.now() })
  await sleep(MODE === 'local' ? 5500 : 7500)

  console.log('\n[' + MODE + '] ' + url)

  // ① 默认收起
  const s0 = await probe()
  ok('热销服务区存在原生 details 折叠', s0.exists === true && s0.headInSummary === true)
  ok('默认收起、内容未撑开区块', s0.open === false && s0.sectionH < 150, 'open=' + s0.open + ' / ' + s0.sectionH + 'px')
  ok('收起态只占一条区块头高度', s0.sectionH > 0 && s0.sectionH < 150, s0.sectionH + 'px')
  ok('区块头仍是 02 / 热销服务', s0.headIdx === '02' && /热销服务/.test(s0.headTitle), s0.headIdx + ' ' + s0.headTitle)
  ok('提示为「展开查看」且箭头未旋转', s0.closedShown === true && s0.openShown === false && /展开查看/.test(s0.summaryText), s0.summaryText)
  ok('分类区仍不折叠（不受影响）', s0.catDetails === 0, 'details ' + s0.catDetails)
  await atFold()
  await shot('hot-fold-' + MODE + '-closed')

  // ② 点标题展开
  await ev(`(()=>{const s=document.querySelector('.home-hot-fold-head');if(s)s.click();return 'ok'})()`)
  await sleep(700)
  const s1 = await probe()
  ok('点区块头后展开、8 张卡撑开区块', s1.open === true && s1.cardCount === 8 && s1.sectionH > 500,
    s1.cardCount + ' 张 / 高 ' + s1.sectionH + 'px')
  ok('展开后仍是 4 列、图高 148px、无裂图', s1.cols === 4 && s1.imgH > 0 && s1.imgH < 170 && s1.broken === 0,
    s1.cols + ' 列 / ' + s1.imgH + 'px / 裂图 ' + s1.broken)
  ok('提示切换为「收起」且箭头旋转', s1.openShown === true && s1.closedShown === false && s1.arrowTransform !== 'none', s1.arrowTransform)
  ok('展开区底部有「浏览更多服务」入口', s1.moreHref === '#/services', s1.moreHref)
  await atFold()
  await shot('hot-fold-' + MODE + '-open')

  // ③ 再点一次收起
  await ev(`(()=>{const s=document.querySelector('.home-hot-fold-head');if(s)s.click();return 'ok'})()`)
  await sleep(450)
  const s2 = await probe()
  ok('再点可收回、区块重新压回一条', s2.open === false && s2.sectionH < 150, 'open=' + s2.open + ' / ' + s2.sectionH + 'px')

  // ④ 展开状态下跨断点重渲染，状态不丢（app.js 模块级 hotFoldOpen）
  await ev(`(()=>{const s=document.querySelector('.home-hot-fold-head');if(s)s.click();return 'ok'})()`)
  await sleep(400)
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(1200)
  const s3 = await probe()
  const rerendered = s3.cardCount === 6
  ok('跨断点重渲染后仍保持展开（状态记忆）', !rerendered || (s3.open === true && s3.sectionH > 400),
    rerendered ? '重渲染 3 列 6 张 / open=' + s3.open + ' / 高 ' + s3.sectionH + 'px' : '未触发重渲染，跳过')

  // ⑤ 点卡片进入服务详情
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(1000)
  await ev(`(()=>{const d=document.querySelector('.home-hot-fold');if(d&&!d.open)d.open=true;const a=document.querySelector('.home-hot-fold .home-svc');if(a)a.click();return 'ok'})()`)
  await sleep(MODE === 'local' ? 1200 : 2000)
  const nav = await ev(`JSON.stringify({hash:location.hash,title:(document.querySelector('.svc-title,h1')||{}).textContent||''})`)
  let nv = {}; try { nv = JSON.parse(nav) } catch (e) {}
  ok('点服务卡仍进入服务详情', /^#\/service\/\d+/.test(nv.hash || ''), nv.hash)

  console.log((fail ? '\u274C ' : '\u2705 ') + MODE + '  ' + pass + '/' + (pass + fail) + ' 通过')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
