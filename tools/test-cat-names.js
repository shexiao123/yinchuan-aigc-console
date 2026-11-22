/**
 * 服务分类「只展示项目名称」回归验证（2026-11-23）
 * 舍先生要求：分类区不铺开内容描述，只留项目名称，点名称才进入服务列表。
 *
 * 用法：node tools/test-cat-names.js local|pages|live
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

  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  const sep = url.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: url + sep + 'r=' + Date.now() })
  await sleep(MODE === 'local' ? 5500 : 7500)

  const raw = await ev(`JSON.stringify((()=>{
    const box = document.querySelector('.home-cat-groups')
    if (!box) return { ok:false }
    const cards = Array.from(box.querySelectorAll('.home-cat'))
    const names = cards.map(a => (a.querySelector('.home-cat-label')||{}).textContent || '')
    return {
      ok:true,
      cardCount: cards.length,
      descCount: box.querySelectorAll('.home-cat-desc').length,
      groupDescCount: box.querySelectorAll('.home-cat-group-desc').length,
      groupNames: Array.from(box.querySelectorAll('.home-cat-group-name')).map(a=>({t:a.textContent.trim(),href:a.getAttribute('href')})),
      names,
      hrefs: cards.map(a=>a.getAttribute('href')),
      goCount: box.querySelectorAll('.home-cat-go').length,
      text: box.innerText
    }
  })())`)
  let s = {}; try { s = JSON.parse(raw) } catch (e) { console.error('取值失败：' + raw); process.exit(1) }

  console.log('\n[' + MODE + '] ' + url)
  ok('分类区已渲染', s.ok === true)
  ok('分类卡数量 = 8（4+2+2 三组）', s.cardCount === 8, s.cardCount + ' 张')
  ok('卡片描述已全部移除', s.descCount === 0, s.descCount + ' 个残留')
  ok('分组说明已全部移除', s.groupDescCount === 0, s.groupDescCount + ' 个残留')
  ok('每个名称都带进入箭头', s.goCount === s.cardCount, s.goCount + '/' + s.cardCount)
  ok('每张卡都指向分类服务列表', (s.hrefs || []).every(h => /^#\/services\?category=/.test(h || '')), (s.hrefs || [])[0])
  ok('项目名称均非空', (s.names || []).every(n => n && n.trim().length), (s.names || []).join(' / '))
  ok('分组名可点击进入全部服务', (s.groupNames || []).length === 3 && (s.groupNames || []).every(g => g.href === '#/services'), (s.groupNames || []).map(g => g.t).join(' / '))
  const leaks = ['全天跟拍、双机位', 'AI 辅助剪辑的婚礼故事短片', '企业形象片、产品片', '跟拍 · 微电影 · 宣传片 · 棚拍', '短视频快剪 · AE 动效']
  const found = leaks.filter(t => (s.text || '').includes(t))
  ok('分类区未泄露任何内容描述文案', found.length === 0, found.length ? '残留：' + found.join('、') : '干净')

  // 截图分类区
  await ev(`(()=>{const b=document.querySelector('.home-cat-groups');if(b)b.scrollIntoView({block:'start'});return 'ok'})()`)
  await sleep(700)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot.result && shot.result.data) {
    fs.mkdirSync('tools/shots', { recursive: true })
    fs.writeFileSync('tools/shots/cat-names-' + MODE + '.png', Buffer.from(shot.result.data, 'base64'))
    console.log('  截图 tools/shots/cat-names-' + MODE + '.png')
  }

  // 点击名称才进入：模拟点击第一个项目名称
  await ev(`(()=>{const a=document.querySelector('.home-cat .home-cat-name');if(a)a.click();return 'ok'})()`)
  await sleep(MODE === 'local' ? 2200 : 3200)
  const nav = await ev(`JSON.stringify((()=>({hash:location.hash,services:document.querySelectorAll('.svc-card, .service-card, .home-svc').length,body:(document.body.innerText||'').slice(0,300)}))())`)
  let n = {}; try { n = JSON.parse(nav) } catch (e) {}
  ok('点名称后进入服务列表路由', /^#\/services\?category=/.test(n.hash || ''), n.hash)
  ok('进入后才出现服务内容', (n.services || 0) > 0, (n.services || 0) + ' 个服务项')

  console.log((fail ? '\u274C ' : '\u2705 ') + MODE + '  ' + pass + '/' + (pass + fail) + ' 通过')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
