/**
 * 发布资格预检（供 发布小程序.bat 调用）
 * 退出码：0 通过；2 未确认正式 AppID（bat 会打印引导并停下）
 */
const path = require('path')
const rel = require(path.join(__dirname, 'release.json'))

if (!rel.officialAppidConfirmed) {
  console.log('  [X] 尚未确认正式 AppID（可能是测试号，或换了 AppID 但未执行确认）')
  console.log('      实测：测试号可以上传开发版和生成真机预览二维码，')
  console.log('      但公众平台后台是沙箱页，没有「版本管理/提交审核/发布」入口，永远无法正式上线。')
  console.log('      换好正式 AppID 且上传成功后执行：node tools/confirm-release.js')
  process.exit(2)
}

console.log('  [OK] 正式 AppID 已确认：' + (rel.officialAppid || ''))
if (rel.demoMode) {
  console.log('  [!] 演示记账版：可作为体验版试用，不能作为真实交易版本提审')
}
console.log('  [OK] 版本 ' + rel.version)
if (rel.lastSubmitAttempt && /blocked/.test(rel.lastSubmitAttempt.result)) {
  console.log('  [!] 平台侧：' + rel.lastSubmitAttempt.result)
  console.log('      服务类目已补齐（4 个全通过，主营「商业服务 > 摄影/扩印」）')
  console.log('      当前：' + rel.lastSubmitAttempt.secondBlock.afterClick)
  console.log('      主体：' + rel.lastSubmitAttempt.subject.backendDisplay)
}
process.exit(0)
