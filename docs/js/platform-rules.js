/**
 * 平台规则文案里的抽成比例，与 platform_settings.commission_rate 保持同步。
 *
 * 背景：平台规则是手填的 textarea，管理员改了抽成比例但忘了改文案，
 * 客户端就会显示过期的费率（比如费率已改 10%，文案还写 8%）。
 *
 * 做法：只替换「收取 X% 服务费」这一段，会员档位那部分保持原样。
 */
;(function (global) {
  /**
   * 用新费率替换文案里的抽成比例
   * @param {string} notice 原文案
   * @param {number} rate 费率（0-1 的小数，或 0-100 的百分数）
   * @returns {string} 更新后的文案
   */
  function syncNoticeRate(notice, rate) {
    const text = String(notice || '')
    if (!text) return text
    const r = Number(rate)
    if (!Number.isFinite(r)) return text
    // 兼容 0-1 小数和 0-100 百分数两种输入
    const pct = Math.round(r <= 1 ? r * 100 : r)
    const formatted = (pct % 1 === 0 ? String(pct) : pct.toFixed(1))

    // 匹配「收取 8% 服务费」「收取 8％服务费」「8% 服务费」等常见写法
    const patterns = [
      /(收取|收)\s*\d+(?:\.\d+)?\s*[%％]\s*服务费/g,
      /平台服务费\s*[:：]?\s*\d+(?:\.\d+)?\s*[%％]/g,
      /抽成\s*\d+(?:\.\d+)?\s*[%％]/g
    ]
    let out = text
    patterns.forEach((re) => {
      out = out.replace(re, (m) => {
        // 保留原文的连接词，只换数字
        if (m.indexOf('收取') >= 0) return m.replace(/\d+(?:\.\d+)?/, formatted)
        if (m.indexOf('收') >= 0) return m.replace(/\d+(?:\.\d+)?/, formatted)
        if (m.indexOf('平台服务费') >= 0) return m.replace(/\d+(?:\.\d+)?/, formatted)
        return m.replace(/\d+(?:\.\d+)?/, formatted)
      })
    })
    return out
  }

  /**
   * 判断文案里的费率是否与实际费率一致
   * @param {string} notice
   * @param {number} rate
   * @returns {boolean}
   */
  function isNoticeRateSynced(notice, rate) {
    const text = String(notice || '')
    const r = Number(rate)
    if (!Number.isFinite(r)) return true
    const pct = Math.round(r <= 1 ? r * 100 : r)
    const m = text.match(/收取\s*(\d+(?:\.\d+)?)\s*[%％]\s*服务费/)
    if (!m) return true // 文案里没写费率，不算不一致
    return Math.round(Number(m[1])) === pct
  }

  global.PlatformRules = { syncNoticeRate, isNoticeRateSynced }
})(typeof window !== 'undefined' ? window : globalThis)
