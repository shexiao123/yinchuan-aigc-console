/**
 * 人工客服（在线会话）
 *
 * 角色划分：
 *   customer — 客户，只能看自己的会话
 *   staff    — 客服/管理员（staff 表里的人），能看全部会话并回复
 *
 * 客户侧：createConversation / listMyConversations / getConversation / sendMessage / closeConversation
 * 客服侧：listAllConversations / assignConversation / replyMessage
 */
const { cloud } = require('./cloud')
const { unwrap } = require('./util')

/** 当前登录用户 uid */
function currentUid() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  return session && session.user ? session.user.id : ''
}

/** 当前用户显示名 */
function currentName() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const u = session && session.user ? session.user : {}
  return u.name || u.nickname || '客户'
}

/** 当前用户头像 */
function currentAvatar() {
  const app = getApp()
  const session = app && app.globalData ? app.globalData.session : null
  const u = session && session.user ? session.user : {}
  return u.avatarUrl || u.avatar || ''
}

/** 是否客服（staff 表里的人） */
async function isSupportStaff() {
  const uid = currentUid()
  if (!uid) return false
  const res = await cloud.database.from('staff').select('uid, name, role').eq('uid', uid).maybeSingle()
  return !!(unwrap(res, ''))
}

/* ---------------------------------------------------------------- 客户侧 */

/**
 * 取得（必要时创建）当前用户的客服会话。
 * 一个客户同时只有一个进行中的会话，关闭后可以再开。
 */
async function createConversation(subject) {
  const uid = currentUid()
  if (!uid) throw new Error('请先登录后再联系客服')

  // 先找有没有进行中的会话
  const existing = await cloud.database
    .from('support_conversations')
    .select('*')
    .eq('customer_id', uid)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(1)
  const rows = unwrap(existing, '') || []
  if (rows.length) return rows[0]

  const res = await cloud.database
    .from('support_conversations')
    .insert({
      customer_id: uid,
      customer_name: currentName(),
      customer_avatar: currentAvatar(),
      subject: subject || '在线咨询',
      status: 'open'
    })
    .select()
  const created = unwrap(res, '发起咨询失败')
  return created && created[0]
}

/** 我的会话列表（客服侧看不到自己发的以外的人） */
async function listMyConversations() {
  const uid = currentUid()
  if (!uid) return []
  const res = await cloud.database
    .from('support_conversations')
    .select('*')
    .eq('customer_id', uid)
    .order('updated_at', { ascending: false })
    .limit(50)
  return unwrap(res, '会话加载失败') || []
}

/** 全部会话（客服/管理员用） */
async function listAllConversations(status) {
  let query = cloud.database.from('support_conversations').select('*')
  if (status) query = query.eq('status', status)
  const res = await query.order('updated_at', { ascending: false }).limit(200)
  return unwrap(res, '会话列表加载失败') || []
}

/** 会话详情（含消息） */
async function getConversation(conversationId) {
  if (!conversationId) return null
  const convRes = await cloud.database
    .from('support_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  const conv = unwrap(convRes, '')
  if (!conv) return null

  const msgRes = await cloud.database
    .from('support_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)
  const messages = unwrap(msgRes, '消息加载失败') || []

  return { conversation: conv, messages }
}

/**
 * 发消息。
 * @param {number} conversationId
 * @param {string} content
 * @param {string} senderRole customer | staff
 * @param {string} senderName
 */
async function sendMessage(conversationId, content, senderRole, senderName) {
  const text = String(content || '').trim()
  if (!text) throw new Error('消息不能为空')
  if (text.length > 1000) throw new Error('单条消息不能超过 1000 字')

  const role = senderRole || 'customer'
  const name = senderName || (role === 'staff' ? '平台客服' : currentName())

  const res = await cloud.database
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      sender_role: role,
      sender_id: currentUid(),
      sender_name: name,
      content: text,
      message_type: 'text'
    })
    .select()
  const rows = unwrap(res, '发送失败')
  const message = rows && rows[0]
  if (!message) return null

  // 更新会话摘要与未读数
  // 未读数用「先读后写」的方式自增（SDK 的 update 走直接赋值，不依赖表达式语法）
  const now = new Date().toISOString()
  const incField = role === 'staff' ? 'unread_for_customer' : 'unread_for_staff'
  let currentCount = 0
  try {
    const cur = await cloud.database
      .from('support_conversations')
      .select('unread_for_customer, unread_for_staff')
      .eq('id', conversationId)
      .maybeSingle()
    const row = unwrap(cur, '') || {}
    currentCount = Number(row[incField] || 0)
  } catch (e) {
    currentCount = 0
  }

  await cloud.database
    .from('support_conversations')
    .update({
      last_message: text.slice(0, 80),
      last_message_at: now,
      updated_at: now,
      [incField]: currentCount + 1
    })
    .eq('id', conversationId)
    .catch(() => null)

  return message
}

/** 标记会话已读（清零对方未读数） */
async function markConversationRead(conversationId, role) {
  if (!conversationId) return
  const field = role === 'staff' ? 'unread_for_staff' : 'unread_for_customer'
  try {
    await cloud.database.from('support_conversations').update({ [field]: 0 }).eq('id', conversationId)
  } catch (e) {
    // 已读失败不影响阅读
  }
}

/** 关闭会话（客户可主动结束） */
async function closeConversation(conversationId) {
  const res = await cloud.database
    .from('support_conversations')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', conversationId)
    .select()
  const rows = unwrap(res, '关闭会话失败')
  return rows && rows[0]
}

/** 客服接单（认领会话） */
async function assignConversation(conversationId, staffUid, staffName) {
  const res = await cloud.database
    .from('support_conversations')
    .update({
      assigned_to: staffUid || currentUid(),
      assigned_to_name: staffName || '平台客服',
      updated_at: new Date().toISOString()
    })
    .eq('id', conversationId)
    .select()
  const rows = unwrap(res, '接单失败')
  return rows && rows[0]
}

/** 客服工作台统计 */
async function supportStats() {
  const rows = await listAllConversations()
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === 'open').length,
    closed: rows.filter((r) => r.status === 'closed').length,
    unread: rows.reduce((sum, r) => sum + Number(r.unread_for_staff || 0), 0)
  }
}

module.exports = {
  currentUid,
  currentName,
  currentAvatar,
  isSupportStaff,
  createConversation,
  listMyConversations,
  listAllConversations,
  getConversation,
  sendMessage,
  markConversationRead,
  closeConversation,
  assignConversation,
  supportStats
}
