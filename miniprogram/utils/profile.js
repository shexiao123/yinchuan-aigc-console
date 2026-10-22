/**
 * 用户资料
 *
 * 「我的」页的核心能力：昵称、头像、简介、城市、标签、手机号、隐私开关。
 * 资料存在 user_profiles 表，通过 user_id 关联 auth 用户。
 */
const { cloud } = require('./cloud')
const { unwrap } = require('./util')

/** 读取我的资料（没有就返回默认值，不报错） */
async function getMyProfile(uid) {
  if (!uid) return null
  const res = await cloud.database
    .from('user_profiles')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle()
  const row = unwrap(res, null)
  if (row) return row
  // 没建过资料时返回一份默认的（未落库）
  return {
    id: null,
    user_id: uid,
    nickname: '',
    avatar_url: null,
    bio: '',
    city: '银川',
    phone: null,
    gender: '',
    birthday: null,
    tags: [],
    show_phone: false,
    show_city: true,
    is_verified: false,
    created_at: null,
    updated_at: null
  }
}

/**
 * 保存我的资料。
 * 有则更新，无则插入（upsert）。
 * @param {string} uid
 * @param {object} patch 要更新的字段
 */
async function saveMyProfile(uid, patch) {
  if (!uid) throw new Error('请先登录')
  const p = patch || {}

  // 白名单：只允许改这些字段，防止越权写 user_id / is_verified
  const allowed = ['nickname', 'avatar_url', 'bio', 'city', 'phone', 'gender', 'birthday', 'tags', 'show_phone', 'show_city']
  const data = {}
  allowed.forEach((k) => {
    if (p[k] !== undefined) data[k] = p[k]
  })

  // 昵称必填校验
  if (data.nickname !== undefined && !String(data.nickname || '').trim()) {
    throw new Error('昵称不能为空')
  }
  // 简介长度限制
  if (data.bio !== undefined && String(data.bio).length > 200) {
    throw new Error('个人简介不能超过 200 字')
  }
  // 标签数量与长度
  if (data.tags !== undefined) {
    const tags = (data.tags || []).map((t) => String(t).trim()).filter(Boolean)
    if (tags.length > 8) throw new Error('最多设置 8 个标签')
    data.tags = tags.map((t) => t.slice(0, 12))
  }
  // 手机号格式
  if (data.phone) {
    const ph = String(data.phone).replace(/\s/g, '')
    if (!/^1\d{10}$/.test(ph)) throw new Error('请输入正确的 11 位手机号')
    data.phone = ph
  }
  if (data.nickname !== undefined) data.nickname = String(data.nickname).trim().slice(0, 20)
  if (data.city !== undefined) data.city = String(data.city).trim().slice(0, 20) || '银川'
  data.updated_at = new Date().toISOString()

  // 先查有没有
  const cur = await cloud.database
    .from('user_profiles')
    .select('id')
    .eq('user_id', uid)
    .maybeSingle()
  const existing = unwrap(cur, null)

  if (existing) {
    const res = await cloud.database
      .from('user_profiles')
      .update(data)
      .eq('user_id', uid)
      .select()
    const rows = unwrap(res, '保存失败')
    if (!rows || !rows.length) throw new Error('保存失败')
    return rows[0]
  }

  const res = await cloud.database
    .from('user_profiles')
    .insert({ user_id: uid, ...data })
    .select()
  const rows = unwrap(res, '保存失败')
  if (!rows || !rows.length) throw new Error('保存失败')
  return rows[0]
}

/** 更新头像（存的是云存储地址） */
async function updateAvatar(uid, avatarUrl) {
  if (!uid) throw new Error('请先登录')
  return saveMyProfile(uid, { avatar_url: avatarUrl || null })
}

/** 资料完整度（0-100），用于「我的」页提示用户补全 */
function profileCompleteness(profile) {
  if (!profile) return 0
  const items = [
    { ok: !!String(profile.nickname || '').trim(), w: 25 },
    { ok: !!profile.avatar_url, w: 25 },
    { ok: !!String(profile.bio || '').trim(), w: 20 },
    { ok: !!String(profile.city || '').trim(), w: 10 },
    { ok: (profile.tags || []).length > 0, w: 10 },
    { ok: !!profile.phone, w: 10 }
  ]
  const got = items.reduce((s, i) => s + (i.ok ? i.w : 0), 0)
  return got
}

/** 还没填的字段（引导文案） */
function profileMissing(profile) {
  if (!profile) return ['昵称']
  const miss = []
  if (!String(profile.nickname || '').trim()) miss.push('昵称')
  if (!profile.avatar_url) miss.push('头像')
  if (!String(profile.bio || '').trim()) miss.push('个人简介')
  if (!(profile.tags || []).length) miss.push('擅长方向')
  return miss
}

module.exports = {
  getMyProfile,
  saveMyProfile,
  updateAvatar,
  profileCompleteness,
  profileMissing
}
