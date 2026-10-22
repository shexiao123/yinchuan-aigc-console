/**
 * 佣金计算（网页端，与小程序端 miniprogram/utils/commission.js 规则一致）
 *
 * 平台佣金率规则（2026-10-22 起）：
 *   - 全局基准 10%（platform_settings.commission_rate）—— 这是起步价
 *   - 会员按档位更低：基础 10% / 专业 8% / 工作室 5%
 *   - 佣金从服务者收入里抽，不额外加价给客户
 */
const BASE_COMMISSION = 0.1

const TIER_COMMISSION = {
  basic: 0.1,
  pro: 0.08,
  studio: 0.05
}

const MIN_COMMISSION = 0.05

/**
 * 取服务者当前佣金率
 * @param {object} db cloud.database 句柄
 * @param {number|null} providerId
 * @param {string} providerOwnerId
 * @param {number} baseRate 平台基准
 */
async function resolveCommissionRate(db, providerId, providerOwnerId, baseRate) {
  const base = Number(baseRate || BASE_COMMISSION)

  if (!providerId && !providerOwnerId) {
    return { rate: base, tier: 'none', isMember: false }
  }

  let ownerId = providerOwnerId || ''
  if (!ownerId && providerId) {
    const provRes = await db.from('providers').select('owner_id').eq('id', providerId).maybeSingle()
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
    rate: Math.max(MIN_COMMISSION, rate),
    tier: sub.tier,
    isMember: true
  }
}

function calcPlatformFee(amount, rate) {
  const amt = Number(amount || 0)
  const r = Number(rate || 0)
  if (amt <= 0) return 0
  return Math.round(amt * r)
}
