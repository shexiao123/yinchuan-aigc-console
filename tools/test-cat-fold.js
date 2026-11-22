/**
 * 服务分类折叠 + 首页重排回归验证（2026-11-23）
 * 舍先生截图红框三组，要求「按各自的分类折叠进去，首页重新排版」。
 *
 * 断言：默认三列折叠、只显示分类名称；点名称展开该类项目卡；
 *      点项目名称仍进入服务列表；分类区默认高度明显收紧。
 *
 * 用法：node tools/test-cat-fold.js local|pages|live
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

  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  const sep = url.includes('?') ? '&' : '?'
  await send('Page.navigate', { url: url + sep + 'r=' + Date.now() })
  await sleep(MODE === 'local' ? 5500 : 7500)

  const readState = `JSON.stringify((()=>{
    const box = document.querySelector('.home-cat-fold')
    if (!box) return { ok:false }
    const items = Array.from(box.querySelectorAll('.home-cat-fold-item'))
    return {
      ok:true,
      count: items.length,
      openFlags: items.map(d => d.open),
      names: items.map(d => (d.querySelector('.home-cat-fold-name')||{}).textContent || ''),
      counts: items.map(d => (d.querySelector('.home-cat-fold-count')||{}).textContent || ''),
      cardCounts: items.map(d => d.querySelectorAll('.home-cat').length),
      hrefs: items.flatMap(d => Array.from(d.querySelectorAll('.home-cat')).map(a => a.getAttribute('href'))),
      boxHeight: Math.round(box.getBoundingClientRect().height),
      cols: getComputedStyle(box).gridTemplateColumns.split(' ').length,
      heroOpacity: (()=>{const h=document.querySelector('.home-hero');return h?getComputedStyle(h,'::before').opacity:''})(),
      heroBg: (()=>{const h=document.querySelector('.home-hero');return h?getComputedStyle(h,'::before').backgroundImage:''})()
    }
  })())`

  let s = {}; try { s = JSON.parse(await ev(readState)) } catch (e) { console.error('取值失败'); process.exit(1) }

  console.log('\n[' + MODE + '] ' + url)
  ok('折叠区已渲染', s.ok === true)
  ok('三组分类（拍摄制作 / 后期剪辑 / AI 创作）', s.count === 3, s.count + ' 组')
  ok('默认全部折叠（首页只露名称）', (s.openFlags || []).every(v => v === false), JSON.stringify(s.openFlags))
  ok('分类名称正确', (s.names || []).join('/') === '拍摄制作/后期剪辑/AI 创作', (s.names || []).join(' / '))
  ok('每组显示分类数量', (s.counts || []).join('/') === '4 类/2 类/2 类', (s.counts || []).join(' / '))
  ok('各组卡片已折进各自分类（4/2/2）', (s.cardCounts || []).join('/') === '4/2/2', (s.cardCounts || []).join(' / '))
  ok('宽屏三列重排版', s.cols === 3, s.cols + ' 列')
  ok('折叠后分类区明显变矮（< 200px）', s.boxHeight > 0 && s.boxHeight < 200, s.boxHeight + 'px')
  ok('8 张项目卡均指向对应服务列表', (s.hrefs || []).length === 8 && (s.hrefs || []).every(h => /^#\/services\?category=/.test(h || '')))
  ok('Hero 东方实景背景为不透明', s.heroOpacity === '1' && /oriental-hero\.jpg/.test(s.heroBg || ''), 'opacity=' + s.heroOpacity)

  await ev(`(()=>{const b=document.querySelector('.home-cats-section');if(b)b.scrollIntoView({block:'start'});return 'ok'})()`)
  await sleep(600)
  await shot('cat-fold-collapsed-' + MODE)

  // 点第一个分类名称展开
  await ev(`(()=>{const d=document.querySelector('.home-cat-fold-item');if(d)d.querySelector('summary').click();return 'ok'})()`)
  await sleep(500)
  let e1 = {}; try { e1 = JSON.parse(await ev(readState)) } catch (err) {}
  ok('点名称后展开该分类', e1.openFlags && e1.openFlags[0] === true && e1.openFlags[1] === false, JSON.stringify(e1.openFlags))
  ok('展开后分类区变高', e1.boxHeight > s.boxHeight, s.boxHeight + ' → ' + e1.boxHeight + 'px')
  await shot('cat-fold-expanded-' + MODE)

  // 再点收起
  await ev(`(()=>{const d=document.querySelector('.home-cat-fold-item');if(d)d.querySelector('summary').click();return 'ok'})()`)
  await sleep(400)
  let e2 = {}; try { e2 = JSON.parse(await ev(readState)) } catch (err) {}
  ok('再点名称可收起', (e2.openFlags || []).every(v => v === false), JSON.stringify(e2.openFlags))

  // 展开后点项目名称，应进入服务列表
  await ev(`(()=>{const d=document.querySelector('.home-cat-fold-item');if(d)d.querySelector('summary').click();const a=d&&d.querySelector('.home-cat');if(a)a.click();return 'ok'})()`)
  await sleep(MODE === 'local' ? 1800 : 2800)
  const nav = await ev(`JSON.stringify({hash:location.hash,services:document.querySelectorAll('.svc-card,.home-svc').length})`)
  let n = {}; try { n = JSON.parse(nav) } catch (err) {}
  ok('点项目名称进入服务列表', /^#\/services\?category=/.test(n.hash || ''), n.hash)

  console.log((fail ? '\u274C ' : '\u2705 ') + MODE + '  ' + pass + '/' + (pass + fail) + ' 通过')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
