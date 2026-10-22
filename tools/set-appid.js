/**
 * 小程序 AppID 配置
 *
 * 游客 AppID（touristappid）只能用于模拟器，不能上传、不能真机预览。
 * 要发布小程序，必须填入你自己在微信公众平台注册的小程序 AppID。
 *
 * 用法：
 *   node tools/set-appid.js wx1234567890abcdef
 *   node tools/set-appid.js            # 不带参数则显示当前值
 */
const fs = require('fs')
const path = require('path')

const MINI = path.resolve(__dirname, '..', 'miniprogram')
const CFG = path.join(MINI, 'project.config.json')

const arg = (process.argv[2] || '').trim()
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'))

if (!arg) {
  console.log('当前 AppID:', cfg.appid)
  if (cfg.appid === 'touristappid' || !cfg.appid) {
    console.log('')
    console.log('这是游客 AppID，只能在模拟器里跑。上传会被拒：')
    console.log('  「不存在此 AppID 请检查后重新输入」')
    console.log('')
    console.log('要发布，请填入你自己的小程序 AppID：')
    console.log('  node tools/set-appid.js wx你的AppID')
    console.log('')
    console.log('AppID 在微信公众平台获取：')
    console.log('  1. 打开 https://mp.weixin.qq.com')
    console.log('  2. 注册小程序（个人主体也行）')
    console.log('  3. 开发管理 → 开发设置 → AppID')
  }
  process.exit(0)
}

// 校验格式：以 wx 开头，18 位（wx + 16 位十六进制）
if (!/^wx[0-9a-fA-F]{16}$/.test(arg)) {
  console.error('AppID 格式不对，应为 wx 开头共 18 位，例如 wx1234567890abcdef')
  console.error('你填的是：' + arg)
  process.exit(1)
}

cfg.appid = arg
fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
console.log('✓ AppID 已设置为 ' + arg)
console.log('')
console.log('现在可以双击 发布小程序.bat 上传，或在微信公众平台提交审核。')
