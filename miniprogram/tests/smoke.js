/**
 * 小程序工程静态自检
 * 运行：node tests/smoke.js
 * 检查项：app.json 页面清单、每个页面的 wxml/js/json 是否齐全、
 *         tabBar 指向的页面是否存在、lazyCodeLoading 是否开启、
 *         WXML 中引用的页面路径是否真实存在。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const problems = []
const notes = []

function fail(msg) {
  problems.push(msg)
}

// 1. 页面清单完整
;(appJson.pages || []).forEach((page) => {
  const base = path.join(ROOT, page)
  ;['.wxml', '.js', '.json'].forEach((ext) => {
    if (!fs.existsSync(base + ext)) {
      fail(`页面 ${page} 缺少 ${ext} 文件`)
    }
  })
})
notes.push(`pages 清单共 ${(appJson.pages || []).length} 个页面`)

// 2. tabBar 指向存在
;(appJson.tabBar?.list || []).forEach((tab) => {
  if (!(appJson.pages || []).includes(tab.pagePath)) {
    fail(`tabBar 条目 ${tab.pagePath} 未在 pages 清单中`)
  }
  if (tab.iconPath && !fs.existsSync(path.join(ROOT, tab.iconPath))) {
    fail(`tabBar ${tab.pagePath} 的 iconPath 指向不存在的文件：${tab.iconPath}`)
  }
})
notes.push(`tabBar 共 ${(appJson.tabBar?.list || []).length} 个入口`)

// 3. lazyCodeLoading 必开
if (appJson.lazyCodeLoading !== 'requiredComponents') {
  fail(`app.json 缺少 "lazyCodeLoading": "requiredComponents"`)
} else {
  notes.push('lazyCodeLoading 已开启')
}

// 4. miniprogramRoot 与 app.json 同目录
const projectJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
if (projectJson.miniprogramRoot !== './') {
  fail(`project.config.json 的 miniprogramRoot 应为 "./"，当前为 ${projectJson.miniprogramRoot}`)
}
if (!fs.existsSync(path.join(ROOT, 'app.json'))) {
  fail('app.json 必须与 project.config.json 同目录')
}

// 5. WXML 里的页面跳转路径是否存在
const navRe = /url=["'`]([^"'`]+)["'`]/g
;(appJson.pages || []).forEach((page) => {
  const wxmlPath = path.join(ROOT, page + '.wxml')
  if (!fs.existsSync(wxmlPath)) return
  const src = fs.readFileSync(wxmlPath, 'utf8')
  let m
  while ((m = navRe.exec(src)) !== null) {
    const url = m[1]
    if (!url.startsWith('/pages/')) continue
    const target = url.split('?')[0]
    if (!(appJson.pages || []).includes(target)) {
      fail(`${page}.wxml 跳转到未注册页面 ${target}`)
    }
  }
})
notes.push('WXML 页面跳转路径已核对')

// 6. 禁止出现的小程序不兼容写法
const forbidden = [
  { pattern: /\?\./, label: '可选链 ?.（WXML 不支持）' },
  { pattern: /\?\?/, label: '空值合并 ??（WXML 不支持）' },
  // WXML 表达式里不支持调用 JS 方法
  {
    pattern: /\{\{[^}]*\.(indexOf|includes|map|filter|find|some|every|reduce|startsWith|endsWith)\s*\(/,
    label: 'WXML 中调用数组/字符串方法（不支持，应在 JS 里预先算好）'
  },
  // WXML 表达式里不支持数组/对象字面量
  { pattern: /\{\{\s*\[/, label: 'WXML 中的数组字面量（不支持，应在 data 里预置）' },
  { pattern: /\{\{\s*\{/, label: 'WXML 中的对象字面量（不支持，应在 data 里预置）' }
]
;(appJson.pages || []).forEach((page) => {
  const wxmlPath = path.join(ROOT, page + '.wxml')
  if (!fs.existsSync(wxmlPath)) return
  const src = fs.readFileSync(wxmlPath, 'utf8')
  forbidden.forEach(({ pattern, label }) => {
    if (pattern.test(src)) {
      fail(`${page}.wxml 出现 ${label}`)
    }
  })
})
notes.push('WXML 表达式兼容性已核对')

// 7. 云客户端必须带 endpoint 与 publishableKey
const cloudSrc = fs.readFileSync(path.join(ROOT, 'utils', 'cloud.js'), 'utf8')
if (!cloudSrc.includes('endpoint:')) fail('utils/cloud.js 缺少 endpoint')
if (!cloudSrc.includes('publishableKey:')) fail('utils/cloud.js 缺少 publishableKey')
if (!cloudSrc.includes('createMiniProgramWorkBuddyCloud')) {
  fail('utils/cloud.js 必须使用 createMiniProgramWorkBuddyCloud 工厂')
}
if (!cloudSrc.includes('workbuddy-cloud-diagnostics')) {
  fail('utils/cloud.js 缺少云请求诊断助手')
}
notes.push('云客户端配置已核对')

// 8. 每个页面目录不应有 html/vue/jsx/css
;(appJson.pages || []).forEach((page) => {
  ;['.html', '.vue', '.jsx', '.css'].forEach((ext) => {
    if (fs.existsSync(path.join(ROOT, page + ext))) {
      fail(`小程序内不应存在 ${page}${ext}`)
    }
  })
})

console.log('=== 宁夏云辇文化科技有限公司 · 小程序工程自检 ===')
notes.forEach((n) => console.log('  · ' + n))
console.log('')
if (problems.length) {
  console.log('发现 ' + problems.length + ' 个问题：')
  problems.forEach((p) => console.log('  ✗ ' + p))
  process.exit(1)
}
console.log('全部检查通过。')
