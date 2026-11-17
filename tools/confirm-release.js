/**
 * 确认正式 AppID / 撤销确认
 *
 * 用法：
 *   node tools/confirm-release.js           # 确认（必须先填自有企业 AppID）
 *   node tools/confirm-release.js --revoke  # 撤回确认
 *
 * 这一步只做「声明」：填了 AppID 不等于小程序已注册、已认证、已具备支付资质。
 * 真实上线仍需微信公众平台提交审核并发布，见《正式上线清单.md》。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CFG = path.join(ROOT, 'tools', 'release.json')
const PROJ = path.join(ROOT, 'miniprogram', 'project.config.json')

const rel = JSON.parse(fs.readFileSync(CFG, 'utf8'))
const proj = JSON.parse(fs.readFileSync(PROJ, 'utf8'))
const appid = String(proj.appid || '')

if (process.argv.includes('--revoke')) {
  rel.officialAppidConfirmed = false
  fs.writeFileSync(CFG, JSON.stringify(rel, null, 2) + '\n', 'utf8')
  console.log('✓ 已撤回正式 AppID 确认，发布前检查会重新拦截')
  process.exit(0)
}

if (!appid || appid === 'touristappid' || appid === rel.knownTestAppid) {
  console.error('✗ 当前 AppID 是游客号 / 开发者工具测试号，不能确认为正式 AppID')
  console.error('')
  console.error('  请先到 https://mp.weixin.qq.com 注册小程序（企业主体），')
  console.error('  在「开发管理 → 开发设置」复制 AppID，然后执行：')
  console.error('')
  console.error('    node tools/set-appid.js wx你的AppID')
  console.error('    node tools/confirm-release.js')
  console.error('')
  process.exit(1)
}

if (!/^wx[0-9a-fA-F]{16}$/.test(appid)) {
  console.error('✗ AppID 格式不合法：' + appid)
  process.exit(1)
}

rel.officialAppidConfirmed = true
fs.writeFileSync(CFG, JSON.stringify(rel, null, 2) + '\n', 'utf8')
console.log('✓ 正式 AppID 已确认：' + appid)
console.log('')
console.log('  但请注意：这只是一个本地声明，不等于「已上线」。还需要：')
console.log('    1. 微信开发者工具用本人微信扫码登录')
console.log('    2. 双击 发布小程序.bat 上传体验版')
console.log('    3. 在 https://mp.weixin.qq.com 提交审核 → 审核通过 → 点「发布」')
console.log('    4. 若涉及真实收付款，先接后端支付/分账资质，再把 release.json 的 demoMode 改为 false')
console.log('')
