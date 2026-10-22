/**
 * 佣金计算
 *
 * 平台佣金率规则（2026-10-22 起）：
 *   - 全局基准 commission_rate = 10%（platform_settings.commission_rate）
 *   - 10% 是**起步价**：没有会员的服务者按下单时平台设置的基准抽成
 *   - 会员按档位享受更低的佣金（基础 10% / 专业 8% / 工作室 5%）
 *   - 佣金永远**从服务者的应得部分里抽**，不是额外加价给客户
 *
 * 为什么放在服务端算：客户端传来的 platform_fee 不可信，
 * 真正的抽成必须在 createOrder 落库前由服务端根据服务者档位重算。
 */

/** 平台基准佣金率（未开通会员 / 无服务者时的兜底） */
const BASE_COMMISSION = 0.1

/** 各档位佣金率 —— 与 member_plans.commission_rate 保持一致 */
const TIER_COMMISSION = {
  basic: 0.1,
  pro: 0.08,
  studio: 0.05
}

/** 会员最低佣金率（保底，不会低于此值） */
const MIN_COMMISSION = 0.05

/**
 * 取服务者当前的佣金率。
 *
 * 优先走数据库 RPC（resolve_commission_rate）——它带 SECURITY DEFINER，
 * 不受 RLS 限制，能正确读到「别人的」订阅（客户看别人的服务时也要算佣金）。
 * RPC 不可用时回退到本地解析（只能读到自己的订阅，仅供本人场景使用）。
 *
 * @param {object} db cloud.database 句柄
 * @param {number|null} providerId 服务者 id（公开需求池为空）
 * @param {string} providerOwnerId 服务者所属用户 uid
 * @param {number} baseRate 平台基准（来自 platform_settings）
 * @returns {Promise<{rate:number, tier:string, isMember:boolean}>}
 */
async function resolveCommissionRate(db, providerId, providerOwnerId, baseRate) {
  const base = Number(baseRate || BASE_COMMISSION)

  // 公开需求池：还没指定服务者，按平台基准
  if (!providerId && !providerOwnerId) {
    return { rate: base, tier: 'none', isMember: false }
  }

  // 优先走 RPC
  try {
    const res = await db.rpc('resolve_commission_rate', {
      p_provider_id: providerId || null,
      p_provider_owner_id: providerOwnerId || null,
      p_base_rate: base
    })
    const row = res && res.data && res.data[0]
    if (row) {
      return {
        rate: Number(row.rate || base),
        tier: row.tier || 'none',
        isMember: row.is_member === true
      }
    }
  } catch (e) {
    // RPC 未部署或无权限 → 回退本地
  }

  // 回退：本地解析（只能读到自己的订阅）
  let ownerId = providerOwnerId || ''
  if (!ownerId && providerId) {
    const provRes = await db
      .from('providers')
      .select('owner_id')
      .eq('id', providerId)
      .maybeSingle()
    const prov = provRes && provRes.data
    ownerId = (prov && prov.owner_id) || ''
  }
  if (!ownerId) {
    return { rate: base, tier: 'none', isMember: false }
  }

  const subRes = await db
    .from('member_subscriptions')
    .select('tier, status, expire_at')
    .eq('user_id', ownerId)
    .eq('status', 'active')
    .order('expire_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sub = subRes && subRes.data
  if (!sub || new Date(sub.expire_at).getTime() <= Date.now()) {
    return { rate: base, tier: 'none', isMember: false }
  }

  const tierRate = TIER_COMMISSION[sub.tier]
  const rate = typeof tierRate === 'number' ? tierRate : base
  return {
    rate: Math.max(MIN_COMMISSION, Math.min(rate, base)),
    tier: sub.tier,
    isMember: true
  }
}

/**
 * 按佣金率算平台服务费。
 * @param {number} amount 订单金额（分）
 * @param {number} rate 佣金率
 * @returns {number} 服务费（分）
 */
function calcPlatformFee(amount, rate) {
  const amt = Number(amount || 0)
  const r = Number(rate || 0)
  if (amt <= 0) return 0
  return Math.round(amt * r)
}

module.exports = {
  BASE_COMMISSION,
  TIER_COMMISSION,
  MIN_COMMISSION,
  resolveCommissionRate,
  calcPlatformFee
}
