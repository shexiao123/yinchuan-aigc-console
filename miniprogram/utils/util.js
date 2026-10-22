const { cloud } = require('./cloud')

/** 订单状态字典：文案 + 主题色 */
const ORDER_STATUS = {
  open: { text: '待接单', tone: 'pending' },
  taken: { text: '已接单', tone: 'taken' },
  producing: { text: '制作中', tone: 'busy' },
  delivered: { text: '待确认', tone: 'delivered' },
  completed: { text: '已完成', tone: 'done' },
  cancelled: { text: '已取消', tone: 'cancelled' }
}

/** 订单状态推进路径：每一步写入 timeline */
const ORDER_FLOW = {
  open: '待接单',
  taken: '服务者已接单',
  producing: '开始制作',
  delivered: '成片已交付',
  completed: '订单完成',
  cancelled: '订单取消'
}

function orderStatus(status) {
  return ORDER_STATUS[status] || { text: status || '未知', tone: 'pending' }
}

function statusLabel(status) {
  return (ORDER_FLOW && ORDER_FLOW[status]) || ORDER_STATUS[status]?.text || status || ''
}

/** 金额：数据库用分存储，展示用元 */
function yuan(cents) {
  const n = Number(cents || 0)
  return (n / 100).toFixed(2)
}

function yuanShort(cents) {
  const n = Number(cents || 0) / 100
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

/** 生成订单号：日期 + 随机段 */
function makeOrderNo() {
  const d = new Date()
  const pad = (v) => String(v).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const rand = Math.floor(Math.random() * 900000 + 100000)
  return `GY${stamp}${rand}`
}

/** 相对时间：用于订单与评价列表 */
function fromNow(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)} 天前`
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 封面占位：按服务 id 派生稳定的色相与渐变 */
const COVER_THEMES = [
  'linear-gradient(135deg,#E8B27A,#C4703F)',
  'linear-gradient(135deg,#9FB89A,#5F7A5A)',
  'linear-gradient(135deg,#D9A5A0,#A5645F)',
  'linear-gradient(135deg,#8FA9BF,#5B7186)',
  'linear-gradient(135deg,#D4B87F,#9C8449)',
  'linear-gradient(135deg,#B4A3C7,#7C6A93)'
]

function coverTheme(seed) {
  const n = Math.abs(Number(seed) || 0)
  return COVER_THEMES[n % COVER_THEMES.length]
}

/** 统一取出 { data, error } 中的数据，失败时抛出可读错误 */
function unwrap(result, fallbackMessage) {
  if (result && result.error) {
    const msg = result.error.message || fallbackMessage || '操作失败'
    const err = new Error(msg)
    err.code = result.error.code
    throw err
  }
  return result ? result.data : null
}

/** 把数据库错误翻译成人话 */
function friendlyError(err) {
  if (!err) return '操作失败，请重试'
  const code = err.code
  if (code === '42501') return '没有权限执行该操作，请确认登录身份'
  if (code === '42P01') return '数据表不存在，请联系平台管理员'
  if (code === '23505') return '记录已存在，请勿重复提交'
  if (code === '23503') return '关联数据不存在，请刷新后重试'
  const msg = String(err.message || '')
  if (/LimitExceeded|PhoneNumberDailyLimit/i.test(msg)) {
    return '该手机号今天的验证码发送次数已达上限，请明天再试，或换其他手机号'
  }
  if (/PhoneNumber.*(frequent|limit)/i.test(msg)) {
    return '验证码发送过于频繁，请稍后再试'
  }
  if (/InvalidPhone|phone.*invalid/i.test(msg)) {
    return '手机号格式不正确，请检查后重试'
  }
  if (/InvalidToken|token.*invalid|expired/i.test(msg)) {
    return '验证码无效或已过期，请重新获取'
  }
  if (/network|timeout|failed to fetch|request:fail/i.test(msg)) {
    return '网络连接失败，请检查网络后重试'
  }
  return msg || '操作失败，请重试'
}

module.exports = {
  cloud,
  ORDER_STATUS,
  ORDER_FLOW,
  orderStatus,
  statusLabel,
  yuan,
  yuanShort,
  makeOrderNo,
  fromNow,
  coverTheme,
  unwrap,
  friendlyError
}
