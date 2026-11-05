/**
 * 平台在线人数（小程序端心跳）
 *
 * 与网页端共用同一套 RPC：online_presence_beat() 上报心跳并返回
 * 「近 2 分钟活跃会话数」。小程序是独立库，因此统计的是小程序端在线数。
 * 会话标识存在 wx storage，冷启动不会重复计数；失败返回 null，不编造数字。
 */
const { cloud } = require('./cloud')

const SID_KEY = 'wb_online_sid'

function sessionId() {
  let sid = ''
  try { sid = wx.getStorageSync(SID_KEY) || '' } catch (e) {}
  if (!sid) {
    sid = 'mp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)
    try { wx.setStorageSync(SID_KEY, sid) } catch (e) {}
  }
  return sid
}

async function reportOnline(page) {
  try {
    const res = await cloud.database.rpc('online_presence_beat', {
      p_session_key: sessionId(),
      p_channel: 'mp',
      p_page: String(page || 'pages/index/index').slice(0, 120)
    })
    if (res && res.error) return null
    const row = res && res.data && res.data[0]
    return row ? Number(row.online_count) || 0 : null
  } catch (e) {
    return null
  }
}

module.exports = { reportOnline }
