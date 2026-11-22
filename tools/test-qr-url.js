/**
 * 二维码落地地址回归测试（真浏览器）
 *
 * 背景：2026-11-23 出现「扫码之后是 404」。根因是站点预览环境把
 * location.origin 画进了二维码 —— GitHub Pages 裸 origin
 * https://shexiao123.github.io 返 404（仓库路径丢了），托管域名裸 origin 返 403。
 * 当时的测试只断言「有没有 SVG」，没断言「码里编的是什么地址」，所以漏了。
 *
 * 本脚本直接读 #qrBox.dataset.qrUrl 并断言内容，覆盖四种环境：
 *   本地·云可达 / 本地·站点预览 / 线上 Pages 预览 / 线上托管
 * 外加「?login=1 落地自动弹登录」用例。
 *
 * 用法：node tools/test-qr-url.js [local|live]
 * 依赖：无头 Chrome 调试端口 9222；local 还需 8899 静态服务。
 */
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
const LOCAL = 'http://127.0.0.1:8899/index.html'
const PAGES = 'https://shexiao123.github.io/yinchuan-aigc-console/'
const HOST = 'https://guangying-web.app.workbuddy.host/?sharecode=L4AF6QVF4Q'

let pass = 0
let fail = 0
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')) }
}

const cases = MODE === 'live'
  ? [
      { name: '线上 Pages（站点预览）', url: PAGES, block: false, mode: 'preview' },
      { name: '线上托管（云可达）', url: HOST, block: false, mode: 'oauth' }
    ]
  : [
      { name: '本地·云可达', url: LOCAL, block: false, mode: 'oauth' },
      { name: '本地·站点预览（屏蔽云端点）', url: LOCAL, block: true, mode: 'preview' }
    ]

const clickProbe = `(async()=>{
  try{
    const btn=[...document.querySelectorAll('button,a')].find(b=>/^(登录|登录 \\/ 注册)/.test(b.textContent.trim()))||document.querySelector('#loginBtn');
    if(btn)btn.click();
    await new Promise(r=>setTimeout(r,600));
    const tab=document.querySelector('.login-tab[data-login="wechat"]');if(tab)tab.click();
    await new Promise(r=>setTimeout(r,300));
    document.getElementById('wechatLoginBtn').click();
    await new Promise(r=>setTimeout(r,4200));
    const box=document.getElementById('qrBox');
    const err=document.getElementById('loginError');
    return JSON.stringify({
      url:box?(box.dataset.qrUrl||''):'',
      hasSvg:!!document.querySelector('#qrPlaceholder svg'),
      offline:!!(window.cloud&&window.cloud.__offline),
      errHidden:err?err.hidden:null,
      errText:err?err.innerText.trim():''
    })
  }catch(e){return 'ERR:'+e.message}
})()`

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

  for (const c of cases) {
    console.log('\n【' + c.name + '】')
    await send('Network.setBlockedURLs', {
      urls: c.block ? ['*app.workbuddy.host*', '*workbuddy.cn*'] : []
    })
    const sep = c.url.includes('?') ? '&' : '?'
    await send('Page.navigate', { url: c.url + sep + 'r=' + Date.now() })
    await sleep(c.mode === 'preview' ? 9000 : 7000)
    const raw = await ev(clickProbe)
    let st
    try { st = JSON.parse(raw) } catch (e) { st = { url: '', errText: 'probe 失败: ' + raw } }
    const u = st.url || ''

    ok('生成了二维码 SVG', st.hasSvg === true)
    ok('无错误横幅', st.errHidden === true && !st.errText, st.errText)
    ok('码里有地址', u.length > 0, u)
    console.log('     码内地址: ' + (u || '(空)'))

    if (c.mode === 'preview') {
      ok('离线判定正确', st.offline === true, String(st.offline))
      ok('指向完整版站点（含 sharecode）', u.includes('sharecode='), u)
      ok('不是裸 origin / 不是 Pages 或本地域', !/^https?:\/\/[^/]+\/?$/.test(u) && !u.includes('shexiao123.github.io') && !u.includes('127.0.0.1'), u)
      ok('带 login=1 自动弹登录', u.includes('login=1'), u)
    } else {
      ok('是 OAuth 授权地址', u.includes('/oauth/authorize') && u.includes('provider=wechat'), u)
      let cb = ''
      try { cb = new URL(u).searchParams.get('callback_url') || '' } catch (e) { /* ignore */ }
      ok('回调地址已抓取', cb.length > 0, cb)
      ok('回调不是裸 origin', !/^https?:\/\/[^/]+\/?$/.test(cb), cb)
      if (c.url !== LOCAL) ok('回调保留 sharecode', cb.includes('sharecode='), cb)
      else ok('回调包含页面路径', cb.includes('index.html'), cb)
    }
  }

  // 扫码落地：?login=1 应自动弹出登录层并切到微信页签
  if (MODE === 'live') {
    console.log('\n【扫码落地 login=1】')
    await send('Network.setBlockedURLs', { urls: [] })
    await send('Page.navigate', { url: HOST + '&login=1&r=' + Date.now() })
    await sleep(7000)
    const raw = await ev(`JSON.stringify({
      modal:document.getElementById('loginModal').classList.contains('show'),
      wechatTab:(document.querySelector('.login-tab[data-login="wechat"]')||{classList:{contains:()=>false}}).classList.contains('active'),
      wechatPane:document.getElementById('paneWechat')?document.getElementById('paneWechat').hidden===false:false,
      offline:!!(window.cloud&&window.cloud.__offline)
    })`)
    let st = {}
    try { st = JSON.parse(raw) } catch (e) { /* ignore */ }
    ok('云可达（非预览）', st.offline === false, String(st.offline))
    ok('自动弹出登录层', st.modal === true)
    ok('自动切到微信页签', st.wechatTab === true && st.wechatPane === true)
  }

  console.log('\n────────────────────────')
  console.log('通过 ' + pass + ' / ' + (pass + fail) + (fail ? '  ❌ 有 ' + fail + ' 项失败' : '  ✅ 全部通过'))
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('测试异常:', e.message); process.exit(1) })
