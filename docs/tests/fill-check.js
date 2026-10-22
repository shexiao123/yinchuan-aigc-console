/**
 * 铺满检查
 *
 * 验证网页端在各种屏幕宽度下：
 *   1. 内容容器占满视口宽度（不留白边）
 *   2. 网格内容右侧无空轨道（真正填满，不只是容器满）
 *   3. 无横向溢出
 *
 * 用法：node tests/fill-check.js [--browser]
 */
const fs = require('fs')
const path = require('path')

const WEB = path.resolve(__dirname, '..')

// ---------- 静态检查（不需要浏览器）----------
console.log('=== 铺满规则静态检查 ===')
let fail = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { console.log('  ✗ ' + m); fail++ }

const css = fs.readFileSync(path.join(WEB, 'assets', 'style.css'), 'utf8')
const gridJs = fs.readFileSync(path.join(WEB, 'js', 'adaptive-grid.js'), 'utf8')
const appJs = fs.readFileSync(path.join(WEB, 'js', 'app.js'), 'utf8')
const adminJs = fs.readFileSync(path.join(WEB, 'js', 'admin.js'), 'utf8')
const indexHtml = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
const adminHtml = fs.readFileSync(path.join(WEB, 'admin.html'), 'utf8')

// 1. --max 必须是 100%（不设固定上限）
if (/--max:\s*100%/.test(css)) ok('--max 为 100%，容器不设固定宽度上限')
else bad('--max 未设为 100%，容器仍有限宽')

// 2. 容器不能再有 margin: 0 auto 居中导致的留白 —— 100% 时居中无影响，但 padding 必须有
const appRule = css.match(/\.app \{[^}]*\}/)
if (appRule && /padding:\s*0 var\(--pad\)/.test(appRule[0])) ok('.app 使用 --pad 内边距')
else bad('.app 未使用 --pad，内边距可能为 0 导致贴边')

// 3. 不得再有 px 单位的 max-width 限制「布局容器」
//    只看真正撑内容宽度的容器类：
//      .app / .topbar-inner / .footer-inner / 各种 *-grid / .dash / .detail-* / .order-layout
//    文本截断、弹窗、视频层这些是内容级限宽，不影响铺满，不算问题
const LAYOUT_CONTAINERS = [
  'app', 'topbar-inner', 'footer-inner', 'dash', 'detail-grid', 'detail-hero',
  'order-layout', 'cat-grid', 'svc-grid', 'prov-grid', 'hall-grid', 'stat-grid',
  'sample-grid', 'mem-plans', 'mem-banner'
]
const badLimits = []
for (const cls of LAYOUT_CONTAINERS) {
  // 匹配 .cls { ... } 整块，检查里面有没有 max-width: Npx
  const re = new RegExp('\\.' + cls.replace(/-/g, '\\-') + '\\s*\\{[^}]*\\}', 'g')
  let m
  while ((m = re.exec(css)) !== null) {
    const mm = m[0].match(/max-width:\s*(\d+)px/)
    if (mm) badLimits.push('.' + cls + ' → ' + mm[0])
  }
}
if (!badLimits.length) ok('布局容器无像素级限宽')
else bad('布局容器仍有限宽: ' + badLimits.join('; '))

// 4. 自适应网格脚本必须被引入
if (indexHtml.includes('adaptive-grid.js')) ok('index.html 引入了 adaptive-grid.js')
else bad('index.html 未引入 adaptive-grid.js')
if (adminHtml.includes('adaptive-grid.js')) ok('admin.html 引入了 adaptive-grid.js')
else bad('admin.html 未引入 adaptive-grid.js')

// 5. 两端 render 后都要调用 fitAll
if (appJs.includes('AdaptiveGrid.fitAll(app)')) ok('用户端 render 后调用 fitAll')
else bad('用户端 render 未调用 fitAll')
if (adminJs.includes('AdaptiveGrid.fitAll(content)')) ok('管理端 render 后调用 fitAll')
else bad('管理端 render 未调用 fitAll')

// 6. 两端都要监听 resize
if (appJs.includes("addEventListener('resize'")) ok('用户端监听 resize')
else bad('用户端未监听 resize')
if (adminJs.includes("addEventListener('resize'")) ok('管理端监听 resize')
else bad('管理端未监听 resize')

// 7. 列数计算必须以项数为上限（否则空轨道）
if (/byCount/.test(gridJs) && /Math\.min\(byMin, byCount\)/.test(gridJs)) {
  ok('列数计算以项数为上限（不产生空轨道）')
} else {
  bad('列数计算未以项数为上限，会出现空轨道')
}

// 8. calcColumns 的关键分支都要有
const branchCases = [
  ['if (!itemCount || containerWidth <= 0) return 1', '空数据兜底'],
  ['byMin', '最小宽度约束'],
  ['byIdeal', '理想宽度约束']
]
branchCases.forEach(([code, label]) => {
  if (gridJs.includes(code)) ok('列数计算含「' + label + '」')
  else bad('列数计算缺「' + label + '」')
})

console.log('')
console.log(fail === 0 ? '  静态检查全部通过 ✓' : `  ${fail} 项未通过`)

// ---------- 浏览器检查（可选）----------
if (process.argv.includes('--browser')) {
  // puppeteer-core 装在受管 node workspace 里，从那里 require
  const WORKSPACE = 'C:/Users/12/.workbuddy/binaries/node/workspace/node_modules'
  const puppeteer = require(path.join(WORKSPACE, 'puppeteer-core'))
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const BASE = process.env.WEB_BASE || 'http://127.0.0.1:8899'
  const ROUTES = ['#/', '#/services', '#/hall', '#/studio', '#/membership', '#/orders', '#/profile']
  const WIDTHS = [2560, 1920, 1600, 1440, 1280, 1100, 900, 768, 480, 375]

  ;(async () => {
    console.log('')
    console.log('=== 铺满浏览器检查 ===')
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
    const page = await browser.newPage()
    let bfail = 0

    for (const route of ROUTES) {
      const row = []
      for (const w of WIDTHS) {
        try {
          await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 })
          await page.goto(BASE + '/index.html' + route, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForFunction(
            () => window.cloud && window.API && window.AdaptiveGrid,
            { timeout: 25000, polling: 300 }
          )
          await new Promise((r) => setTimeout(r, 900))
        } catch (e) {
          row.push(w + ':加载失败')
          bfail++
          continue
        }
        const m = await page.evaluate(() => {
          const app = document.querySelector('.app')
          if (!app) return null
          const ar = app.getBoundingClientRect()
          let blank = 0
          document.querySelectorAll('.cat-grid, .svc-grid, .prov-grid, .hall-grid, .stat-grid, .sample-grid').forEach((x) => {
            if (!x.children.length) return
            const gr = x.getBoundingClientRect()
            let last = 0
            for (let i = 0; i < x.children.length; i++) {
              const b = x.children[i].getBoundingClientRect()
              if (b.right > last) last = b.right
            }
            const bl = Math.round(gr.right - last)
            if (bl > blank) blank = bl
          })
          return {
            used: Math.round((ar.width / window.innerWidth) * 100),
            blank,
            ox: document.documentElement.scrollWidth > window.innerWidth
          }
        })
        if (!m) { row.push(w + ':?'); continue }
        const bad2 = m.ox || m.blank > 4 || m.used < 99
        if (bad2) bfail++
        row.push(w + ':' + (m.blank > 4 ? '空' + m.blank : m.ox ? '溢' : m.used + '%'))
      }
      console.log('  ' + route.padEnd(14) + row.join('  '))
    }
    await browser.close()
    console.log('')
    console.log(bfail === 0 ? '  全部铺满无白边 ✓' : `  ${bfail} 处有问题`)
    process.exit(fail + bfail ? 1 : 0)
  })()
} else {
  process.exit(fail ? 1 : 0)
}
