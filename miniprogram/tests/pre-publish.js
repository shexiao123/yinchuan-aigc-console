/**
 * 小程序发布前检查
 * 在点「分享」发布之前跑一遍，避免审核被打回。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MINI = ROOT

let warn = 0
let err = 0
const ok = (m) => console.log('  ✓ ' + m)
const warning = (m) => {
  console.log('  ! ' + m)
  warn++
}
const error = (m) => {
  console.log('  ✗ ' + m)
  err++
}

console.log('')
console.log('=== 宁夏云辇文化科技有限公司 · 小程序发布前检查 ===')
console.log('')

// 1. 工程结构
console.log('1. 工程结构')
const appJson = JSON.parse(fs.readFileSync(path.join(MINI, 'app.json'), 'utf8'))
if (!appJson.pages || !appJson.pages.length) {
  error('app.json 没有页面')
} else {
  let missing = 0
  appJson.pages.forEach((p) => {
    ;['.js', '.json', '.wxml', '.wxss'].forEach((e) => {
      if (!fs.existsSync(path.join(MINI, p + e))) {
        error(`缺文件：${p}${e}`)
        missing++
      }
    })
  })
  if (!missing) ok(`${appJson.pages.length} 个页面四件套齐全`)
}

// 2. 依赖
console.log('')
console.log('2. 依赖与构建')
const npmDist = path.join(MINI, 'miniprogram_npm', '@tencent-ai', 'workbuddy-cloud-sdk', 'miniprogram.js')
if (fs.existsSync(npmDist)) ok('miniprogram_npm 已预构建')
else warning('miniprogram_npm 缺失，导入后需点「工具 → 构建 npm」')

const pkg = JSON.parse(fs.readFileSync(path.join(MINI, 'package.json'), 'utf8'))
if (pkg.dependencies && Object.keys(pkg.dependencies).length) {
  ok(`依赖声明：${Object.keys(pkg.dependencies).join(', ')}`)
} else {
  warning('package.json 没声明依赖')
}

// 3. 云服务配置
console.log('')
console.log('3. 云服务配置')
const cloudSrc = fs.readFileSync(path.join(MINI, 'utils', 'cloud.js'), 'utf8')
if (cloudSrc.includes('endpoint:') && cloudSrc.includes('publishableKey:')) ok('endpoint 与 publishableKey 已配置')
else error('utils/cloud.js 缺少 endpoint 或 publishableKey')
if (cloudSrc.includes('createMiniProgramWorkBuddyCloud')) ok('使用官方 SDK 工厂函数')
else error('utils/cloud.js 未用 createMiniProgramWorkBuddyCloud')

// 4. AppID
console.log('')
console.log('4. AppID')
const proj = JSON.parse(fs.readFileSync(path.join(MINI, 'project.config.json'), 'utf8'))
if (proj.appid === 'touristappid' || !proj.appid) {
  warning(`当前是游客 AppID（${proj.appid}）—— 模拟器可用，但正式发布/真机预览需换成你自己的 AppID`)
} else {
  ok(`AppID：${proj.appid}`)
}

// 5. 隐私声明
console.log('')
console.log('5. 隐私声明')
const privacyFiles = fs
  .readdirSync(MINI)
  .filter((f) => f.endsWith('.privacy.json'))
if (!privacyFiles.length) {
  error('找不到 .privacy.json，发布正式版时平台会要求填写')
} else {
  const privacy = JSON.parse(fs.readFileSync(path.join(MINI, privacyFiles[0]), 'utf8'))
  const keys = privacy.map((p) => Object.keys(p)[0])
  ok(`${privacy.length} 项声明：${keys.join(', ')}`)

  // 检查代码里用到的敏感接口是否都声明了
  const allJs = appJson.pages
    .map((p) => path.join(MINI, p + '.js'))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n')
  const sensitive = [
    { api: 'chooseMedia', key: 'ChooseMedia' },
    { api: 'chooseVideo', key: 'ChooseMedia' },
    { api: 'chooseImage', key: 'ChooseMedia' },
    { api: 'getLocation', key: 'Location' },
    { api: 'getPhoneNumber', key: 'PhoneNumber' },
    { api: 'saveImageToPhotosAlbum', key: 'Album' }
  ]
  let miss = 0
  sensitive.forEach(({ api, key }) => {
    if (new RegExp('wx\\.' + api + '\\b').test(allJs) && !keys.includes(key)) {
      error(`代码用了 wx.${api}，隐私清单缺 ${key}`)
      miss++
    }
  })
  if (!miss) ok('隐私声明与代码一致')
}

// 6. 打包忽略
console.log('')
console.log('6. 打包配置')
const ignore = (proj.packOptions && proj.packOptions.ignore) || []
const ignored = ignore.map((i) => i.value)
;['node_modules', 'tests'].forEach((d) => {
  if (ignored.includes(d)) ok(`已忽略 ${d}`)
  else warning(`未忽略 ${d}，可能被打进包里`)
})
if (Array.isArray(proj.setting && proj.setting.packNpmRelationList) && proj.setting.packNpmRelationList.length) {
  ok('构建 npm 映射已配置')
} else {
  warning('packNpmRelationList 为空，工具可能不认预置的 miniprogram_npm')
}

// 7. 调试残留
console.log('')
console.log('7. 调试残留')
const debugFiles = appJson.pages
  .map((p) => path.join(MINI, p + '.js'))
  .filter((f) => fs.existsSync(f))
  .filter((f) => {
    const src = fs.readFileSync(f, 'utf8')
    return /console\.log\(/.test(src) || /TODO|FIXME/.test(src)
  })
if (debugFiles.length) {
  warning(`${debugFiles.length} 个页面有 console.log/TODO（不影响发布，但建议清理）`)
  debugFiles.slice(0, 3).forEach((f) => console.log('      ' + path.relative(MINI, f)))
} else {
  ok('无调试残留')
}

// 8. 工程自检
console.log('')
console.log('8. 工程自检')
try {
  const { execFileSync } = require('child_process')
  execFileSync(process.execPath, [path.join(MINI, 'tests', 'smoke.js')], { stdio: 'pipe' })
  ok('smoke.js 通过')
} catch (e) {
  error('smoke.js 未通过')
}
try {
  const { execFileSync } = require('child_process')
  execFileSync(process.execPath, [path.join(MINI, 'tests', 'features.js')], { stdio: 'pipe' })
  ok('features.js 通过')
} catch (e) {
  error('features.js 未通过')
}

console.log('')
if (err) {
  console.log(`  ${err} 项必须修复，${warn} 项建议处理`)
  process.exitCode = 1
} else if (warn) {
  console.log(`  可以发布，但有 ${warn} 项建议先处理`)
} else {
  console.log('  全部检查通过，可以发布 ✓')
}
console.log('')
