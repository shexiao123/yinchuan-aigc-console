#!/usr/bin/env node
/**
 * 应用绑定校验
 * 平台在小程序部署时可能把 web 应用的 localDir 串成 miniprogram 目录，
 * 导致产物卡片指向错误目录。这个脚本按固定映射表校验并可自动修复。
 *
 * 用法：
 *   node tools/check-apps.js          # 只检查
 *   node tools/check-apps.js --fix    # 检查并修复
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// 固定映射：appId → { name, localDir, appType, entryHtml }
const EXPECTED = {
  wbapp_NPfdYpGfbDWvkcfEnOHVJB: {
    name: '宁夏云辇文化科技有限公司',
    localDir: 'miniprogram',
    appType: 'miniprogram',
    entryHtml: null
  },
  wbapp_ljDFUAeoNoNPMqrfAZpbEV: {
    name: '宁夏云辇文化科技有限公司网页版',
    localDir: 'webapp',
    appType: 'web',
    entryHtml: 'index.html'
  },
  wbapp_ZqMHeMlllnWR6FsdzVdZWt: {
    name: '宁夏云辇文化科技有限公司原型',
    localDir: 'prototype',
    appType: 'web',
    entryHtml: 'index.html'
  }
}

const fix = process.argv.includes('--fix')
let bad = 0

Object.entries(EXPECTED).forEach(([appId, exp]) => {
  const file = path.join(ROOT, `.${appId}.genie`)
  if (!fs.existsSync(file)) {
    console.log(`  ✗ ${exp.name}  标记文件缺失: .${appId}.genie`)
    bad++
    return
  }

  const raw = fs.readFileSync(file, 'utf8')
  const cur = {}
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/)
    if (m) cur[m[1]] = m[2].trim()
  })

  const want = {
    appId,
    name: exp.name,
    localDir: path.join(ROOT, exp.localDir),
    appType: exp.appType,
    ...(exp.entryHtml ? { entryHtml: exp.entryHtml } : {})
  }

  const diffs = []
  Object.entries(want).forEach(([k, v]) => {
    if (cur[k] !== v) diffs.push(`${k}: ${cur[k] || '(空)'} → ${v}`)
  })

  if (!diffs.length) {
    console.log(`  ✓ ${exp.name}  (${exp.localDir})`)
    return
  }

  bad++
  console.log(`  ✗ ${exp.name}  绑定有误`)
  diffs.forEach((d) => console.log(`      ${d}`))

  if (fix) {
    const content = [
      `appId: ${want.appId}`,
      `name: ${want.name}`,
      `localDir: ${want.localDir}`,
      `appType: ${want.appType}`,
      ...(want.entryHtml ? [`entryHtml: ${want.entryHtml}`] : [])
    ].join('\n') + '\n'
    fs.writeFileSync(file, content, 'utf8')
    console.log('      → 已修复')
  }
})

console.log('')
if (bad === 0) {
  console.log('  全部应用绑定正常 ✓')
} else if (fix) {
  console.log(`  已修复 ${bad} 个应用的绑定 ✓`)
} else {
  console.log(`  ${bad} 个应用绑定异常，执行 node tools/check-apps.js --fix 修复`)
  process.exitCode = 1
}
