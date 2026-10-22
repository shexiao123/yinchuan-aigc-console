/**
 * 运行时配置
 * publicConfig 由 WorkBuddy 云服务在激活时下发，切勿手写或从别处推断。
 */
window.APP_CONFIG = {
  publicConfig: {
    // 主端点用 mp-api：这是平台的通用云服务端点，跨应用可用且稳定。
    // 原先用的 guangying-web.app.workbuddy.host（应用自己的站点域名）已 DNS 解析失败。
    endpoint: 'https://mp-api.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_ljDFUAeoNoNPMqrfAZpbEV_dw2NNFdJXAPww2ncGRAv3RvXicynHHtb'
  },

  /**
   * 备用端点（主域名不可用时按顺序尝试）
   * 每个端点对应同一套 publishableKey；平台侧域名异常时用来兜底。
   */
  fallbackEndpoints: [
    'https://mp-api.app.workbuddy.host',
    'https://guangying-web.app.workbuddy.host'
  ],

  /**
   * 端点不可用时的兜底提示
   * 平台分配的域名解析失败时，前端无法自行修复，只能提示用户稍后重试。
   */
  endpointFailureHint:
    '服务暂时无法连接（域名解析失败）。这通常是平台侧临时故障，请稍后刷新重试；小程序端不受影响。'
}

/**
 * 创建云服务 client
 *
 * 注意：SDK 是异步加载的 CDN 脚本，config.js 与它同步执行时可能还没就绪
 * （GitHub Pages 等外部环境更容易触发）。所以这里做两件事：
 *   1. 若 SDK 未就绪，等它就绪后再创建
 *   2. 创建完成的信号用 window.cloudReady 通知（Promise）
 */
window.cloudReady = (function () {
  function create() {
    window.cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: window.APP_CONFIG.publicConfig.endpoint,
      oauthRelayBaseUrl: window.APP_CONFIG.publicConfig.oauthRelayBaseUrl,
      publishableKey: window.APP_CONFIG.publicConfig.publishableKey
    })
    return window.cloud
  }

  // SDK 已就绪 —— 立即创建
  if (window.WorkBuddyCloud && typeof window.WorkBuddyCloud.createWorkBuddyCloud === 'function') {
    try {
      create()
      return Promise.resolve(window.cloud)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  // SDK 未就绪 —— 轮询等待（最多 10 秒）
  return new Promise((resolve, reject) => {
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      if (window.WorkBuddyCloud && typeof window.WorkBuddyCloud.createWorkBuddyCloud === 'function') {
        clearInterval(timer)
        try {
          resolve(create())
        } catch (e) {
          reject(e)
        }
      } else if (tries > 100) {
        clearInterval(timer)
        reject(new Error('云服务 SDK 加载超时，请检查网络后刷新重试'))
      }
    }, 100)
  })
})()

/**
 * 端点故障转移
 *
 * 背景：平台为应用分配的域名可能临时解析失败（DNS 波动或域名回收），
 * 此时页面白屏、所有数据请求失败。SDK 的 client 在创建时绑定了 endpoint，
 * 换端点需要重建 client。
 *
 * 做法：探测各端点可达性（用 database 的轻量查询），
 *      第一个通的即重建 client 并替换 window.cloud。
 */
(function () {
  const CFG = window.APP_CONFIG
  let switching = false

  /** 探测某个端点是否可用 */
  async function probe(endpoint, timeoutMs) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 6000)
    try {
      const res = await fetch(endpoint + '/.cloud/database/rest/platform_settings?select=id&limit=1', {
        method: 'GET',
        signal: ctrl.signal,
        headers: {
          // 鉴权头名必须是 x-wb-webapp-access-key（用 apikey 会 401）
          'x-wb-webapp-access-key': CFG.publicConfig.publishableKey,
          'x-client-info': 'workbuddy-web-sdk'
        }
      })
      // 401 说明端点活着只是鉴权没过；能拿到任何 HTTP 响应就说明网络通
      return res.status > 0
    } catch (e) {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  /** 用指定端点重建 cloud client */
  function rebuild(endpoint) {
    window.cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint,
      oauthRelayBaseUrl: CFG.publicConfig.oauthRelayBaseUrl,
      publishableKey: CFG.publicConfig.publishableKey
    })
    CFG.publicConfig.endpoint = endpoint
    CFG.activeEndpoint = endpoint
  }

  /**
   * 确保当前端点可用；不可用则切到备用端点。
   * @returns {Promise<string>} 最终使用的端点
   */
  window.ensureEndpoint = async function () {
    if (switching) return CFG.publicConfig.endpoint
    const list = CFG.fallbackEndpoints || []
    if (!list.length) return CFG.publicConfig.endpoint

    // 当前端点先探一次
    const current = CFG.publicConfig.endpoint
    if (await probe(current, 5000)) return current

    // 依次尝试备用
    switching = true
    try {
      for (const ep of list) {
        if (ep === current) continue
        // eslint-disable-next-line no-await-in-loop
        if (await probe(ep, 6000)) {
          rebuild(ep)
          console.warn('[cloud] 主端点不可用，已切换到：' + ep)
          return ep
        }
      }
    } finally {
      switching = false
    }
    return current
  }
})()
