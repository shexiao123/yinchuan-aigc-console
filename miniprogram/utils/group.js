/**
 * 群聊（多人房间）
 *
 * 表：chat_groups / chat_group_members / chat_messages
 * owner_id、user_id、sender_id 一律由数据库 DEFAULT auth.uid() 填充，
 * 前端不传，避免与 RLS WITH CHECK 冲突或被伪造身份。
 */
const { cloud } = require('./cloud')
const { unwrap } = require('./util')

function currentUid() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  return session && session.user ? session.user.id : ''
}

function currentName() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const u = session && session.user ? session.user : {}
  return u.name || u.nickname || '群成员'
}

function currentAvatar() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const u = session && session.user ? session.user : {}
  return u.avatarUrl || u.avatar || ''
}

/** 群列表，附带实时成员数与最新一条消息 */
async function listGroups() {
  const res = await cloud.database
    .from('chat_groups')
    .select('*')
    .eq('status', 'active')
    .order('id', { ascending: true })
    .limit(50)
  const groups = unwrap(res, '群聊加载失败') || []
  if (!groups.length) return []

  // 不用 in()，全量取回后本地聚合，兼容小程序 SDK 的查询能力边界
  const [memRes, msgRes] = await Promise.all([
    cloud.database.from('chat_group_members').select('group_id').limit(1000),
    cloud.database
      .from('chat_messages')
      .select('group_id, content, created_at, sender_name')
      .eq('status', 'normal')
      .order('id', { ascending: false })
      .limit(300)
  ])
  const members = unwrap(memRes, '') || []
  const msgs = unwrap(msgRes, '') || []
  const memberMap = {}
  members.forEach((m) => {
    memberMap[m.group_id] = (memberMap[m.group_id] || 0) + 1
  })
  const lastMap = {}
  msgs.forEach((m) => {
    if (!lastMap[m.group_id]) lastMap[m.group_id] = m
  })
  return groups.map((g) => ({
    ...g,
    live_member_count: memberMap[g.id] || 0,
    last: lastMap[g.id] || null
  }))
}

async function getGroup(groupId) {
  if (!groupId) return null
  const res = await cloud.database.from('chat_groups').select('*').eq('id', groupId).maybeSingle()
  return unwrap(res, '群聊不存在') || null
}

/** 建群（自动入群 + 发一条建群提示） */
async function createGroup(payload) {
  const uid = currentUid()
  if (!uid) throw new Error('请先登录后再创建群聊')
  const name = String((payload && payload.name) || '').trim()
  if (!name) throw new Error('群名称不能为空')
  if (name.length > 30) throw new Error('群名称不能超过 30 字')
  const slug = 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
  const res = await cloud.database
    .from('chat_groups')
    .insert({
      name,
      slug,
      icon: String((payload && payload.icon) || '💬').slice(0, 8),
      description: String((payload && payload.description) || '').trim().slice(0, 200),
      owner_name: currentName(),
      visibility: 'public',
      status: 'active'
    })
    .select()
  const rows = unwrap(res, '创建群聊失败')
  const g = rows && rows[0]
  if (g) {
    await joinGroup(g.id).catch(() => null)
    await sendMessage(g.id, `群「${name}」已创建，欢迎大家发言。`, 'system').catch(() => null)
  }
  return g
}

/** 加入群（幂等） */
async function joinGroup(groupId) {
  const uid = currentUid()
  if (!uid || !groupId) return null
  const existingRes = await cloud.database
    .from('chat_group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', uid)
    .maybeSingle()
  const existing = unwrap(existingRes, '')
  if (existing) return existing
  try {
    const res = await cloud.database
      .from('chat_group_members')
      .insert({
        group_id: groupId,
        user_name: currentName(),
        user_avatar: currentAvatar()
      })
      .select()
    const rows = unwrap(res, '')
    return (rows && rows[0]) || null
  } catch (e) {
    // 唯一键冲突：同一瞬间重复加入，视为已加入
    return null
  }
}

async function listMembers(groupId) {
  if (!groupId) return []
  const res = await cloud.database
    .from('chat_group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('id', { ascending: true })
    .limit(200)
  return unwrap(res, '成员加载失败') || []
}

/** 最近 N 条消息，按时间升序 */
async function listMessages(groupId, limit) {
  if (!groupId) return []
  const res = await cloud.database
    .from('chat_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('id', { ascending: false })
    .limit(limit || 60)
  const rows = unwrap(res, '消息加载失败') || []
  return rows.reverse()
}

/** 发消息（自动确保已入群） */
async function sendMessage(groupId, content, senderRole) {
  const uid = currentUid()
  if (!uid) throw new Error('请先登录后再发言')
  const text = String(content || '').trim()
  if (!text) throw new Error('消息不能为空')
  if (text.length > 1000) throw new Error('单条消息不能超过 1000 字')
  if (senderRole !== 'system') await joinGroup(groupId).catch(() => null)
  const res = await cloud.database
    .from('chat_messages')
    .insert({
      group_id: groupId,
      sender_name: senderRole === 'system' ? '平台助手' : currentName(),
      sender_avatar: senderRole === 'system' ? '' : currentAvatar(),
      sender_role: senderRole || 'member',
      content: text,
      message_type: 'text',
      status: 'normal'
    })
    .select()
  const rows = unwrap(res, '发送失败')
  return (rows && rows[0]) || null
}

async function markRead(groupId) {
  const uid = currentUid()
  if (!uid || !groupId) return
  try {
    await cloud.database
      .from('chat_group_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .eq('user_id', uid)
  } catch (e) {
    // 已读失败不影响阅读
  }
}

module.exports = {
  currentUid,
  currentName,
  currentAvatar,
  listGroups,
  getGroup,
  createGroup,
  joinGroup,
  listMembers,
  listMessages,
  sendMessage,
  markRead
}
