/**
 * 服务分类卡片 v3：不要条形框 / 无框题签 / 照片 50% 半透明 / 文字零重影
 * 回归验证（2026-11-23 舍先生连续三轮截图）
 *
 * v1：cover 被裁成 88px 窄条、白底实色卡、flex:1 撑出大片空白。
 * v2：整卡 opacity:.5 把文字压淡；改为「照片层 .5 + 名称行 .92 米白实衬」，
 *     结果四条横贯整卡的浅色长条像输入框，被判「太丑」。
 * v3（条形框撤销）：名称彻底无框，纯文字 + 3px 铜点，flex-wrap 流式排布。
 * v3.1（舍先生追加「不要白边」）：v3 底部那片「透明→暖米」渐变仍在卡片底边
 *     堆出一条浅色圆角带 → 名称区 / 组名区 / 卡片外框**全部透明无边框**，
 *     文字直接叠在实景照片上，靠照片 50% 半透明后的浅暖底 + 近黑加粗字保证可读。
 *   · 3:2 完整不裁剪、贴底不留白
 *   · 全卡文字零 text-shadow / 零 text-stroke（上一轮「不要有重影」）
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
    coverOpacities: covers.map(e => getComputedStyle(e).opacity),
    bgColors: groups.map(e => getComputedStyle(e).backgroundColor),
    linkBgs: links.map(e => getComputedStyle(e).backgroundColor),
    linkBorders: links.map(e => { const c = getComputedStyle(e); return c.borderTopWidth + '/' + c.borderBottomWidth + '/' + c.borderLeftWidth }),
    linkRadii: links.map(e => getComputedStyle(e).borderTopLeftRadius),
    linkPaddings: links.map(e => getComputedStyle(e).padding),
    linkDisplays: links.map(e => getComputedStyle(e).display),
    linkDots: links.map(e => getComputedStyle(e, '::before').backgroundColor),
    goDisplays: qa('.home-cat-go').map(e => getComputedStyle(e).display),
    linksBgs: qa('.home-cat-links').map(e => getComputedStyle(e).backgroundImage),
    linksWraps: qa('.home-cat-links').map(e => getComputedStyle(e).flexWrap),
    linksDirs: qa('.home-cat-links').map(e => getComputedStyle(e).flexDirection),
    linksBorders: qa('.home-cat-links').map(e => getComputedStyle(e).borderTopWidth),
    headBgImages: qa('.home-cat-group-head').map(e => getComputedStyle(e).backgroundImage),
    headBorders: qa('.home-cat-group-head').map(e => getComputedStyle(e).borderBottomWidth),
    groupBorders: groups.map(e => getComputedStyle(e).borderTopWidth + '/' + getComputedStyle(e).borderBottomWidth),
    groupRadii: groups.map(e => getComputedStyle(e).borderTopLeftRadius),
    linksBgColors: qa('.home-cat-links').map(e => getComputedStyle(e).backgroundColor),
    headBgColors: qa('.home-cat-group-head').map(e => getComputedStyle(e).backgroundColor),
    linkColors: links.map(e => getComputedStyle(e).color),
    linkWeights: links.map(e => getComputedStyle(e).fontWeight),
    linkShadows: links.map(e => getComputedStyle(e).textShadow),
    linkStrokes: links.map(e => getComputedStyle(e).getPropertyValue('-webkit-text-stroke-width')),
    headBgs: qa('.home-cat-group-head').map(e => getComputedStyle(e).backgroundColor),
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
  ok('半透明只作用于照片层、整卡文字层完全清晰',
    s.opacities.length === 3 && s.opacities.every(v => v === '1') &&
    s.coverOpacities.length === 3 && s.coverOpacities.every(v => v === '0.5'),
    '卡 ' + s.opacities.join('/') + ' / 照片 ' + s.coverOpacities.join('/'))
  // ① 不要条形框：名称本身背景透明、零边框、零圆角、零内边距、无右箭头
  ok('名称不再是条形框：背景完全透明',
    s.linkBgs.length === 8 && s.linkBgs.every(v => /rgba\(0, 0, 0, 0\)|transparent/.test(v)), s.linkBgs[0])
  ok('名称无边框 / 无圆角 / 无内边距',
    s.linkBorders.length === 8 && s.linkBorders.every(v => /^0px\/0px\/0px$/.test(v)) &&
    s.linkRadii.every(v => v === '0px') && s.linkPaddings.every(v => v === '0px'),
    s.linkBorders[0] + ' / ' + s.linkRadii[0] + ' / ' + s.linkPaddings[0])
  // flex 容器会把子项 inline-flex blockify 成 flex，两者都算流式排布
  ok('名称改流式排布、右侧箭头已移除',
    s.linkDisplays.every(v => /^(inline-flex|flex)$/.test(v)) && s.goDisplays.length === 8 && s.goDisplays.every(v => v === 'none'),
    s.linkDisplays[0] + ' / go ' + s.goDisplays[0])
  ok('每个名称前置铜色小点（无框装饰）',
    s.linkDots.length === 8 && s.linkDots.every(v => /rgb\(181, 121, 61\)/.test(v)), s.linkDots[0])
  ok('名称区彻底无底、无白边（不铺渐变也不铺白块）',
    s.linksBgs.length === 3 && s.linksBgs.every(v => v === 'none') &&
    s.linksBgColors.every(v => /rgba\(0, 0, 0, 0\)|transparent/.test(v)) &&
    s.linksWraps.every(v => v === 'wrap') && s.linksDirs.every(v => v === 'row') &&
    s.linksBorders.every(v => v === '0px'),
    'bg ' + s.linksBgs[0] + ' / ' + s.linksBgColors[0] + ' / wrap ' + s.linksWraps.join('/'))
  ok('组名题签无实底无渐变（仅一条细铜线）',
    s.headBgs.length === 3 && s.headBgs.every(v => /rgba\(0, 0, 0, 0\)|transparent/.test(v)) &&
    s.headBgColors.every(v => /rgba\(0, 0, 0, 0\)|transparent/.test(v)) &&
    s.headBgImages.every(v => v === 'none') && s.headBorders.every(v => v === '1px'),
    s.headBgs[0] + ' / 图 ' + s.headBgImages[0] + ' / 线 ' + s.headBorders[0])
  ok('卡片外框已移除（圆角保留、无描边白边）',
    s.groupBorders.length === 3 && s.groupBorders.every(v => /^0px\/0px$/.test(v)) &&
    s.groupRadii.every(v => parseFloat(v) >= 10),
    s.groupBorders.join(' / ') + ' 圆角 ' + s.groupRadii[0])
  ok('名称字近黑加粗、零柔光零描边（无重影）',
    s.linkColors.every(v => /rgb\(23, 16, 11\)/.test(v)) &&
    s.linkWeights.every(v => Number(v) >= 800) &&
    s.linkShadows.every(v => v === 'none') &&
    s.linkStrokes.every(v => /^0px$|^$/.test(v.trim())),
    s.linkColors[0] + ' / ' + s.linkWeights[0] + ' / ' + s.linkShadows[0] + ' / stroke ' + s.linkStrokes[0])
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
  ok('名称文字为近黑（红框内可清楚辨认）', /rgb\(23, 16, 11\)|rgb\(36, 26, 18\)/.test(s.linkColor), s.linkColor)

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
    const ho = await ev(`getComputedStyle(document.querySelector('.home-cat-group-cover')).opacity`)
    ok('鼠标移入照片恢复清晰（封面 opacity 1）', ho === '1', 'opacity=' + ho)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
    await sleep(250)
  }
  await shot('cat-transparent-' + MODE + '-1440')

  // 手机端：无横向溢出、卡片仍保持完整 3:2
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await sleep(1200)
  const m = await ev(`JSON.stringify((()=>{const c=document.querySelector('.home-cat-group-cover');const r=c?c.getBoundingClientRect():null;return {docW:document.documentElement.scrollWidth,winW:window.innerWidth,ratio:r?r.width/r.height:0,op:c?getComputedStyle(c.closest('.home-cat-group')).opacity:'',coverOp:c?getComputedStyle(c).opacity:''}})())`)
  let mm = {}; try { mm = JSON.parse(m) } catch (e) {}
  ok('390px 手机端无横向溢出、仍 3:2 / 照片 50% / 文字清晰',
    mm.docW <= mm.winW + 2 && Math.abs((mm.ratio || 0) - 1.5) < 0.05 && mm.op === '1' && mm.coverOp === '0.5',
    mm.docW + ':' + mm.winW + ' / ' + (mm.ratio || 0).toFixed(3) + ' / 卡 ' + mm.op + ' 照片 ' + mm.coverOp)
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
