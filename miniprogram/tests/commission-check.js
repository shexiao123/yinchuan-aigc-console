/**
 * 佣金规则校验
 * 验证：平台基准 10% 起步、会员档位递减、下限保底、前端不可篡改
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const commission = require(path.join(ROOT, 'utils', 'commission'))

let fail = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { console.log('  ✗ ' + m); fail++ }

console.log('=== 佣金规则校验 ===')

// 1. 基准佣金是 10%
if (commission.BASE_COMMISSION === 0.1) ok('平台基准佣金 10%')
else bad(`平台基准佣金应为 0.1，实际 ${commission.BASE_COMMISSION}`)

// 2. 档位佣金从 10% 往下递减
const tiers = ['basic', 'pro', 'studio']
const rates = tiers.map((t) => commission.TIER_COMMISSION[t])
if (rates[0] === 0.1) ok('基础档 10%（与起步价一致）')
else bad(`基础档应为 0.1，实际 ${rates[0]}`)

let descending = true
for (let i = 1; i < rates.length; i++) {
  if (rates[i] >= rates[i - 1]) descending = false
}
if (descending) ok('档位佣金递减：' + rates.map((r) => (r * 100) + '%').join(' → '))
else bad('档位佣金未递减：' + rates.join(', '))

// 3. 所有档位不低于起步价 10%？—— 不，档位是「往下」减，但保底不能低于 MIN
if (rates.every((r) => r >= commission.MIN_COMMISSION)) ok(`所有档位不低于保底 ${(commission.MIN_COMMISSION * 100)}%`)
else bad('存在低于保底的档位')

// 4. 服务费计算
const cases = [
  { amount: 100000, rate: 0.1, expect: 10000, label: '1000元 @10% = 100元' },
  { amount: 100000, rate: 0.08, expect: 8000, label: '1000元 @8% = 80元' },
  { amount: 100000, rate: 0.05, expect: 5000, label: '1000元 @5% = 50元' },
  { amount: 399900, rate: 0.08, expect: 31992, label: '3999元 @8% = 319.92元' },
  { amount: 0, rate: 0.1, expect: 0, label: '0元 = 0' },
  { amount: 100, rate: 0.1, expect: 10, label: '1元 @10% = 0.1元' }
]
cases.forEach((c) => {
  const got = commission.calcPlatformFee(c.amount, c.rate)
  if (got === c.expect) ok(c.label)
  else bad(`${c.label} → 实际 ${got}`)
})

// 5. 会员相比无会员更划算（核心商业逻辑）
const amount = 100000
const noMember = commission.calcPlatformFee(amount, commission.BASE_COMMISSION)
const proMember = commission.calcPlatformFee(amount, commission.TIER_COMMISSION.pro)
const studioMember = commission.calcPlatformFee(amount, commission.TIER_COMMISSION.studio)
if (noMember > proMember && proMember > studioMember) {
  ok(`会员省更多：非会员 ¥${noMember / 100} > 专业 ¥${proMember / 100} > 工作室 ¥${studioMember / 100}`)
} else {
  bad('会员佣金优势未生效')
}

// 6. 前端传值不能篡改 —— 确认 api.js 里的 createOrder 不直接用 payload.platformFee
//    注意：`platform_fee: platformFee` 里的 platformFee 可能是服务端算出的局部变量，
//    所以要查的是有没有 `payload.platformFee` / `payload.platform_fee` 这种直传。
const miniApi = fs.readFileSync(path.join(ROOT, 'utils', 'api.js'), 'utf8')
const createOrderBlock = miniApi.slice(
  miniApi.indexOf('async function createOrder'),
  miniApi.indexOf('async function listOrders')
)
if (/payload\.platformFee|payload\.platform_fee/.test(createOrderBlock)) {
  bad('createOrder 直接用了 payload.platformFee（可被前端篡改）')
} else if (/const platformFee = commission\.calcPlatformFee/.test(createOrderBlock)) {
  ok('createOrder 服务端重算佣金，不采信前端值')
} else {
  bad('createOrder 未见服务端重算逻辑')
}

// 7. 网页端同样
const webApi = fs.readFileSync(path.join(ROOT, '..', 'webapp', 'js', 'api.js'), 'utf8')
const webBlock = webApi.slice(
  webApi.indexOf('async function createOrder'),
  webApi.indexOf('async function listOrders')
)
if (/payload\.platformFee|payload\.platform_fee/.test(webBlock)) {
  bad('网页端 createOrder 直接用了 payload.platformFee')
} else if (/const platformFee = calcPlatformFee/.test(webBlock)) {
  ok('网页端 createOrder 服务端重算佣金')
} else {
  bad('网页端 createOrder 未见服务端重算逻辑')
}

// 8. 接单时重算（公开需求池）
const takeBlock = miniApi.slice(
  miniApi.indexOf('async function takeOrder'),
  miniApi.indexOf('async function listOrders({ role')
)
if (/commission\.resolveCommissionRate/.test(takeBlock)) ok('小程序端接单时重算佣金')
else bad('小程序端 takeOrder 未重算佣金')

const webTake = webApi.slice(
  webApi.indexOf('async function takeOrder'),
  webApi.indexOf('/* ---------------- 消息通知')
)
if (/resolveCommissionRate/.test(webTake)) ok('网页端接单时重算佣金')
else bad('网页端 takeOrder 未重算佣金')

console.log('')
console.log(fail === 0 ? '  佣金规则全部校验通过 ✓' : `  ${fail} 项未通过`)
process.exit(fail ? 1 : 0)
