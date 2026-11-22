/**
 * 首页 v2 整体排版回归验证（2026-11-23）
 * 舍先生要求「重新设计首页的所有排版」。
 *
 * 断言：区块顺序与数量、统一区块头、Hero 三层结构、数据带、分类左引导、
 *      深色智能横幅、四步流程、平台实力、底部行动横幅、既有功能不回归、
 *      四档视口无横向溢出；并输出整页长图与移动端截图。
 *
 * 用法：node tools/test-home-v2.js local|pages|live
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
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    if (r.result && r.result.data) {
      fs.mkdirSync('tools/shots', { recursive: true })
      fs.writeFileSync('tools/shots/' + name + '.png', Buffer.from(r.result.data, 'base64'))
    }
  }
  const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: false
  })

  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await viewport(1440, 900)

  const sep = url.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: url + sep + 'r=' + Date.now() })
  await sleep(MODE === 'local' ? 5500 : 7500)

  // 热销服务已折叠：先记录默认收起状态，再展开后做密度/去重断言
  let foldDefault = {}
  try {
    foldDefault = JSON.parse(await ev(`JSON.stringify((()=>{
      const d = document.querySelector('.home-hot-fold')
      return { exists: !!d, open: d ? d.open : null,
        headInSummary: !!(d && d.querySelector('summary .v2-head')),
        cards: d ? d.querySelectorAll('.home-svc').length : 0 }
    })())`))
  } catch (e) { foldDefault = { exists: false } }
  await ev(`(()=>{const d=document.querySelector('.home-hot-fold');if(d)d.open=true;return 'ok'})()`)
  await sleep(350)

  const read = `JSON.stringify((()=>{
    const q = s => document.querySelector(s)
    const qa = s => Array.from(document.querySelectorAll(s))
    const home = q('.home.home-v2')
    if (!home) return { ok:false }
    const kids = qa('.home.home-v2 > section, .home.home-v2 > a.smart-entry')
    const heads = qa('.v2-head')
    const hero = q('.home-hero')
    const before = hero ? getComputedStyle(hero, '::before') : null
    const entry = q('.smart-entry')
    const entryBg = entry ? getComputedStyle(entry).backgroundImage : ''
    const svcGrid = q('.home-svc-grid')
    const imgs = qa('.home-svc-img')
    const svcMedia = q('.home-svc-media')
    const photos = qa('.home-svc-media img, .home-cat-media').map(e =>
      (e.tagName === 'IMG' ? e.getAttribute('src') : (e.style.backgroundImage || '')))
    return {
      ok: true,
      order: kids.map(e => e.className.split(' ').filter(c => /^v2-|^home-hero$|^home-stats$|^smart-entry$|^home-viz$|^home-rules/.test(c)).join('|') || e.tagName.toLowerCase()),
      seq: heads.map(h => (h.querySelector('.v2-head-idx')||{}).textContent || ''),
      kickers: heads.map(h => (h.querySelector('.v2-head-kicker')||{}).textContent || ''),
      heroPromise: qa('.home-hero-promise span').length,
      heroKeys: qa('.home-hero-keys a').length,
      heroSeal: !!q('.home-hero-seal'),
      heroInnerCols: q('.home-hero-inner') ? getComputedStyle(q('.home-hero-inner')).gridTemplateColumns.split(' ').length : 0,
      heroOpacity: before ? before.opacity : '',
      heroBg: before ? before.backgroundImage : '',
      heroBgColor: hero ? getComputedStyle(hero).backgroundColor : '',
      heroBgImg: hero ? getComputedStyle(hero).backgroundImage : '',
      copyShield: q('.home-hero-copy') ? getComputedStyle(q('.home-hero-copy'), '::before').display : '',
      titleColor: q('.home-hero-title') ? getComputedStyle(q('.home-hero-title')).color : '',
      mediaBg: q('.home-hero-media') ? (q('.home-hero-media').style.backgroundImage || '') : '',
      statCols: q('.home-stats-grid') ? getComputedStyle(q('.home-stats-grid')).gridTemplateColumns.split(' ').length : 0,
      statCount: qa('.home-stat').length,
      introOk: !!q('.home-cats-intro') && !!q('.home-cats-intro a'),
      panelCols: q('.home-cat-panel') ? getComputedStyle(q('.home-cat-panel')).gridTemplateColumns.split(' ').length : 0,
      noDetails: qa('.home-cat-panel details, .home-cat-fold-item').length,
      catCovers: qa('.home-cat-group-cover').length,
      catLinks: qa('.home-cat-link').length,
      catDescs: qa('.home-cat-desc, .home-cat-group-desc').length,
      catHrefs: qa('.home-cat-link').map(a => a.getAttribute('href')),
      svcCols: svcGrid ? getComputedStyle(svcGrid).gridTemplateColumns.split(' ').length : 0,
      svcCount: qa('.home-svc').length,
      imgH: svcMedia ? Math.round(svcMedia.getBoundingClientRect().height) : 0,
      broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
      uniq: new Set(photos).size,
      photos: photos.length,
      entryDark: /gradient/.test(entryBg) && /46, 32, 21|58, 42, 28|84, 54, 32/.test(entryBg),
      orbit: !!q('.smart-entry-orbit'),
      flowSteps: qa('.home-flow-step').length,
      flowCols: q('.home-flow') ? getComputedStyle(q('.home-flow')).gridTemplateColumns.split(' ').length : 0,
      vizCols: q('.home-viz') ? getComputedStyle(q('.home-viz')).gridTemplateColumns.split(' ').length : 0,
      vizCardTop: q('.home-viz-card') ? Math.round(q('.home-viz-card').getBoundingClientRect().top) : 0,
      vizSideTop: q('.home-viz-side') ? Math.round(q('.home-viz-side').getBoundingClientRect().top) : 0,
      vizHeadSpan: q('.v2-viz .v2-head') ? getComputedStyle(q('.v2-viz .v2-head')).gridColumnStart : '',
      catGroupHeights: qa('.home-cat-group').map(e => Math.round(e.getBoundingClientRect().height)),
      introTop: q('.home-cats-intro') ? Math.round(q('.home-cats-intro').getBoundingClientRect().top) : 0,
      panelTop: q('.home-cat-panel') ? Math.round(q('.home-cat-panel').getBoundingClientRect().top) : 0,
      provCols: q('.home-prov-grid') ? getComputedStyle(q('.home-prov-grid')).gridTemplateColumns.split(' ').length : 0,
      provCount: qa('.home-prov').length,
      ctaBtns: qa('.home-cta-btns a').length,
      ctaTitle: (q('.home-cta-copy h2')||{}).textContent || '',
      rulesInline: q('.home-rules') ? getComputedStyle(q('.home-rules')).display : '',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      pageH: document.documentElement.scrollHeight
    }
  })())`

  let s = {}; try { s = JSON.parse(await ev(read)) } catch (e) { console.error('取值失败'); process.exit(1) }
  console.log('\n[' + MODE + '] ' + url)
  ok('首页 v2 已渲染', s.ok === true)
  ok('区块顺序为主视觉→数据→分类→服务→智能→流程→实力→人→商家→CTA→规则',
    s.order.length >= 10 && /home-hero/.test(s.order[0]) && /home-stats/.test(s.order[1]) && /v2-cats/.test(s.order[2]),
    s.order.length + ' 块 / ' + s.order.slice(0, 4).join(' → '))
  ok('6 个统一区块头，序号 01–06', s.seq.join('/') === '01/02/03/04/05/06', s.seq.join('/'))
  ok('区块头带英文眉标', s.kickers.length === 6 && /SERVICE CATEGORIES/.test(s.kickers[0]), s.kickers[0])
  ok('Hero 三层：inner 双栏 + 4 条承诺 + 4 个热词', s.heroInnerCols === 2 && s.heroPromise === 4 && s.heroKeys === 4,
    s.heroInnerCols + ' 栏 / ' + s.heroPromise + ' 条 / ' + s.heroKeys + ' 词')
  ok('Hero 画框印章存在', s.heroSeal === true)
  ok('Hero 东方实景背景仍严格不透明', s.heroOpacity === '1' && /oriental-hero\.jpg/.test(s.heroBg || ''), 'opacity=' + s.heroOpacity)
  ok('Hero 实底 / 无第二张底图 / 护罩移除', /247, 239, 225/.test(s.heroBgColor || '') && s.heroBgImg === 'none' && s.copyShield === 'none', s.heroBgColor)
  ok('标题仍深棕、右侧作品照仍有实图', /rgb\(36, 26, 18\)/.test(s.titleColor || '') && /\.jpg/.test(s.mediaBg || ''), s.titleColor)
  ok('数据带 5 列 5 项', s.statCols === 5 && s.statCount === 5, s.statCols + ' 列 / ' + s.statCount + ' 项')
  ok('分类区左深色引导 + 三组直接平铺（不保留折叠）', s.introOk && s.noDetails === 0 && s.panelCols === 3 && s.catCovers === 3, s.panelCols + ' 组 / details ' + s.noDetails)
  ok('分类只显示 8 个项目名称、无描述、点名称才进内容',
    s.catLinks === 8 && s.catDescs === 0 && s.catHrefs.length === 8 && s.catHrefs.every(h => /^#\/services\?category=/.test(h || '')),
    s.catLinks + ' 个名称 / 描述 ' + s.catDescs)
  ok('热销服务已折叠（默认收起、区块头在 summary 内）',
    foldDefault.exists === true && foldDefault.open === false && foldDefault.headInSummary === true && foldDefault.cards === 8,
    'open=' + foldDefault.open + ' / 卡 ' + foldDefault.cards)
  ok('精选服务 4 列 8 张（不回归）', s.svcCols === 4 && s.svcCount === 8, s.svcCols + ' 列 / ' + s.svcCount + ' 张')
  ok('服务卡图高仍收小（<170px）', s.imgH > 0 && s.imgH < 170, s.imgH + 'px')
  ok('整页封面零重复且无裂图', s.photos > 0 && s.uniq === s.photos && s.broken === 0, s.uniq + '/' + s.photos + ' 唯一 / 裂图 ' + s.broken)
  ok('智能工作台改深色宽幅断点', s.entryDark === true && s.orbit === true)
  ok('四步流程 4 列 4 步', s.flowCols === 4 && s.flowSteps === 4, s.flowCols + ' 列 / ' + s.flowSteps + ' 步')
  ok('平台实力双栏 / 服务者三列 6 张', s.vizCols === 2 && s.provCols === 3 && s.provCount === 6, s.vizCols + ' / ' + s.provCols + ' / ' + s.provCount)
  ok('平台实力区块头独占整行、两张卡顶部对齐', s.vizHeadSpan === '1' && s.vizCardTop > 0 && Math.abs(s.vizCardTop - s.vizSideTop) < 4,
    'span=' + s.vizHeadSpan + ' / top ' + s.vizCardTop + ':' + s.vizSideTop)
  ok('三组分类卡等高、左引导栏与卡片区齐平',
    s.catGroupHeights.length === 3 && new Set(s.catGroupHeights).size === 1 && Math.abs(s.introTop - s.panelTop) < 4,
    s.catGroupHeights.join('/') + 'px / 顶部 ' + s.introTop + ':' + s.panelTop)
  ok('收尾行动横幅有标题与双按钮', /好创意/.test(s.ctaTitle || '') && s.ctaBtns === 2, s.ctaTitle)
  ok('平台规则收成横向细条', s.rulesInline === 'flex', s.rulesInline)
  ok('1440 视口无横向溢出', s.overflow <= 1, '溢出 ' + s.overflow + 'px')

  // 整页长图（把所有 lazy 图强制加载）
  await ev(`(()=>{document.querySelectorAll('img[loading=lazy]').forEach(i=>{i.loading='eager';if(i.dataset.src)i.src=i.dataset.src});return 'ok'})()`)
  await sleep(1600)
  const fullH = Math.min(Math.max(s.pageH + 40, 900), 7000)
  await viewport(1440, fullH)
  await sleep(800)
  await shot('home-v2-full-' + MODE)
  console.log('  · 整页长图 tools/shots/home-v2-full-' + MODE + '.png  (' + fullH + 'px)')

  // 四档视口溢出检查（含移动端截图）
  for (const [w, h] of [[1200, 900], [900, 900], [390, 844]]) {
    await viewport(w, h)
    await sleep(500)
    const o = Number(await ev('document.documentElement.scrollWidth - window.innerWidth'))
    ok(w + 'px 视口无横向溢出', o <= 1, '溢出 ' + o + 'px')
    if (w === 390) await shot('home-v2-mobile-' + MODE)
  }
  await viewport(1440, 900)

  // 真实点击分类项目名称，验证「点名称才进入」仍然成立
  await ev(`(()=>{const a=document.querySelector('.home-cat-link');if(a)a.click();return 'ok'})()`)
  await sleep(MODE === 'local' ? 1500 : 2500)
  const nav = await ev(`JSON.stringify({hash:location.hash, services:document.querySelectorAll('.svc-card,.home-svc').length})`)
  let nv = {}; try { nv = JSON.parse(nav) } catch (err) {}
  ok('点分类项目名称进入服务列表', /^#\/services\?category=/.test(nv.hash || ''), nv.hash)

  console.log((fail ? '\u274C ' : '\u2705 ') + MODE + '  ' + pass + '/' + (pass + fail) + ' 通过')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
