#!/usr/bin/env node
/**
 * 同步网页端到 docs/ 目录
 *
 * GitHub Pages 的 legacy 模式只支持从 / 或 /docs 发布，
 * 不能指向任意子目录。所以把 webapp/ 的内容镜像到 docs/。
 *
 * 用法：
 *   node tools/sync-pages.js          同步并报告
 *   node tools/sync-pages.js --check  只检查是否一致（不写入）
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'webapp')
const DST = path.join(ROOT, 'docs')

// docs/ 里不需要的目录（测试脚本不进站点）
const SKIP_DIRS = new Set(['tests'])

// 复制时保留的文件
function copyDir(src, dst, skip) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    if (skip && skip.has(name)) continue
    const s = path.join(src, name)
    const d = path.join(dst, name)
    const st = fs.statSync(s)
    if (st.isDirectory()) {
      copyDir(s, d, skip)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

/** 清掉 docs/ 里源目录已不存在的文件 */
function prune(dst, src, skip) {
  if (!fs.existsSync(dst)) return []
  const removed = []
  for (const name of fs.readdirSync(dst)) {
    if (skip && skip.has(name)) continue
    const d = path.join(dst, name)
    const s = path.join(src, name)
    if (!fs.existsSync(s)) {
      fs.rmSync(d, { recursive: true, force: true })
      removed.push(name)
    } else if (fs.statSync(d).isDirectory()) {
      removed.push(...prune(d, s, skip).map((x) => name + '/' + x))
    }
  }
  return removed
}

function listFiles(dir, base = '') {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const rel = base ? base + '/' + name : name
    if (fs.statSync(p).isDirectory()) out.push(...listFiles(p, rel))
    else out.push(rel)
  }
  return out
}

const checkOnly = process.argv.includes('--check')

// 1. 检查差异
const srcFiles = listFiles(SRC).filter((f) => !f.startsWith('tests/'))
const dstFiles = listFiles(DST).filter((f) => !f.startsWith('tests/'))

const changed = []
for (const f of srcFiles) {
  const s = path.join(SRC, f)
  const d = path.join(DST, f)
  if (!fs.existsSync(d)) { changed.push(['新增', f]); continue }
  if (fs.statSync(s).size !== fs.statSync(d).size) changed.push(['修改', f])
}
const extra = dstFiles.filter((f) => !fs.existsSync(path.join(SRC, f)))

if (checkOnly) {
  if (changed.length || extra.length) {
    console.log('docs/ 与 webapp/ 不一致：')
    changed.forEach(([k, f]) => console.log(`  ${k}: ${f}`))
    extra.forEach((f) => console.log(`  多余: ${f}`))
    process.exit(1)
  }
  console.log('docs/ 与 webapp/ 一致 ✓')
  process.exit(0)
}

// 2. 同步
copyDir(SRC, DST, SKIP_DIRS)
const removed = prune(DST, SRC, SKIP_DIRS)

// 3. 报告
const total = listFiles(DST).filter((f) => !f.startsWith('tests/')).length
console.log(`已同步 webapp/ → docs/（${total} 个文件）`)
if (changed.length) {
  console.log(`  变更 ${changed.length} 项：`)
  changed.slice(0, 10).forEach(([k, f]) => console.log(`    ${k}: ${f}`))
  if (changed.length > 10) console.log(`    …还有 ${changed.length - 10} 项`)
}
if (removed.length) console.log(`  清理 ${removed.length} 项：${removed.join(', ')}`)
