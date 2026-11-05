#!/usr/bin/env node
/**
 * 同步网页端到 docs/ 目录
 *
 * GitHub Pages 的 legacy 模式只支持从 / 或 /docs 发布，
 * 不能指向任意子目录。所以把 webapp/ 的内容镜像到 docs/。
 *
 * 关键：只管理「本脚本同步过去的文件」，不碰 docs/ 里的其他文件
 * （比如放进去的说明截图、README 等）。用 .sync-manifest 记录清单。
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
const MANIFEST = path.join(DST, '.sync-manifest')

// docs/ 里不需要的目录（测试脚本不进站点）
const SKIP_DIRS = new Set(['tests'])

// ---- 清单读写 ----
function readManifest() {
  if (!fs.existsSync(MANIFEST)) return []
  return fs
    .readFileSync(MANIFEST, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function writeManifest(files) {
  fs.writeFileSync(MANIFEST, files.join('\n') + '\n', 'utf8')
}

// ---- 复制 ----
function copyDir(src, dst, skip) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
  const copied = []
  for (const name of fs.readdirSync(src)) {
    if (skip && skip.has(name)) continue
    const s = path.join(src, name)
    const d = path.join(dst, name)
    if (fs.statSync(s).isDirectory()) {
      copied.push(...copyDir(s, d, skip))
    } else {
      fs.copyFileSync(s, d)
      copied.push(path.relative(dst, d).split(path.sep).join('/'))
    }
  }
  return copied
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

/** 删除清单里记录、但源目录已没有的文件（只删自己同步的） */
function removeStale(manifest, current) {
  const removed = []
  for (const rel of manifest) {
    if (current.includes(rel)) continue
    const p = path.join(DST, rel)
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true })
      removed.push(rel)
    }
  }
  // 清掉空目录
  for (const rel of [...manifest]) {
    if (current.includes(rel)) continue
    const dir = path.dirname(path.join(DST, rel))
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
    } catch (e) {
      /* 忽略 */
    }
  }
  return removed
}

const checkOnly = process.argv.includes('--check')

// 1. 计算差异
const srcFiles = listFiles(SRC).filter((f) => !f.startsWith('tests/'))
const dstFiles = listFiles(DST).filter(
  (f) => !f.startsWith('tests/') && f !== '.sync-manifest'
)

const changed = []
for (const f of srcFiles) {
  const s = path.join(SRC, f)
  const d = path.join(DST, f)
  if (!fs.existsSync(d)) {
    changed.push(['新增', f])
    continue
  }
  if (fs.statSync(s).size !== fs.statSync(d).size) changed.push(['修改', f])
}

if (checkOnly) {
  // 只校验：镜像的每个文件都要存在且大小一致
  const missing = srcFiles.filter(
    (f) => !fs.existsSync(path.join(DST, f)) || fs.statSync(path.join(SRC, f)).size !== fs.statSync(path.join(DST, f)).size
  )
  if (missing.length) {
    console.log('docs/ 与 webapp/ 不一致：')
    missing.forEach((f) => console.log('  ' + f))
    process.exit(1)
  }
  console.log('docs/ 与 webapp/ 一致 ✓')
  process.exit(0)
}

// 2. 同步
const copied = copyDir(SRC, DST, SKIP_DIRS)
const prevManifest = readManifest()
const current = [...new Set([...prevManifest, ...copied])]
const removed = removeStale(prevManifest, current)
writeManifest(current)

// 3. 报告
const total = listFiles(DST).filter((f) => !f.startsWith('tests/') && f !== '.sync-manifest').length
console.log(`已同步 webapp/ → docs/（${total} 个文件）`)
if (changed.length) {
  console.log(`  变更 ${changed.length} 项：`)
  changed.slice(0, 10).forEach(([k, f]) => console.log(`    ${k}: ${f}`))
  if (changed.length > 10) console.log(`    …还有 ${changed.length - 10} 项`)
}
if (removed.length) console.log(`  清理 ${removed.length} 项：${removed.join(', ')}`)
