/**
 * 小程序端通知与评价的静态校验
 * 小程序无法在浏览器直接跑（依赖 wx API），这里用模拟环境验证核心逻辑
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../miniprogram')
let failCount = 0
const fail = (m) => {
  console.log('  ✗ ' + m)
  failCount++
}

console.log('=== 宁夏云辇文化科技有限公司 · 小程序功能校验 ===')
console.log('')

// 1. 页面文件齐全
console.log('1. 页面四件套')
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
appJson.pages.forEach((p) => {
  const miss = ['.js', '.json', '.wxml', '.wxss'].filter((e) => !fs.existsSync(path.join(ROOT, p + e)))
  if (miss.length) fail(`${p} 缺 ${miss.join(',')}`)
})
console.log(`   ${appJson.pages.length} 个页面全部齐全`)

// 2. WXML 里 bindtap 绑定的方法在 JS 里都存在
console.log('')
console.log('2. 事件绑定与方法对应')
appJson.pages.forEach((p) => {
  const wxmlPath = path.join(ROOT, p + '.wxml')
  const jsPath = path.join(ROOT, p + '.js')
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) return
  const wxml = fs.readFileSync(wxmlPath, 'utf8')
  const js = fs.readFileSync(jsPath, 'utf8')
  const handlers = [...new Set([...wxml.matchAll(/(?:bind|catch)(?:tap|input|change|confirm|submit|longpress|scrolltolower|load|error|blur|focus)=\s*"([a-zA-Z_$][\w$]*)"/g)].map((m) => m[1]))]
  handlers.forEach((h) => {
    if (!new RegExp('\\b' + h + '\\s*(\\(|:)').test(js)) {
      fail(`${p}.wxml 绑定了 ${h}，但 ${p}.js 里没有这个方法`)
    }
  })
})
console.log('   绑定关系正确')

// 3. WXML 里用到的 data 字段在 JS 的 data 里都有声明
console.log('')
console.log('3. WXML 引用了未声明的 data 字段')
appJson.pages.forEach((p) => {
  const wxmlPath = path.join(ROOT, p + '.wxml')
  const jsPath = path.join(ROOT, p + '.js')
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) return
  const wxml = fs.readFileSync(wxmlPath, 'utf8')
  const js = fs.readFileSync(jsPath, 'utf8')
  // 提取 data 块
  const dm = js.match(/data:\s*\{([\s\S]*?)\n  \}/)
  if (!dm) return
  const declared = new Set([...dm[1].matchAll(/([a-zA-Z_$][\w$]*)\s*:/g)].map((m) => m[1]))

  // 收集所有 wx:for 声明的循环变量（默认 item，也可能是 wx:for-item 指定的名字）
  const loopVars = new Set(['item'])
  ;[...wxml.matchAll(/wx:for-item\s*=\s*"([\w$]+)"/g)].forEach((m) => loopVars.add(m[1]))

  // 关键：表达式里第一个标识符若是循环变量 → 整个表达式跳过（含 item.xxx 形式）
  // 若是已声明的 data 字段 → 合法
  // 若是 wx: 前缀保留字 → 跳过
  const reserved = new Set([
    'wx', 'true', 'false', 'null', 'undefined', 'this', 'length',
    'item', 'index', 'value', 'key', 'checked', 'disabled',
    'currentTarget', 'target', 'detail', 'data'
  ])

  const missing = new Set()
  ;[...wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)].forEach((m) => {
    const expr = m[1].trim()
    if (!expr) return
    // 去掉字符串字面量里的内容（'xxx' 或 "xxx"），避免把 'identity' 之类当标识符
    const code = expr.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
    if (!code) return
    // 若表达式中含任一循环变量，说明是循环作用域内的属性访问，整体跳过
    const ids = [...code.matchAll(/([a-zA-Z_$][\w$]*)/g)].map((x) => x[1])
    if (ids.some((id) => loopVars.has(id))) return

    // 关键：只校验「属性访问链的根」。如 {{stats.total}} 只查 stats，不查 total。
    // 做法：把形如 a.b.c 的链替换掉，剩下的才是独立变量。
    let roots = code
    // 替换对象/数组字面量
    roots = roots.replace(/\{[^{}]*\}/g, ' ')
    roots = roots.replace(/\[[^\[\]]*\]/g, ' ')
    // 替换点号访问链：a.b.c → a
    roots = roots.replace(/\b([a-zA-Z_$][\w$]*)(?:\s*\.\s*[a-zA-Z_$][\w$]*)+/g, (s) => s.split('.')[0].trim())
    // 剩下的是独立标识符
    const free = [...roots.matchAll(/([a-zA-Z_$][\w$]*)/g)].map((x) => x[1])
    free.forEach((id) => {
      if (!declared.has(id) && !reserved.has(id)) missing.add(id)
    })
  })
  if (missing.size) {
    fail(`${p}.wxml 用了未声明的字段: ${[...missing].join(', ')}`)
  }
})
console.log('   字段声明完整')

// 4. API 导出的函数被页面调用时确实存在
console.log('')
console.log('4. 页面调用的 API 都已导出')
const apiSrc = fs.readFileSync(path.join(ROOT, 'utils', 'api.js'), 'utf8')
const expIdx = apiSrc.lastIndexOf('module.exports')
if (expIdx < 0) {
  fail('api.js 找不到 module.exports')
} else {
  const expBlock = apiSrc.slice(expIdx)
  const exported = new Set([...expBlock.matchAll(/([a-zA-Z_$][\w$]*)\s*[,}\n]/g)].map((m) => m[1]))
  appJson.pages.forEach((p) => {
    const jsPath = path.join(ROOT, p + '.js')
    if (!fs.existsSync(jsPath)) return
    const js = fs.readFileSync(jsPath, 'utf8')
    ;[...new Set([...js.matchAll(/\bapi\.([a-zA-Z_$][\w$]*)/g)].map((m) => m[1]))].forEach((fn) => {
      if (!exported.has(fn)) fail(`${p}.js 调用了 api.${fn}，但 api.js 未导出`)
    })
  })
  console.log('   API 导出完整')
}

// 5. 导航目标存在
console.log('')
console.log('5. 跳转路径对应的页面存在')
appJson.pages.forEach((p) => {
  const jsPath = path.join(ROOT, p + '.js')
  if (!fs.existsSync(jsPath)) return
  const js = fs.readFileSync(jsPath, 'utf8')
  ;[...js.matchAll(/url:\s*[`'"]([^`'"]*)[`'"]/g)].forEach((m) => {
    const u = m[1]
    if (!u.startsWith('/pages/')) return
    const target = u.split('?')[0]
    if (!fs.existsSync(path.join(ROOT, target + '.js'))) {
      fail(`${p}.js 跳转到 ${target}，但该页面不存在`)
    }
  })
})
console.log('   跳转路径有效')

// 6. 隐私接口与清单一致性
console.log('')
console.log('6. 隐私接口声明')
const privacyFile = fs.readFileSync(path.join(ROOT, '.wbapp_NPfdYpGfbDWvkcfEnOHVJB.privacy.json'), 'utf8')
const privacy = JSON.parse(privacyFile)
const privacyKeys = privacy.map((p) => Object.keys(p)[0])
const allJs = appJson.pages
  .map((p) => path.join(ROOT, p + '.js'))
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n') + fs.readFileSync(path.join(ROOT, 'utils', 'samples.js'), 'utf8')
const sensitive = [
  { api: 'chooseMedia', key: 'ChooseMedia' },
  { api: 'chooseVideo', key: 'ChooseMedia' },
  { api: 'chooseImage', key: 'ChooseMedia' },
  { api: 'getLocation', key: 'Location' },
  { api: 'getPhoneNumber', key: 'PhoneNumber' },
  { api: 'saveImageToPhotosAlbum', key: 'Album' }
]
sensitive.forEach(({ api, key }) => {
  if (new RegExp('wx\\.' + api + '\\b').test(allJs) && !privacyKeys.includes(key)) {
    fail(`代码用了 wx.${api}，但隐私清单没声明 ${key}`)
  }
})
console.log('   隐私声明一致')

console.log('')
if (failCount === 0) {
  console.log('全部检查通过 ✓')
} else {
  console.log(`${failCount} 项未通过`)
  process.exitCode = 1
}
