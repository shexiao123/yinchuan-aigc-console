/**
 * 全局命令面板真浏览器 E2E
 * 前置：Chrome 已带 --remote-debugging-port=9222 启动并打开本地 8899 首页。
 * 覆盖：Ctrl+K 唤起、索引聚合、输入过滤、匹配高亮、回车跳转、Esc 关闭。
 */
const http = require('http')
const WebSocket = require('ws')

const PORT = process.env.CDP_PORT || 9222
const URL = process.env.E2E_URL || 'http://127.0.0.1:8899/index.html'

const getJson = (path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
    let buf = ''
    res.on('data', (d) => { buf += d })
    res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (e) { reject(e) } })
  }).on('error', reject)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')) }
}

async function main() {
  console.log('=== 全局命令面板 · 真浏览器 E2E ===\n')
  let targets
  for (let i = 0; i < 20; i++) {
    try { targets = await getJson('/json'); break } catch (e) { await sleep(300) }
  }
  if (!targets) throw new Error('无法连接 Chrome DevTools (' + PORT + ')')
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('没有可用的 page target')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })

  let seq = 0
  const pending = new Map()
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw))
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
  })
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: URL })
  await sleep(4500)

  console.log('1. 脚本与首屏')
  ok('SmartEngine 已挂载', await evaluate('typeof window.SmartEngine === "object"'))
  ok('CommandPalette 已挂载', await evaluate('!!window.CommandPalette && typeof window.CommandPalette.open === "function"'))
  ok('顶栏搜索按钮存在', await evaluate('!!document.getElementById("cmdBtn")'))
  ok('首页渲染出智能工作台入口', await evaluate('!!document.querySelector(".smart-entry")'))
  ok('首屏不是故障页', await evaluate('!document.body.textContent.includes("页面加载失败")'))

  console.log('\n2. Ctrl+K 唤起')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 })
  await sleep(1600)
  const opened = await evaluate('(() => { const o=document.querySelector(".cmd-overlay"); return { exists: !!o, visible: !!o && !o.hidden, rows: document.querySelectorAll(".cmd-row").length, groups: [...document.querySelectorAll(".cmd-group")].map(e=>e.textContent), focused: document.activeElement && document.activeElement.id === "cmdInput" } })()')
  ok('面板已打开', opened.exists && opened.visible)
  ok('输入框自动聚焦', opened.focused)
  ok('默认列出结果', opened.rows > 0, 'rows=' + opened.rows)
  ok('结果含功能页分组', (opened.groups || []).includes('功能页'))
  ok('已索引云端/快照数据（含服务或品类）',
    (opened.groups || []).some((g) => ['在架服务', '服务品类', '商家任务'].includes(g)),
    (opened.groups || []).join('/'))

  console.log('\n3. 输入过滤与高亮')
  const filtered = await evaluate('(() => { const i=document.getElementById("cmdInput"); i.value="婚礼"; i.dispatchEvent(new Event("input",{bubbles:true})); return { rows: document.querySelectorAll(".cmd-row").length, marks: document.querySelectorAll(".cmd-mark").length, titles: [...document.querySelectorAll(".cmd-row-title")].slice(0,5).map(e=>e.textContent) } })()')
  ok('过滤后仍有结果', filtered.rows > 0, 'rows=' + filtered.rows)
  ok('过滤结果数量收敛', filtered.rows < opened.rows, filtered.rows + ' < ' + opened.rows)
  ok('匹配片段已高亮', filtered.marks > 0, 'marks=' + filtered.marks)
  ok('结果标题与关键词相关', (filtered.titles || []).some((t) => /婚礼|微电影/.test(t)), (filtered.titles || []).join(' | '))

  console.log('\n4. 键盘导航与回车跳转')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 })
  const active = await evaluate('(() => { const rows=[...document.querySelectorAll(".cmd-row")]; return { idx: rows.findIndex(r=>r.classList.contains("is-active")), total: rows.length } })()')
  ok('↓ 移动到第二项', active.idx === 1, 'idx=' + active.idx)
  const beforeHash = await evaluate('location.hash')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await sleep(900)
  const after = await evaluate('(() => { const o=document.querySelector(".cmd-overlay"); return { hash: location.hash, closed: !!o && o.hidden } })()')
  ok('回车后面板关闭', after.closed)
  ok('回车跳转到目标页', after.hash !== beforeHash || /service|smart|hall|tasks/.test(after.hash), beforeHash + ' → ' + after.hash)

  console.log('\n5. Esc 关闭')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 })
  await sleep(300)
  const reopened = await evaluate('(() => { const o=document.querySelector(".cmd-overlay"); return !!o && !o.hidden })()')
  ok('可再次唤起', reopened)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(200)
  ok('Esc 关闭面板', await evaluate('(() => { const o=document.querySelector(".cmd-overlay"); return !!o && o.hidden })()'))

  ws.close()
  console.log('\n' + (fail === 0 ? `全部通过 ✓ (${pass} 项)` : `${fail} 项未通过 / ${pass} 项通过`))
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('E2E 失败: ' + e.message); process.exit(1) })
