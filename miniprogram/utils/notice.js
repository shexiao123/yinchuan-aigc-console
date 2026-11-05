/**
 * 平台公告（小程序端）
 *
 * 与网页端共用 public.announcements 表结构，但小程序连接的是自己的独立库，
 * 所以两边公告各自维护。只取启用且处于投放期内的公告；云端失败返回空数组，
 * 首页公告条自动隐藏，不展示假消息。
 */
const { cloud } = require('./cloud')

const FIELDS = 'id,title,content,tag,level,link,sort_order,is_pinned,is_active,starts_at,ends_at,created_at'

function inWindow(a) {
  const now = Date.now()
  const from = a.starts_at ? new Date(a.starts_at).getTime() : 0
  const to = a.ends_at ? new Date(a.ends_at).getTime() : Infinity
  return now >= from && now <= to
}

async function listAnnouncements() {
  try {
    const res = await cloud.database
      .from('announcements')
      .select(FIELDS)
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .limit(50)
    if (res && res.error) return []
    const rows = (res && res.data) || []
    return rows
      .filter(inWindow)
      .sort((a, b) =>
        Number(!!b.is_pinned) - Number(!!a.is_pinned) ||
        (Number(b.sort_order) || 0) - (Number(a.sort_order) || 0) ||
        (Number(b.id) || 0) - (Number(a.id) || 0)
      )
      .slice(0, 12)
      .map((a) => ({
        ...a,
        levelClass: a.level === 'important' ? 'nt-important' : a.level === 'activity' ? 'nt-activity' : 'nt-info'
      }))
  } catch (e) {
    return []
  }
}

module.exports = { listAnnouncements }
