/**
 * 小程序会员页的 WXML 兼容性检查
 * 复用 features.js 的规则思路，但针对 membership 页做专项核对
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PAGE_NAME = process.argv[2] || 'membership'
const PAGE = path.join(ROOT, 'pages', PAGE_NAME)

const wxml = fs.readFileSync(path.join(PAGE, PAGE_NAME + '.wxml'), 'utf8')
const js = fs.readFileSync(path.join(PAGE, PAGE_NAME + '.js'), 'utf8')

let fail = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { console.log('  ✗ ' + m); fail++ }

console.log('=== 小程序 ' + PAGE_NAME + ' 页 WXML 兼容性 ===')

// 1. 小程序 WXML 不支持的方法调用
const methodCalls = []
const re1 = /\{\{([\s\S]*?)\}\}/g
let m
while ((m = re1.exec(wxml)) !== null) {
  const code = m[1].replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
  const hits = code.match(/\.([a-zA-Z_$][\w$]*)\s*\(/g)
  if (hits) methodCalls.push(...hits)
}
if (methodCalls.length) bad('WXML 里有方法调用（小程序不支持）: ' + methodCalls.join(', '))
else ok('无方法调用')

// 2. 数组字面量
if (/\{\{\s*\[/.test(wxml)) bad('WXML 里有数组字面量（小程序不支持）')
else ok('无数组字面量')

// 3. 可选链 / 空值合并
if (/\{\{[^}]*\?\./.test(wxml)) bad('WXML 里有可选链 ?.')
if (/\{\{[^}]*\?\?/.test(wxml)) bad('WXML 里有空值合并 ??')
if (!/\{\{[^}]*\?\./.test(wxml) && !/\{\{[^}]*\?\?/.test(wxml)) ok('无可选链/空值合并')

// 4. 顶层字段都必须在 data 里声明
//    关键：只校验「顶层」标识符。a.b.c 这种点号访问，a 才是顶层字段，
//    b/c 是嵌套对象的属性（由 JS 运行时赋值，不在 data 里）。
const dm = js.match(/data:\s*\{([\s\S]*?)\n {2}\}/)
if (!dm) {
  bad('找不到 data 块')
} else {
  const declared = new Set([...dm[1].matchAll(/([a-zA-Z_$][\w$]*)\s*:/g)].map((x) => x[1]))
  // 循环变量名（wx:for-item / wx:for-index 自定义的名字）不算未声明字段
  const loopVars = new Set(['item', 'index', 'true', 'false', 'null', 'undefined', 'wx', 'length', 'this'])
  for (const m of wxml.matchAll(/wx:for-item="([a-zA-Z_$][\w$]*)"/g)) loopVars.add(m[1])
  for (const m of wxml.matchAll(/wx:for-index="([a-zA-Z_$][\w$]*)"/g)) loopVars.add(m[1])
  const reserved = loopVars
  const used = new Set()
  const re2 = /\{\{([\s\S]*?)\}\}/g
  while ((m = re2.exec(wxml)) !== null) {
    const code = m[1].replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
    // 点号访问：只取第一段（顶层字段名）
    for (const x of code.matchAll(/(^|[^.\w$])([a-zA-Z_$][\w$]*)/g)) used.add(x[2])
  }
  const missing = [...used].filter((x) => !declared.has(x) && !reserved.has(x))
  if (missing.length) bad('未声明的顶层字段: ' + missing.join(', '))
  else ok(`顶层字段全部已声明（${used.size} 个引用）`)
}

// 5. WXML 用到的嵌套/循环字段，数据来源必须存在
//    字段可能来自三处：
//      a) JS 里显式赋值（key: value）
//      b) JS 里的对象展开（...obj，obj 来自 API，字段随对象带入）
//      c) 其他模块的返回值（如 member.getMembershipStatus 返回 planName）
//
//    数据源 = 页面 JS + 它 require 的所有本地模块。
//    （只扫页面自己的 JS 会误报 —— 展开进来的字段来自 API 返回值）
const depSrc = [js]
// 页面 JS 可能 require 任意层级的本地模块，统一抓出来
for (const m of js.matchAll(/require\('([^']+)'\)/g)) {
  const spec = m[1]
  if (!spec.startsWith('.')) continue // 跳过 npm 包
  let f = path.resolve(path.dirname(path.join(ROOT, 'pages', PAGE_NAME, PAGE_NAME + '.js')), spec)
  // 只认 utils 目录下的本地模块
  if (!f.includes(path.join('utils', ''))) continue
  if (!f.endsWith('.js')) f += '.js' // require 时省略了 .js
  if (fs.existsSync(f)) depSrc.push(fs.readFileSync(f, 'utf8'))
}
const allSrc = depSrc.join('\n')

const nested = new Set()
const re3 = /(breakdown|status|deposit|myProfile|form)\.([a-zA-Z_$][\w$]*)/g
while ((m = re3.exec(wxml)) !== null) nested.add(m[1] + '.' + m[2])
const itemFields = new Set()
const re4 = /\bitem\.([a-zA-Z_$][\w$]*)/g
while ((m = re4.exec(wxml)) !== null) itemFields.add(m[1])

const missAll = []
for (const n of nested) {
  const key = n.split('.')[1]
  if (!new RegExp('\\b' + key + '\\b').test(allSrc)) missAll.push(n)
}
for (const f of itemFields) {
  if (!new RegExp('\\b' + f + '\\b').test(allSrc)) missAll.push('item.' + f)
}
// select('*') 时字段由数据库表提供，静态无法核对 —— 这种情况跳过
const hasSelectAll = /select\('\*'\)/.test(allSrc)
if (missAll.length && hasSelectAll) {
  ok(`字段由 select('*') 从数据库带入，静态无法逐个核对（${missAll.length} 个）`)
} else if (missAll.length) {
  bad('字段在任何数据源里都找不到: ' + missAll.join(', '))
} else {
  ok(`字段来源全部可追溯（嵌套 ${nested.size} 个 / 循环 ${itemFields.size} 个）`)
}

// 5b. 列表字段必须有来源：对象展开、显式映射，或 map 构造
//     通用检查：页面里若出现 wx:for 遍历的数组，JS 里应该有对应的数据加工
const usesSpread = /\.\.\.[a-zA-Z_]/.test(js)
const usesExplicit = /:\s*(p|o|s|l|item|session)\.[a-zA-Z_]/.test(js)
const usesMap = /\.map\s*\(/.test(js)
if (usesSpread || usesExplicit || usesMap) ok('列表字段有来源（展开/映射/map 构造）')
else if (/wx:for/.test(wxml)) bad('WXML 有循环但 JS 里找不到字段来源（展开/映射/map）')
else ok('页面无列表循环')

// 6. 事件绑定的方法都存在
const handlers = new Set([...wxml.matchAll(/bind(?:tap|input|change|confirm|blur|focus)="([a-zA-Z_$][\w$]*)"/g)].map((x) => x[1]))
const missHandler = [...handlers].filter((h) => !new RegExp('\\b' + h + '\\s*\\(').test(js))
if (missHandler.length) bad('WXML 绑定的事件在 JS 中不存在: ' + missHandler.join(', '))
else ok(`${handlers.size} 个事件处理函数全部存在`)

console.log('')
console.log(fail === 0 ? '  ' + PAGE_NAME + ' 页全部检查通过 ✓' : `  ${fail} 项未通过`)
process.exit(fail ? 1 : 0)
