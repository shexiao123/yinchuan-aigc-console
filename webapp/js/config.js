/**
 * 运行时配置
 * publicConfig 由 WorkBuddy 云服务在激活时下发，切勿手写或从别处推断。
 */
window.APP_CONFIG = {
  publicConfig: {
    endpoint: 'https://guangying-web.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_ljDFUAeoNoNPMqrfAZpbEV_dw2NNFdJXAPww2ncGRAv3RvXicynHHtb'
  }
}

// 客户端初始化：一次性创建，auth / database / storage / llm 共用
window.cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
  endpoint: window.APP_CONFIG.publicConfig.endpoint,
  oauthRelayBaseUrl: window.APP_CONFIG.publicConfig.oauthRelayBaseUrl,
  publishableKey: window.APP_CONFIG.publicConfig.publishableKey
})
