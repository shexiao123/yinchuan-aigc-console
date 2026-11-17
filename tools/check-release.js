/**
 * 发布资格预检（供 发布小程序.bat 调用）
 * 退出码：0 通过；2 未确认正式 AppID（bat 会打印引导并停下）
 */
const path = require('path')
const rel = require(path.join(__dirname, 'release.json'))

if (!rel.officialAppidConfirmed) {
  console.log('  [X] 尚未确认正式企业 AppID（当前为开发者工具测试号）')
  process.exit(2)
}

console.log('  [OK] 正式 AppID 已确认')
if (rel.demoMode) {
  console.log('  [!] 演示记账版：只能作为体验版试用，不能作为真实交易版本提审')
}
console.log('  [OK] 版本 ' + rel.version)
process.exit(0)
