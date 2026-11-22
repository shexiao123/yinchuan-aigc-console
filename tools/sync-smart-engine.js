/**
 * 把网页端的智能算法内核同步到小程序端（双端唯一真源）
 * 用法：node tools/sync-smart-engine.js [--check]
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'webapp', 'js', 'smart-engine.js')
const DST = path.join(ROOT, 'miniprogram', 'utils', 'smart-engine.js')
const checkOnly = process.argv.includes('--check')

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex')

if (!fs.existsSync(SRC)) {
  console.error('✗ 源文件不存在: ' + SRC)
  process.exit(1)
}
const src = fs.readFileSync(SRC)
const dst = fs.existsSync(DST) ? fs.readFileSync(DST) : null
const same = dst && md5(src) === md5(dst)

if (checkOnly) {
  console.log(same ? '✓ 双端 smart-engine.js 一致 (' + md5(src).slice(0, 8) + ')' : '✗ 双端不一致，请运行同步')
  process.exit(same ? 0 : 1)
}
if (same) {
  console.log('✓ 已是最新，无需复制')
  process.exit(0)
}
fs.writeFileSync(DST, src)
console.log('✓ 已同步 webapp/js/smart-engine.js → miniprogram/utils/smart-engine.js')
console.log('  md5 ' + md5(src) + ' · ' + src.length + ' B')
