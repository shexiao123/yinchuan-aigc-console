/**
 * 提现链路测试（不需要微信环境）：node tools/test-payout.js
 * 覆盖：默认账户、卡号/支付宝脱敏、校验、提现扣款与流水、默认账户不可删、单日限额
 */
const store = {}
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => {
    store[k] = v
  },
  removeStorageSync: (k) => {
    delete store[k]
  }
}

const wallet = require('../miniprogram/utils/wallet')
const payout = require('../miniprogram/utils/payout')

let pass = 0
let fail = 0
function t(name, fn) {
  try {
    fn()
    pass++
    console.log('  ✓', name)
  } catch (e) {
    fail++
    console.log('  ✗', name, '→', e.message)
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' 期望 ' + b + '，实际 ' + a)
}
function throws(fn, code) {
  try {
    fn()
  } catch (e) {
    if (e.code !== code) throw new Error('错误码期望 ' + code + '，实际 ' + e.code)
    return
  }
  throw new Error('未抛错，期望 ' + code)
}

console.log('【账户】')
t('默认带微信零钱且为默认', () => {
  const a = payout.listAccounts()
  eq(a.length, 1, '账户数')
  eq(a[0].type, 'wechat', '类型')
  eq(a[0].isDefault, true, '默认')
})

t('银行卡号非法被拒', () => {
  throws(() => payout.addBank({ cardNo: '123', bankName: '中国银行', holder: '张三', phone: '13800138000' }), 'BAD_CARD')
})

t('缺少持卡人被拒', () => {
  throws(() => payout.addBank({ cardNo: '6222021234567890123', bankName: '中国银行', holder: '', phone: '13800138000' }), 'BAD_HOLDER')
})

t('手机号非法被拒', () => {
  throws(() => payout.addBank({ cardNo: '6222021234567890123', bankName: '中国银行', holder: '张三', phone: '138' }), 'BAD_PHONE')
})

t('添加银行卡成功且脱敏只留尾号', () => {
  const acc = payout.addBank({ cardNo: '6222 0212 3456 7890', bankName: '中国银行', holder: '张三', phone: '13800138000' })
  eq(acc.masked, '**** **** **** 7890', '脱敏')
  eq(acc.tail, '7890', '尾号')
  if (JSON.stringify(acc).indexOf('6222021234567890') >= 0) throw new Error('对象里出现了完整卡号')
})

t('重复卡被拒', () => {
  throws(() => payout.addBank({ cardNo: '6222021234567890', bankName: '中国银行', holder: '张三', phone: '13800138000' }), 'DUP_CARD')
})

t('支付宝账号非法被拒', () => {
  throws(() => payout.addAlipay({ account: 'abc', holder: '张三' }), 'BAD_ALIPAY')
})

t('添加支付宝并脱敏', () => {
  const acc = payout.addAlipay({ account: 'zhangsan@example.com', holder: '张三' })
  eq(acc.masked, 'zh***@example.com', '脱敏')
})

console.log('\n【提现】')
t('低于起提额被拒', () => {
  const accounts = payout.listAccounts()
  throws(() => payout.submitWithdraw({ amount: 500, accountId: accounts[0].id }), 'TOO_SMALL')
})

t('未选账户被拒', () => {
  throws(() => payout.submitWithdraw({ amount: 10000, accountId: '' }), 'NO_ACCOUNT')
})

t('超额提现被拒', () => {
  const accounts = payout.listAccounts()
  throws(() => payout.submitWithdraw({ amount: 99999999, accountId: accounts[0].id }), 'NO_BALANCE')
})

t('提现到银行卡：扣余额、写流水、生成处理中记录', () => {
  const bank = payout.listAccounts().find((a) => a.type === 'bank')
  const before = wallet.summary().balance
  const rec = payout.submitWithdraw({ amount: 20000, accountId: bank.id })
  const after = wallet.summary().balance
  eq(before - after, 20000, '扣减金额')
  eq(rec.status, 'processing', '记录状态')
  eq(rec.netText, '200.00', '到账金额')
  const ledger = wallet.summary().ledger[0]
  eq(ledger.typeText, '提现', '流水类型')
  eq(ledger.sign, '-', '流水方向')
})

t('今日已提累计正确', () => {
  eq(payout.rules().todayUsedText, '200.00', '今日已提')
})

t('微信零钱不可删除', () => {
  const w = payout.listAccounts().find((a) => a.type === 'wechat')
  throws(() => payout.removeAccount(w.id), 'NOT_REMOVABLE')
})

t('提现记录可查', () => {
  const list = payout.listRecords()
  eq(list.length, 1, '记录数')
  if (!list[0].accountLabel) throw new Error('缺少到账账户文案')
})

console.log('\n通过 %d / 失败 %d', pass, fail)
if (fail) process.exit(1)
