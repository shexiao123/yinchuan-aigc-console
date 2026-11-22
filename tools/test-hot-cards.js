/**
 * 热销服务：撤销折叠 / 图片不裁剪 / 照片 50% 透明 / 不留白 / 文字零重影
 * 回归验证（2026-11-23 舍先生截图要求「这边不做折叠了」「文字不要有重影」）
 *
 * 旧版：原生 <details> 默认收起、白底实色卡 + cover 裁成 148px 窄条、
 *       flex:1 / margin-top:auto 把文字区撑出白底空白。
 * 中版：整卡 opacity:.5 + 文字描边 + 偏移 text-shadow → 截图里出现双层重影。
 * 新版：统一区块头 + 8 张卡直接平铺；封面 3:2 完整显示（object-fit:fill），
 *       整卡 opacity:1、仅 .home-svc-media 照片层 .5；文字全部取消描边与阴影，
 *       用实色 + 字重拉层次；hover 时照片恢复 1。
 *
 * 用法：node tools/test-hot-cards.js local|pages|live
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
  const qa = s => Array.from(document.querySelectorAll(s))
  const sec = document.querySelector('.v2-svc')
  const head = sec ? sec.querySelector('.v2-head') : null
  const cards = qa('.v2-svc .home-svc')
  const grid = document.querySelector('.v2-svc .home-svc-grid')
  const more = head ? head.querySelector('.home-sec-more') : null
  const moreBtnEl = sec ? sec.querySelector('.v2-svc-more') : null
  const rect = e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) } }
  const cs = (e, p) => getComputedStyle(e)[p]
  return {
    secExists: !!sec,
    sectionH: sec ? Math.round(sec.getBoundingClientRect().height) : 0,
    details: qa('.home-hot-fold, .v2-svc details, summary.home-hot-fold-head').length,
    foldBtns: qa('.v2-fold-toggle, .v2-fold-label, .v2-fold-arrow').length,
    headText: head ? head.textContent.replace(/\\s+/g, ' ').trim() : '',
    headIdx: head ? (head.querySelector('.v2-head-idx') || {}).textContent || '' : '',
    headTitle: head ? (head.querySelector('.home-sec-title') || {}).textContent || '' : '',
    moreHref: more ? more.getAttribute('href') : '',
    bodyFlat: !!sec && !!sec.querySelector('.home-hot-body'),
    moreBtn: moreBtnEl ? moreBtnEl.getAttribute('href') : '',
    cardCount: cards.length,
    cols: grid ? cs(grid, 'gridTemplateColumns').split(' ').filter(Boolean).length : 0,
    hrefs: cards.map(a => a.getAttribute('href')),
    opacities: cards.map(e => cs(e, 'opacity')),
    mediaOpacities: cards.map(e => cs(e.querySelector('.home-svc-media'), 'opacity')),
    bgColors: cards.map(e => cs(e, 'backgroundColor')),
    shadows: cards.map(e => cs(e, 'boxShadow')),
    textShadows: cards.map(e => {
      const sel = '.home-svc-title,.home-svc-sub,.home-svc-meta,.home-svc-unit,.home-svc-price,.price-value,.price-old,.home-svc-tags .tag'
      return Array.from(e.querySelectorAll(sel)).map(t => cs(t, 'textShadow'))
    }),
    textStrokes: cards.map(e => {
      const sel = '.home-svc-title,.home-svc-sub,.home-svc-meta,.home-svc-unit,.home-svc-price,.price-value,.price-old,.home-svc-tags .tag'
      return Array.from(e.querySelectorAll(sel)).map(t => getComputedStyle(t).getPropertyValue('-webkit-text-stroke-width'))
    }),
    objectFits: cards.map(e => cs(e.querySelector('img'), 'objectFit')),
    imgUrls: cards.map(e => { const im = e.querySelector('img'); return im ? (im.getAttribute('data-src') || im.getAttribute('src') || '') : '' }),
    broken: cards.filter(e => { const im = e.querySelector('img'); return im && im.complete && !im.naturalWidth }).length,
    mediaRects: cards.map(e => rect(e.querySelector('.home-svc-media'))),
    imgRects: cards.map(e => rect(e.querySelector('img'))),
    cardRects: cards.map(rect),
    bodyFlex: cards.map(e => cs(e.querySelector('.home-svc-body'), 'flex')),
    footMargins: cards.map(e => cs(e.querySelector('.home-svc-foot'), 'marginTop')),
    gaps: cards.map(e => Math.round(e.getBoundingClientRect().bottom - e.querySelector('.home-svc-foot').getBoundingClientRect().bottom)),
    catOpacities: qa('.home-cat-group').map(e => cs(e, 'opacity')),
    catCoverOpacities: qa('.home-cat-group-cover').map(e => cs(e, 'opacity')),
    catDetails: qa('.home-cat-panel details, .home-cat-fold-item').length,
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth
  }
})())`

;(async () => {
  const tabs = await getJson('/json')
  const t = tabs.find(x => x.type === 'page')
  if (!t) throw new Error('没有可用的调试标签页')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise(r => ws.once('open', r))
  let seq = 0; const pend = new Map()
  ws.on('message', raw => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  })
  const send = (method, params) => new Promise(res => {
    const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} }))
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
  const atSec = async () => {
    await ev(`(()=>{const e=document.querySelector('.v2-svc');if(e)window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-70);return 'ok'})()`)
    await sleep(700)
  }

  await send('Page.enable'); await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  const sep = url.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: url + sep + 'r=' + Date.now() })
  await sleep(MODE === 'local' ? 5500 : 7500)
  await atSec()

  const s = await probe()
  console.log('\n[' + MODE + '] ' + url)

  // ① 撤销折叠
  ok('热销区块存在、区块头仍是 02 / 热销服务', s.secExists && s.headIdx === '02' && /热销服务/.test(s.headTitle), s.headIdx + ' ' + s.headTitle)
  ok('不再有 details / summary 折叠', s.details === 0 && s.foldBtns === 0, 'details ' + s.details + ' / 按钮 ' + s.foldBtns)
  ok('区块头无「收起 / 展开查看」字样', !/收起|展开查看/.test(s.headText), s.headText)
  ok('8 张卡默认直接平铺、区块被撑开', s.bodyFlat === true && s.cardCount === 8 && s.sectionH > 500,
    s.cardCount + ' 张 / 高 ' + s.sectionH + 'px')
  ok('宽屏 4 列、右上/底部仍有服务列表入口', s.cols === 4 && s.moreHref === '#/services' && s.moreBtn === '#/services',
    s.cols + ' 列 / ' + s.moreHref + ' / ' + s.moreBtn)

  // ② 半透明只给照片层、整卡与文字层完全清晰、无白底、文字零重影
  ok('整卡与文字层 opacity 1（文字不再被整体压淡）',
    s.opacities.length === 8 && s.opacities.every(v => v === '1'), s.opacities.join(' / '))
  ok('照片层仍 50% 透明（淡雅观感不变）',
    s.mediaOpacities.length === 8 && s.mediaOpacities.every(v => v === '0.5'), s.mediaOpacities.join(' / '))
  const allShadows = (s.textShadows || []).reduce((a, b) => a.concat(b), [])
  const allStrokes = (s.textStrokes || []).reduce((a, b) => a.concat(b), [])
  ok('全部卡内文字无 text-shadow（重影根因 1 已清）',
    allShadows.length >= 8 && allShadows.every(v => v === 'none' || v === ''),
    allShadows.length + ' 个文字元素 / ' + [...new Set(allShadows)].join(','))
  ok('全部卡内文字无 -webkit-text-stroke（重影根因 2 已清）',
    allStrokes.length >= 8 && allStrokes.every(v => /^(0px|0|)$/.test(v)),
    allStrokes.length + ' 个文字元素 / ' + [...new Set(allStrokes)].join(','))
  ok('卡片无白色实底（背景透明）', s.bgColors.length === 8 && s.bgColors.every(v => /rgba\(0, 0, 0, 0\)|transparent/.test(v)), s.bgColors[0])
  ok('卡片不再有白卡阴影', s.shadows.every(v => v === 'none'), s.shadows[0])

  // ③ 图片不裁剪：object-fit:fill + 3:2 完整显示 + 图与容器完全贴合
  ok('封面不裁剪：object-fit = fill', s.objectFits.length === 8 && s.objectFits.every(v => v === 'fill'), s.objectFits.join(' / '))
  const ratios = s.mediaRects.map(r => r.w / r.h)
  ok('封面 3:2 完整显示（不再是 148px 窄条裁切）', ratios.length === 8 && ratios.every(v => Math.abs(v - 1.5) < 0.05),
    ratios.map(v => v.toFixed(3)).join(' / '))
  const flush = s.mediaRects.every((r, i) => {
    const im = s.imgRects[i]
    return Math.abs(r.w - im.w) <= 2 && Math.abs(r.h - im.h) <= 2
  })
  ok('图片铺满容器、四周无留白边', flush, '图 ' + s.imgRects[0].w + 'x' + s.imgRects[0].h + ' / 容器 ' + s.mediaRects[0].w + 'x' + s.mediaRects[0].h)
  ok('8 张卡封面零重复、无裂图', new Set(s.imgUrls).size === 8 && s.broken === 0, new Set(s.imgUrls).size + ' 种 / 裂图 ' + s.broken)

  // ④ 不留白：文字区自然高度，卡底与价格行之间只有内边距
  ok('文字区不再 flex:1 拉伸', s.bodyFlex.every(v => /^(0 0 auto|none)$/.test(v)), s.bodyFlex[0])
  ok('价格行不再 margin-top:auto 撑空白', s.footMargins.every(v => v === '0px'), s.footMargins[0])
  ok('卡底无空白区（只剩 11px 内边距）', s.gaps.every(v => v >= 0 && v <= 22), s.gaps.join(' / ') + 'px')
  const rowH = new Set(s.cardRects.slice(0, 4).map(r => r.h))
  ok('同一行卡片等高、无参差留白', rowH.size === 1, Array.from(rowH).join('/') + 'px')

  // ⑤ 分类区不受影响
  ok('分类仍平铺不折叠、照片半透明而文字清晰',
    s.catDetails === 0 && s.catOpacities.length === 3 && s.catOpacities.every(v => v === '1') &&
    s.catCoverOpacities.length === 3 && s.catCoverOpacities.every(v => v === '0.5'),
    'details ' + s.catDetails + ' / 卡 ' + s.catOpacities.join('/') + ' 照片 ' + s.catCoverOpacities.join('/'))

  // ⑥ hover 恢复清晰（真鼠标事件）
  const box = await ev(`JSON.stringify((()=>{const r=document.querySelector('.v2-svc .home-svc').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+Math.min(r.height/2,120))}})())`)
  let pt = {}; try { pt = JSON.parse(box) } catch (e) {}
  if (pt.y > 0 && pt.y < 900) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y })
    await sleep(350)
    const ho = await ev(`JSON.stringify((()=>{const c=document.querySelector('.v2-svc .home-svc');return {card:getComputedStyle(c).opacity,media:getComputedStyle(c.querySelector('.home-svc-media')).opacity}})())`)
    let hv = {}; try { hv = JSON.parse(ho) } catch (e) {}
    ok('鼠标移入照片恢复清晰、整卡始终 1', hv.card === '1' && hv.media === '1',
      '卡 ' + hv.card + ' / 照片 ' + hv.media)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
    await sleep(250)
  }
  await shot('hot-cards-' + MODE + '-1440')

  // ⑦ 多视口：3 列 / 2 列 / 无横向溢出
  for (const [w, expectCols] of [[1200, 3], [390, 2]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: false })
    await sleep(1100)
    const m = await probe()
    ok(w + 'px：' + expectCols + ' 列、整卡清晰 / 照片 50%、无横向溢出',
      m.cols === expectCols && m.opacities.every(v => v === '1') &&
      m.mediaOpacities.every(v => v === '0.5') && m.docW <= m.winW + 2 && m.details === 0,
      m.cols + ' 列 / ' + m.docW + ':' + m.winW + ' / 卡 ' + m.opacities[0] + ' 照片 ' + m.mediaOpacities[0])
    if (w === 390) await shot('hot-cards-' + MODE + '-390')
  }

  // ⑧ 点卡片仍进入服务详情
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(900)
  await ev(`(()=>{const a=document.querySelector('.v2-svc .home-svc');if(a)a.click();return 'ok'})()`)
  await sleep(MODE === 'local' ? 1200 : 2000)
  const nav = await ev(`JSON.stringify({hash:location.hash,title:(document.querySelector('.svc-title,h1')||{}).textContent||''})`)
  let nv = {}; try { nv = JSON.parse(nav) } catch (e) {}
  ok('点服务卡仍进入服务详情', /^#\/service\/\d+/.test(nv.hash || ''), nv.hash)

  console.log((fail ? '\u274C ' : '\u2705 ') + MODE + '  ' + pass + '/' + (pass + fail) + ' 通过')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
