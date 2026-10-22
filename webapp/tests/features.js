/**
 * 网页版功能校验
 * 检查 HTML/JS 的一致性：路由、事件绑定、API 调用、样式引用
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const WEB = ROOT
let failCount = 0
const fail = (m) => {
  console.log('  ✗ ' + m)
  failCount++
}
const ok = (m) => console.log('  ✓ ' + m)

console.log('=== 宁夏云辇文化科技有限公司 · 网页版功能校验 ===')
console.log('')

// 1. 关键文件存在
console.log('1. 文件完整性')
const required = ['index.html', 'admin.html', 'sync.html', 'js/app.js', 'js/api.js', 'js/config.js', 'js/samples.js', 'assets/style.css']
required.forEach((f) => {
  if (!fs.existsSync(path.join(WEB, f))) fail(`缺少 ${f}`)
})
ok(`${required.length} 个核心文件齐全`)

// 2. index.html 引用的脚本与样式都存在
console.log('')
console.log('2. 资源引用')
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
refs.forEach((r) => {
  if (r.startsWith('http') || r.startsWith('#') || r.startsWith('data:')) return
  const target = path.join(WEB, r.replace(/^\.?\//, ''))
  if (!fs.existsSync(target)) fail(`index.html 引用了不存在的资源: ${r}`)
})
ok('本地资源引用有效')

// 3. API 导出与调用一致
console.log('')
console.log('3. API 导出与调用')
const apiSrc = fs.readFileSync(path.join(WEB, 'js', 'api.js'), 'utf8')
const apiIdx = apiSrc.lastIndexOf('window.API')
const apiBlock = apiSrc.slice(apiIdx)
const exported = new Set([...apiBlock.matchAll(/([a-zA-Z_$][\w$]*)\s*[,}\n]/g)].map((m) => m[1]))
// 必须同时扫 app.js 和 admin.js —— 管理端也是 API 消费者，
// 只扫 app.js 会漏掉「API.xxx is not a function」这类线上才暴露的错误
const appSrc = fs.readFileSync(path.join(WEB, 'js', 'app.js'), 'utf8')
const adminSrc = fs.readFileSync(path.join(WEB, 'js', 'admin.js'), 'utf8')
const called = new Set()
const calledBy = new Map()
for (const [file, src] of [['app.js', appSrc], ['admin.js', adminSrc]]) {
  for (const m of src.matchAll(/\bAPI\.([a-zA-Z_$][\w$]*)/g)) {
    called.add(m[1])
    if (!calledBy.has(m[1])) calledBy.set(m[1], new Set())
    calledBy.get(m[1]).add(file)
  }
}
called.forEach((fn) => {
  if (!exported.has(fn)) {
    const where = [...calledBy.get(fn)].join(' / ')
    fail(`${where} 调用了 API.${fn}，但 api.js 未导出`)
  }
})
ok(`${called.size} 个 API 调用（app.js + admin.js）全部有定义`)

// 4. 路由：VIEWS/BINDINGS 与导航链接对应
console.log('')
console.log('4. 路由完整性')
const views = new Set([...appSrc.matchAll(/VIEWS\.([a-zA-Z_$][\w$]*)\s*=/g)].map((m) => m[1]))
const bindings = new Set([...appSrc.matchAll(/BINDINGS\.([a-zA-Z_$][\w$]*)\s*=/g)].map((m) => m[1]))
const navRoutes = new Set(
  [...html.matchAll(/data-route="([a-zA-Z_$][\w$]*)"/g)].map((m) => m[1])
)
navRoutes.forEach((r) => {
  if (!views.has(r)) fail(`导航指向 ${r}，但 VIEWS.${r} 不存在`)
})
// BINDINGS 有但 VIEWS 没有的也算问题
bindings.forEach((b) => {
  if (!views.has(b)) fail(`BINDINGS.${b} 存在但没有对应的 VIEWS.${b}`)
})
ok(`${navRoutes.size} 个导航路由、${views.size} 个视图`)

// 5. HTML 里的 id 与 JS 里的选择器对应
console.log('')
console.log('5. DOM 绑定')
// 静态 HTML + JS 模板字符串里生成的 id 都要算
const htmlIds = new Set([...html.matchAll(/id="([a-zA-Z_$][\w$]*)"/g)].map((m) => m[1]))
;[
  ...appSrc.matchAll(/id="([a-zA-Z_$][\w$]*)"/g)
].forEach((m) => htmlIds.add(m[1]))
const jsSelectors = [...appSrc.matchAll(/\$\('#([a-zA-Z_$][\w$]*)'\)/g)].map((m) => m[1])
const missingIds = [...new Set(jsSelectors)].filter((id) => !htmlIds.has(id))
missingIds.forEach((id) => fail(`app.js 引用了 #${id}，但 HTML 里没有这个元素`))
ok(`${new Set(jsSelectors).size} 个 DOM 引用全部有对应元素`)

// 6. 事件处理：addEventListener 绑定的具名函数必须存在
console.log('')
console.log('6. 事件处理')
const jsFiles = ['app.js', 'api.js', 'config.js', 'samples.js']
const allJs = jsFiles.map((f) => fs.readFileSync(path.join(WEB, 'js', f), 'utf8')).join('\n')
const boundFns = new Set(
  [...allJs.matchAll(/addEventListener\(\s*'[a-z]+'\s*,\s*([a-zA-Z_$][\w$]*)\s*\)/g)].map((m) => m[1])
)
const definedFns = new Set([
  ...[...allJs.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)].map((m) => m[1]),
  ...[...allJs.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g)].map((m) => m[1])
])
const undefinedFns = [...boundFns].filter((f) => !definedFns.has(f))
undefinedFns.forEach((f) => fail(`事件绑定了 ${f}，但没有对应的函数定义`))
ok(`${boundFns.size} 个事件处理函数全部存在`)

// 7. CSS 类在 HTML/JS 中被使用（检测拼写错误）
console.log('')
console.log('7. 样式类引用')
// 必须同时读 style.css 和 admin.css —— 管理端页面用 admin.css，
// 只扫 style.css 会把 .data / .td-strong 这类误报为「未定义」
const cssFiles = ['style.css', 'admin.css']
  .map((f) => path.join(WEB, 'assets', f))
  .filter((f) => fs.existsSync(f))
const css = cssFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
// 只取合法的 CSS 类名（字母开头，允许 - 和 _）
const cssClasses = new Set([...css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]))
const collectClasses = (src) => {
  const set = new Set()
  // class="a b c"
  ;[...src.matchAll(/class="([^"]*)"/g)].forEach((m) => {
    m[1].split(/\s+/).forEach((c) => {
      if (/^-?[A-Za-z_][\w-]*$/.test(c)) set.add(c)
    })
  })
  // classList.add('x') / classList.toggle('x')
  ;[...src.matchAll(/classList\.(?:add|toggle|remove)\(\s*'([^']+)'/g)].forEach((m) => {
    if (/^-?[A-Za-z_][\w-]*$/.test(m[1])) set.add(m[1])
  })
  return set
}
const usedClasses = new Set([...collectClasses(html), ...collectClasses(appSrc)])
const undefinedClasses = [...usedClasses].filter((c) => !cssClasses.has(c))
if (undefinedClasses.length) {
  undefinedClasses.forEach((c) => fail(`类 .${c} 被使用但 CSS 里没有定义`))
}
ok(`${usedClasses.size} 个类引用全部有样式定义`)

// 8. 隐私/安全：不得有明文密钥
console.log('')
console.log('8. 配置安全')
const configSrc = fs.readFileSync(path.join(WEB, 'js', 'config.js'), 'utf8')
if (/secretKey|privateKey|adminPassword|apiSecret/i.test(configSrc)) {
  fail('config.js 里疑似有明文密钥')
}
ok('无明文密钥')

console.log('')
if (failCount === 0) {
  console.log('全部检查通过 ✓')
} else {
  console.log(`${failCount} 项未通过`)
  process.exitCode = 1
}
