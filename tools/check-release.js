/**
 * 发布资格预检（供 发布小程序.bat 调用）
 * 退出码：0 通过；2 未确认正式 AppID（bat 会打印引导并停下）
 */
const path = require('path')
const rel = require(path.join(__dirname, 'release.json'))

if (!rel.officialAppidConfirmed) {
  console.log('  [X] 尚未确认正式企业 AppID（当前为小程序测试号）')
  console.log('      实测：测试号可以上传开发版和生成真机预览二维码，')
  console.log('      但公众平台后台是沙箱页，没有「版本管理/提交审核/发布」入口，永远无法正式上线。')
  process.exit(2)
}

console.log('  [OK] 正式 AppID 已确认')
if (rel.demoMode) {
  console.log('  [!] 演示记账版：可作为体验版试用，不能作为真实交易版本提审')
}
console.log('  [OK] 版本 ' + rel.version)
process.exit(0)
