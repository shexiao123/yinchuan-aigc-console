/**
 * 平台规则文案与费率同步的校验
 */
const fs = require('fs')
const path = require('path')

const WEB = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(WEB, 'js', 'platform-rules.js'), 'utf8')

let fail = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { console.log('  ✗ ' + m); fail++ }

// 在 Node 里加载这个 IIFE
const sandbox = { window: {} }
new Function('globalThis', src).call(sandbox, sandbox.window)
const R = sandbox.window.PlatformRules
const { syncNoticeRate, isNoticeRateSynced } = R

console.log('=== 平台规则文案同步校验 ===')

if (typeof syncNoticeRate === 'function' && typeof isNoticeRateSynced === 'function') {
  ok('导出 syncNoticeRate / isNoticeRateSynced')
} else {
  bad('导出缺失')
}

// 1. 把 8% 换成 10%
const old = '平台对每笔成交订单收取 8% 服务费，其余全部归服务者所有。'
const neu = syncNoticeRate(old, 0.1)
if (neu.includes('收取 10% 服务费')) ok('8% → 10% 替换成功')
else bad('替换失败: ' + neu)

// 2. 支持 0-100 的百分数输入
if (syncNoticeRate(old, 10).includes('收取 10% 服务费')) ok('接受 0-100 百分数输入')
else bad('0-100 输入未生效')

// 3. 会员档位那部分不被破坏
const withTiers =
  '平台对每笔成交订单收取 10% 服务费，其余全部归服务者所有。开通会员可降低服务费：基础会员 10%、专业会员 8%、工作室会员 5%。'
const synced = syncNoticeRate(withTiers, 0.1)
if (synced === withTiers) ok('费率已一致时不改动文案')
else bad('费率一致时不该改: ' + synced)

const changed = syncNoticeRate(withTiers, 0.12)
if (changed.includes('收取 12% 服务费') && changed.includes('专业会员 8%')) {
  ok('改费率时会员档位描述保持不变')
} else {
  bad('会员档位被破坏: ' + changed)
}

// 4. 一致性判断
if (isNoticeRateSynced(withTiers, 0.1)) ok('isNoticeRateSynced: 10% 判定为一致')
else bad('isNoticeRateSynced: 10% 应判为一致')
if (!isNoticeRateSynced(old, 0.1)) ok('isNoticeRateSynced: 8% vs 10% 判定为不一致')
else bad('isNoticeRateSynced: 8% vs 10% 应判为不一致')
if (isNoticeRateSynced('随便一段没有费率的文字', 0.1)) ok('isNoticeRateSynced: 无费率文案不误报')
else bad('isNoticeRateSynced: 无费率文案不该报警')

// 5. 边界：空文案不炸
if (syncNoticeRate('', 0.1) === '') ok('空文案安全')
else bad('空文案处理异常')
if (syncNoticeRate(null, 0.1) === '') ok('null 文案安全')
else bad('null 文案处理异常')
if (syncNoticeRate('文字', NaN) === '文字') ok('非法费率不改动文案')
else bad('非法费率应不改动')

console.log('')
console.log(fail === 0 ? '  全部校验通过 ✓' : `  ${fail} 项未通过`)
process.exit(fail ? 1 : 0)
