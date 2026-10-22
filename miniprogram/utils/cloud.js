const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram')
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics')

// publicConfig 由 WorkBuddy 云服务在激活时下发，切勿手写或从别处推断
const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_NPfdYpGfbDWvkcfEnOHVJB_m2XNnTfugIqkB9XCrVoC1PNFK8SQTxGP'
}

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
  wx: createDiagnosticWx(wx)
})

module.exports = { cloud, publicConfig }
