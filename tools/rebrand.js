/**
 * 品牌标识统一替换
 *
 * 大字品牌名：美格视觉            → 银川AIGC数字文化产业基地
 * 小字公司名：宁夏美格视觉传媒接单 → 宁夏云辇文化科技有限公司
 *
 * 替换顺序很重要：先替换长串（公司名），再替换短串（品牌名），
 * 否则短串会先把长串切碎。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const BRAND_OLD = '美格视觉'
const BRAND_NEW = '银川AIGC数字文化产业基地'
const COMPANY_OLD = '宁夏美格视觉传媒接单'
const COMPANY_NEW = '宁夏云辇文化科技有限公司'

// 需要处理的文件（排除依赖与生成物）
const TARGETS = [
  'webapp/index.html',
  'webapp/admin.html',
  'webapp/js/app.js',
  'webapp/js/admin.js',
  'webapp/js/api.js',
  'prototype/index.html',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/package.json',
  'miniprogram/project.config.json',
  'miniprogram/pages/index/index.wxml',
  'miniprogram/pages/index/index.js',
  'miniprogram/pages/index/index.json',
  'miniprogram/pages/login/login.wxml',
  'miniprogram/pages/profile/profile.wxml',
  'miniprogram/pages/profile/profile.js',
  'miniprogram/pages/admin/admin.wxml',
  'miniprogram/pages/service-detail/service-detail.js',
  'miniprogram/pages/services/services.js',
  'miniprogram/pages/support/support.wxml',
  'miniprogram/tests/smoke.js',
  'miniprogram/tests/features.js',
  'miniprogram/tests/pre-publish.js',
  'tools/check-apps.js',
  'tools/make-bat.js'
]

const report = []
let totalCompany = 0
let totalBrand = 0

TARGETS.forEach((rel) => {
  const file = path.join(ROOT, rel)
  if (!fs.existsSync(file)) {
    report.push(`  [跳过] ${rel} 不存在`)
    return
  }
  const raw = fs.readFileSync(file)
  const isGbk = raw.toString('utf8').includes('\uFFFD')
  let text = isGbk ? new TextDecoder('gbk').decode(raw) : raw.toString('utf8')
  const before = text

  // 1. 先替换公司全称（长串）
  const companyCount = text.split(COMPANY_OLD).length - 1
  text = text.split(COMPANY_OLD).join(COMPANY_NEW)
  // 2. 再替换品牌名（短串）
  const brandCount = text.split(BRAND_OLD).length - 1
  text = text.split(BRAND_OLD).join(BRAND_NEW)

  if (text === before) return

  if (isGbk) {
    // GBK 文件：借 PowerShell 写回（保持原编码）
    const tmp = path.join(process.env.TEMP || 'C:/Users/12/AppData/Local/Temp', 'brandtmp.txt')
    fs.writeFileSync(tmp, Buffer.from(text, 'utf8'))
    require('child_process').execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command',
        `$enc=[System.Text.Encoding]::GetEncoding(936);` +
        `$t=[System.IO.File]::ReadAllText('${tmp.replace(/\\/g, '\\\\')}',[System.Text.Encoding]::UTF8);` +
        `[System.IO.File]::WriteAllBytes('${file.replace(/\\/g, '\\\\')}', $enc.GetBytes($t))`],
      { stdio: 'pipe' }
    )
    try { fs.unlinkSync(tmp) } catch (e) {}
  } else {
    fs.writeFileSync(file, text, 'utf8')
  }

  totalCompany += companyCount
  totalBrand += brandCount
  report.push(`  ✓ ${rel}  公司名 ${companyCount} 处 / 品牌名 ${brandCount} 处`)
})

console.log('=== 品牌替换完成 ===')
report.forEach((r) => console.log(r))
console.log('')
console.log(`  合计：公司名 ${totalCompany} 处， 品牌名 ${totalBrand} 处`)
console.log(`  ${BRAND_OLD} → ${BRAND_NEW}`)
console.log(`  ${COMPANY_OLD} → ${COMPANY_NEW}`)
