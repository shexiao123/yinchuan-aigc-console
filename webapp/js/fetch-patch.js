/**
 * 云存储上传的 CORS 兜底（必须在云 SDK 之前加载）
 *
 * 平台网关的 CORS 预检白名单很窄，SDK 上传时会带 x-client-info、x-upsert、
 * x-metadata-* 等自定义头，在 http://127.0.0.1:8899 这类跨域环境下，
 * storage.upload 的预检被浏览器直接拒绝，报 "Failed to fetch"。
 * 线上同源不走预检，不受影响；但本地双端要能传视频，必须在这里收窄请求头。
 *
 * 做法：存储类请求只保留服务端必需的白名单头（鉴权 / 内容类型），
 * 其余自定义头摘掉。upsert 用随机路径本来就不需要，metadata 只是附加信息。
 * 非存储请求只摘 x-client-info，其余原样保留，避免影响现有 REST 调用。
 */
;(function () {
  'use strict'
  if (window.__wbFetchPatched) return
  window.__wbFetchPatched = true

  var raw = window.fetch
  if (typeof raw !== 'function' || typeof Headers === 'undefined') return

  var STORAGE_RE = /\.cloud\/storage\//
  var ALLOW = ['x-wb-webapp-access-key', 'authorization', 'content-type', 'accept']

  function urlOf(input) {
    if (typeof input === 'string') return input
    if (input && typeof input.url === 'string') return input.url
    return ''
  }

  window.fetch = function (input, init) {
    try {
      if (init && init.headers) {
        var h = new Headers(init.headers)
        var isStorage = STORAGE_RE.test(urlOf(input)) || STORAGE_RE.test(urlOf(init && init.__wbUrl))
        if (isStorage) {
          var drop = []
          h.forEach(function (_v, k) { if (ALLOW.indexOf(k.toLowerCase()) < 0) drop.push(k) })
          drop.forEach(function (k) { h.delete(k) })
        } else {
          h.delete('x-client-info')
        }
        init = Object.assign({}, init, { headers: h })
      }
    } catch (e) {
      // 兜底逻辑绝不能影响正常请求
    }
    return raw.call(window, input, init)
  }
})()
