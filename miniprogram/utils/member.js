/**
 * 会员包月制
 *
 * 三笔费用构成：
 *   1. 会员费（price_cents）—— 按月/季/年付，开通后才有接单资格
 *   2. 保证金（deposit_cents）—— 入驻时冻结，订单履约完成后可退还
 *   3. 入驻费（onboarding_fee_cents）—— 首次入驻一次性
 *
 * 支付通道尚未开通（小程序未绑定微信），所以：
 *   - 开通会员 = 生成待支付订单（status=pending）
 *   - 支付确认由管理员在后台完成（activateSubscription）
 *   - 支付成功后写入订阅记录，同时冻结保证金、记录入驻费
 */
const { cloud } = require('./cloud')
const { unwrap, friendlyError } = require('./util')

/* ---------------------------------------------------------------- 套餐 */

async function listPlans() {
  const res = await cloud.database
    .from('member_plans')
    .select('*')
    .eq('status', 'on')
    .order('sort_order', { ascending: true })
  return unwrap(res, '套餐加载失败') || []
}

async function getPlan(code) {
  const res = await cloud.database
    .from('member_plans')
    .select('*')
    .eq('code', code)
    .maybeSingle()
  return unwrap(res, '')
}

/* ---------------------------------------------------------------- 订阅 */

function isActive(sub) {
  if (!sub) return false
  if (sub.status !== 'active') return false
  const end = new Date(sub.expire_at).getTime()
  return Number.isFinite(end) && end > Date.now()
}

/**
 * 查当前用户有效会员。
 * 过期但状态还是 active 的，视为已失效（这里不改库，返回时按失效处理）
 */
async function getMySubscription(uid) {
  if (!uid) return null
  const res = await cloud.database
    .from('member_subscriptions')
    .select('*')
    .eq('user_id', uid)
    .eq('status', 'active')
    .order('expire_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = unwrap(res, '')
  if (!row) return null
  if (!isActive(row)) {
    // 已过期：顺手把状态改成 expired，避免下次还要判断
    await cloud.database
      .from('member_subscriptions')
      .update({ status: 'expired' })
      .eq('id', row.id)
      .catch(() => null)
    return null
  }
  return row
}

/** 会员状态摘要，供页面直接渲染 */
async function getMembershipStatus(uid) {
  const sub = await getMySubscription(uid)
  if (!sub) {
    return { isMember: false, tier: 'none', planName: '', expireAt: '', daysLeft: 0, commissionRate: null, maxServices: 0, canTakeOrder: false }
  }
  const plan = sub.plan_id ? await cloud.database.from('member_plans').select('*').eq('id', sub.plan_id).maybeSingle() : null
  const p = plan && plan.data ? plan.data : null
  const daysLeft = Math.max(0, Math.ceil((new Date(sub.expire_at).getTime() - Date.now()) / 86400000))
  return {
    isMember: true,
    tier: sub.tier,
    planName: p ? p.name : sub.plan_code,
    expireAt: sub.expire_at,
    daysLeft,
    commissionRate: p ? Number(p.commission_rate) : null,
    maxServices: p ? p.max_services : 0,
    canTakeOrder: true
  }
}

/* ---------------------------------------------------------------- 下单 */

function makeOrderNo(prefix) {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}${ymd}${rand}`
}

/**
 * 创建会员开通订单（待支付）
 * feeType: 'membership' 会员费 | 'deposit' 保证金 | 'onboarding' 入驻费
 * 首次开通时把保证金与入驻费一起生成，方便一次性收齐
 */
async function createSubscriptionOrder(uid, planCode, options) {
  if (!uid) throw new Error('请先登录')
  const opt = options || {}
  const plan = await getPlan(planCode)
  if (!plan) throw new Error('该套餐不存在或已下架')

  const existing = await getMySubscription(uid)
  const firstTime = !existing

  // 会员费：续费按剩余有效期顺延，新开按套餐周期
  const priceCents = Number(plan.price_cents || 0)
  const periodDays = Number(plan.period_days || 30)
  let startAt = new Date()
  if (existing) {
    const cur = new Date(existing.expire_at).getTime()
    if (cur > Date.now()) startAt = new Date(cur)
  }
  const expireAt = new Date(startAt.getTime() + periodDays * 86400000)

  // 首次开通要额外收保证金 + 入驻费
  const depositCents = firstTime ? Number(plan.deposit_cents || 0) : 0
  const onboardingCents = firstTime ? Number(plan.onboarding_fee_cents || 0) : 0
  const totalCents = priceCents + depositCents + onboardingCents

  const orderNo = makeOrderNo('MB')
  const res = await cloud.database
    .from('member_payment_orders')
    .insert({
      order_no: orderNo,
      user_id: uid,
      plan_id: plan.id,
      plan_code: plan.code,
      plan_name: plan.name,
      fee_type: firstTime ? 'membership_with_deposit' : 'membership',
      amount_cents: totalCents,
      status: 'pending',
      remark: firstTime
        ? `会员费 ¥${(priceCents / 100).toFixed(2)} + 保证金 ¥${(depositCents / 100).toFixed(2)} + 入驻费 ¥${(onboardingCents / 100).toFixed(2)}`
        : `会员费 ¥${(priceCents / 100).toFixed(2)}（续费 ${periodDays} 天）`
    })
    .select()
  const rows = unwrap(res, '创建订单失败')
  if (!rows || !rows.length) throw new Error('创建订单失败')

  return {
    order: rows[0],
    plan,
    breakdown: {
      membership: priceCents,
      deposit: depositCents,
      onboarding: onboardingCents,
      total: totalCents,
      periodDays,
      startAt: startAt.toISOString(),
      expireAt: expireAt.toISOString(),
      firstTime
    }
  }
}

/* ---------------------------------------------------------------- 支付确认 */

/**
 * 支付成功后的开通逻辑。
 * 支付通道未开时由管理员在后台调用；接通后由支付回调调用。
 */
async function activateSubscription(uid, orderNo, operator) {
  const op = operator || {}
  const ordRes = await cloud.database
    .from('member_payment_orders')
    .select('*')
    .eq('order_no', orderNo)
    .maybeSingle()
  const order = unwrap(ordRes, '')
  if (!order) throw new Error('订单不存在')
  if (order.status === 'paid') throw new Error('该订单已支付')
  if (order.status === 'cancelled') throw new Error('该订单已取消')

  const plan = await getPlan(order.plan_code)
  if (!plan) throw new Error('套餐不存在')

  // 标记支付成功
  await cloud.database
    .from('member_payment_orders')
    .update({
      status: 'paid',
      pay_method: op.payMethod || 'manual',
      transaction_id: op.transactionId || null,
      paid_at: new Date().toISOString()
    })
    .eq('id', order.id)

  // 计算订阅期
  const existing = await getMySubscription(uid)
  let startAt = new Date()
  if (existing) {
    const cur = new Date(existing.expire_at).getTime()
    if (cur > Date.now()) startAt = new Date(cur)
  }
  const periodDays = Number(plan.period_days || 30)
  const expireAt = new Date(startAt.getTime() + periodDays * 86400000)

  // 写订阅记录
  const subRes = await cloud.database
    .from('member_subscriptions')
    .insert({
      user_id: uid,
      plan_id: plan.id,
      plan_code: plan.code,
      tier: plan.tier,
      status: 'active',
      period_days: periodDays,
      price_cents: order.amount_cents,
      deposit_cents: plan.deposit_cents,
      onboarding_fee_cents: plan.onboarding_fee_cents,
      start_at: startAt.toISOString(),
      expire_at: expireAt.toISOString(),
      auto_renew: false,
      payment_order_id: order.id
    })
    .select()
  const subs = unwrap(subRes, '开通失败')
  if (!subs || !subs.length) throw new Error('开通会员失败')

  // 首次开通：冻结保证金
  if (Number(plan.deposit_cents || 0) > 0) {
    await cloud.database
      .from('provider_deposits')
      .insert({
        user_id: uid,
        amount_cents: plan.deposit_cents,
        status: 'held',
        note: `开通${plan.name}时冻结`
      })
      .catch(() => null)
  }

  // 日志
  await cloud.database
    .from('membership_logs')
    .insert({
      user_id: uid,
      action: 'activate',
      plan_code: plan.code,
      detail: `${plan.name}，有效期至 ${expireAt.toLocaleDateString('zh-CN')}`,
      amount_cents: order.amount_cents,
      operator_uid: op.uid || null,
      operator_name: op.name || null
    })
    .catch(() => null)

  return { subscription: subs[0], plan, expireAt: expireAt.toISOString() }
}

/* ---------------------------------------------------------------- 续费/取消 */

async function renewSubscription(uid, planCode, orderNo) {
  // 续费 = 生成新订单（activateSubscription 会自动顺延）
  return createSubscriptionOrder(uid, planCode, { renew: true })
}

async function cancelSubscription(uid) {
  const sub = await getMySubscription(uid)
  if (!sub) throw new Error('当前没有有效会员')
  await cloud.database
    .from('member_subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), auto_renew: false })
    .eq('id', sub.id)
  await cloud.database
    .from('membership_logs')
    .insert({
      user_id: uid,
      action: 'cancel',
      plan_code: sub.plan_code,
      detail: '用户主动取消会员'
    })
    .catch(() => null)
  return { ok: true }
}

/* ---------------------------------------------------------------- 保证金 */

async function getMyDeposit(uid) {
  if (!uid) return null
  const res = await cloud.database
    .from('provider_deposits')
    .select('*')
    .eq('user_id', uid)
    .in('status', ['held', 'partial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return unwrap(res, '')
}

/** 保证金退款（管理员操作：退出接单或平台解约） */
async function refundDeposit(uid, adminUid, adminName, note) {
  const dep = await getMyDeposit(uid)
  if (!dep) throw new Error('没有可退还的保证金')
  await cloud.database
    .from('provider_deposits')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      note: note || '平台退还保证金'
    })
    .eq('id', dep.id)
  await cloud.database
    .from('membership_logs')
    .insert({
      user_id: uid,
      action: 'deposit_refund',
      detail: note || '平台退还保证金',
      amount_cents: -Number(dep.amount_cents || 0),
      operator_uid: adminUid || null,
      operator_name: adminName || null
    })
    .catch(() => null)
  return { ok: true, amount: dep.amount_cents }
}

/* ---------------------------------------------------------------- 查询记录 */

async function listMyPaymentOrders(uid, limit) {
  if (!uid) return []
  const res = await cloud.database
    .from('member_payment_orders')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit || 20)
  return unwrap(res, '记录加载失败') || []
}

async function listMyMembershipLogs(uid, limit) {
  if (!uid) return []
  const res = await cloud.database
    .from('membership_logs')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit || 30)
  return unwrap(res, '记录加载失败') || []
}

module.exports = {
  listPlans,
  getPlan,
  getMySubscription,
  getMembershipStatus,
  isActive,
  createSubscriptionOrder,
  activateSubscription,
  renewSubscription,
  cancelSubscription,
  getMyDeposit,
  refundDeposit,
  listMyPaymentOrders,
  listMyMembershipLogs
}
