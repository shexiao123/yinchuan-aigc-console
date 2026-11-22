/**
 * 服务分类卡片：图片不裁剪 / 整卡 50% 透明 / 不留白
 * 回归验证（2026-11-23 舍先生截图要求）
 *
 * 旧版：cover 被 background-size:cover 裁成 88px 窄条，白底实色卡 +
 *       flex:1 把 2 项那两组撑出大片空白。
 * 新版：封面 3:2 完整显示（100% 100%，不裁切不变形不留白边），
 *       组名/名称叠在照片上，卡片无白底、名称列表贴底，整卡 opacity:.5，
 *       hover / focus-within 恢复 1。
 *
 * 用法：node tools/test-cat-transparent.js local|pages|live
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
  const q  = s => document.querySelector(s)
  const qa = s => Array.from(document.querySelectorAll(s))
  const groups = qa('.home-cat-group')
  const covers = qa('.home-cat-group-cover')
  const links  = qa('.home-cat-link')
  const g0 = groups[0], c0 = covers[0]
  const bgUrl = e => (getComputedStyle(e).backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1] || ''
  const rect = e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) } }
  return {
    groupCount: groups.length,
    coverCount: covers.length,
    linkCount: links.length,
    details: qa('.home-cat-panel details, .home-cat-fold-item').length,
    hrefs: links.map(a => a.getAttribute('href')),
    opacities: groups.map(e => getComputedStyle(e).opacity),
    bgColors: groups.map(e => getComputedStyle(e).backgroundColor),
    shadows: groups.map(e => getComputedStyle(e).boxShadow),
    coverSizes: covers.map(e => getComputedStyle(e).backgroundSize),
    coverUrls: covers.map(bgUrl),
    coverRects: covers.map(rect),
    groupRects: groups.map(rect),
    // 名称列表到卡片底部的距离：贴底才叫「不留白」
    linkBottoms: groups.map(e => {
      const l = e.querySelector('.home-cat-links')
      return l ? Math.round(e.getBoundingClientRect().bottom - l.getBoundingClientRect().bottom) : -1
    }),
    linkColor: links[0] ? getComputedStyle(links[0]).color : '',
    headPos: q('.home-cat-group-head') ? getComputedStyle(q('.home-cat-group-head')).position : '',
    linksPos: q('.home-cat-links') ? getComputedStyle(q('.home-cat-links')).position : '',
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
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    if (r.result && r.result.data) {
      fs.mkdirSync('tools/shots', { recursive: true })
      fs.writeFileSync('tools/shots/' + name + '.png', Buffer.from(r.result.data, 'base64'))
    }
  }

  await send('Page.enable'); await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  const sep = url.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: url + sep + 'r=' + Date.now() })
  await sleep(MODE === 'local' ? 5200 : 7500)

  // 滚到分类区：截图 + hover 命中都需要卡片真正进入视口
  await ev(`(()=>{const e=document.querySelector('.home-cats-section');if(e)window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-70);return 'ok'})()`)
  await sleep(600)

  let s = {}
  try { s = JSON.parse(await ev(PROBE)) } catch (e) { console.error('探针取值失败'); process.exit(1) }
  console.log('\n[' + MODE + '] ' + url)

  ok('三组分类仍在、不折叠', s.groupCount === 3 && s.coverCount === 3 && s.details === 0,
    s.groupCount + ' 组 / details ' + s.details)
  ok('整个卡片严格 50% 透明', s.opacities.length === 3 && s.opacities.every(v => v === '0.5'), s.opacities.join(' / '))
  ok('卡片无白色实底（背景透明）', s.bgColors.every(v => /rgba\(0, 0, 0, 0\)|transparent/.test(v)), s.bgColors[0])
  ok('卡片不再有白卡阴影', s.shadows.every(v => v === 'none'), s.shadows[0])
  ok('封面不裁剪：background-size = 100% 100%', s.coverSizes.every(v => v === '100% 100%'), s.coverSizes.join(' / '))
  const ratios = s.coverRects.map(r => r.w / r.h)
  ok('封面按 3:2 完整显示（不裁切不变形）', ratios.every(v => Math.abs(v - 1.5) < 0.04), ratios.map(v => v.toFixed(3)).join(' / '))
  ok('封面铺满整卡、图下无白底留白', s.coverRects.every((r, i) => Math.abs(r.h - s.groupRects[i].h) <= 2),
    s.coverRects.map((r, i) => r.h + ':' + s.groupRects[i].h).join(' / '))
  ok('名称列表贴底、下方无空白', s.linkBottoms.every(v => v >= -1 && v <= 2), s.linkBottoms.join(' / ') + 'px')
  ok('组名与名称都叠在照片上（绝对定位）', s.headPos === 'absolute' && s.linksPos === 'absolute', s.headPos + ' / ' + s.linksPos)
  ok('三张卡等高、三张封面零重复', new Set(s.groupRects.map(r => r.h)).size === 1 && new Set(s.coverUrls).size === 3,
    s.groupRects.map(r => r.h).join('/') + 'px')
  ok('8 个项目名称仍可点、只显示名称', s.linkCount === 8 && s.hrefs.every(h => /^#\/services\?category=/.test(h || '')),
    s.linkCount + ' 个')
  ok('名称文字为深色（半透明下仍可读）', /rgb\(36, 26, 18\)|rgb\(42, 26, 14\)/.test(s.linkColor), s.linkColor)

  // 三张封面真的能加载（不是空 URL / 裂图）
  const loaded = await ev(`(async()=>{const urls=${JSON.stringify(s.coverUrls)};const r=await Promise.all(urls.map(u=>new Promise(res=>{const i=new Image();i.onload=()=>res(i.naturalWidth);i.onerror=()=>res(0);i.src=u})));return JSON.stringify(r)})()`)
  let lw = []; try { lw = JSON.parse(loaded) } catch (e) {}
  ok('三张封面图片均加载成功', lw.length === 3 && lw.every(v => v > 0), lw.join(' / '))

  // hover 恢复清晰（用真鼠标事件，而不是改样式）
  const box = await ev(`JSON.stringify((()=>{const r=document.querySelector('.home-cat-group').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+Math.min(r.height/2,120))}})())`)
  let pt = {}; try { pt = JSON.parse(box) } catch (e) {}
  if (pt.y > 0 && pt.y < 900) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y })
    await sleep(350)
    const ho = await ev(`getComputedStyle(document.querySelector('.home-cat-group')).opacity`)
    ok('鼠标移入恢复清晰（opacity 1）', ho === '1', 'opacity=' + ho)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
    await sleep(250)
  }
  await shot('cat-transparent-' + MODE + '-1440')

  // 手机端：无横向溢出、卡片仍保持完整 3:2
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await sleep(1200)
  const m = await ev(`JSON.stringify((()=>{const c=document.querySelector('.home-cat-group-cover');const r=c?c.getBoundingClientRect():null;return {docW:document.documentElement.scrollWidth,winW:window.innerWidth,ratio:r?r.width/r.height:0,op:c?getComputedStyle(c.closest('.home-cat-group')).opacity:''}})())`)
  let mm = {}; try { mm = JSON.parse(m) } catch (e) {}
  ok('390px 手机端无横向溢出、仍 3:2 / 50%', mm.docW <= mm.winW + 2 && Math.abs((mm.ratio || 0) - 1.5) < 0.05 && mm.op === '0.5',
    mm.docW + ':' + mm.winW + ' / ' + (mm.ratio || 0).toFixed(3) + ' / ' + mm.op)
  await shot('cat-transparent-' + MODE + '-390')

  // 点名称仍进入服务列表（折叠/透明不影响跳转）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(900)
  await ev(`(()=>{const a=document.querySelector('.home-cat-link');if(a)a.click();return 'ok'})()`)
  await sleep(MODE === 'local' ? 1200 : 2000)
  const nav = await ev(`JSON.stringify({hash:location.hash,services:document.querySelectorAll('.svc-card,.home-svc').length})`)
  let nv = {}; try { nv = JSON.parse(nav) } catch (e) {}
  ok('点项目名称仍进入服务列表', /^#\/services\?category=/.test(nv.hash || ''), nv.hash)

  console.log((fail ? '\u274C ' : '\u2705 ') + MODE + '  ' + pass + '/' + (pass + fail) + ' 通过')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
