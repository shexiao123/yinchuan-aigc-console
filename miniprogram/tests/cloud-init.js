/**
 * 云客户端初始化冒烟测试
 * 运行：node tests/cloud-init.js
 * 在模拟的微信小程序运行时中验证 SDK 能正确初始化、四个模块齐备。
 */
const path = require('path')
const Module = require('module')

// 模拟 wx 运行时
global.wx = {
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wx-test-appid' } }),
  request: (options) => {
    if (options.fail) options.fail({ errMsg: 'request:fail mock' })
    return {
      abort() {},
      onHeadersReceived() {},
      offHeadersReceived() {}
    }
  },
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  getFileSystemManager: () => ({ readFile() {}, writeFile() {} })
}

// 让 require 能解析 @tencent-ai/workbuddy-cloud-sdk/miniprogram
const ROOT = path.resolve(__dirname, '..')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === '@tencent-ai/workbuddy-cloud-sdk/miniprogram') {
    return origResolve.call(this, path.join(ROOT, 'node_modules/@tencent-ai/workbuddy-cloud-sdk/lib/miniprogram.cjs'), ...args)
  }
  return origResolve.call(this, request, ...args)
}

const problems = []

const { cloud, publicConfig } = require(path.join(ROOT, 'utils', 'cloud.js'))

if (!cloud) problems.push('cloud 客户端未导出')
if (!publicConfig.endpoint) problems.push('publicConfig.endpoint 缺失')
if (!publicConfig.publishableKey) problems.push('publicConfig.publishableKey 缺失')
if (publicConfig.endpoint && !/^https:\/\//.test(publicConfig.endpoint)) {
  problems.push('endpoint 必须是 https 地址')
}

;['auth', 'database', 'storage', 'llm'].forEach((mod) => {
  if (!cloud[mod] || typeof cloud[mod] !== 'object') {
    problems.push(`cloud.${mod} 模块缺失`)
  }
})

// 校验 auth 模块暴露了小程序需要的登录方法
const authMethods = ['getSession', 'signInWithWechat', 'signOut', 'onAuthStateChange']
if (cloud.auth) {
  authMethods.forEach((m) => {
    if (typeof cloud.auth[m] !== 'function') {
      problems.push(`cloud.auth.${m} 不可用`)
    }
  })
}

// 校验 database 模块暴露了查询构造器
if (cloud.database) {
  ;['from', 'rpc'].forEach((m) => {
    if (typeof cloud.database[m] !== 'function') {
      problems.push(`cloud.database.${m} 不可用`)
    }
  })
}

console.log('=== 云客户端初始化测试 ===')
console.log('  · endpoint:', publicConfig.endpoint)
console.log('  · auth/database/storage/llm 模块齐备')
console.log('')
if (problems.length) {
  console.log('发现 ' + problems.length + ' 个问题：')
  problems.forEach((p) => console.log('  ✗ ' + p))
  process.exit(1)
}
console.log('云客户端初始化正常 ✓')
