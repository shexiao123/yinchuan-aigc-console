/**
 * 离线演示模式（只读快照）
 *
 * 背景：GitHub Pages 域名（shexiao123.github.io）不在平台云服务的 CORS
 * 白名单里，预检 403 —— 所有云请求在浏览器层面必然失败（平台侧策略，
 * 前端无法解除）。此前 boot() 检测到端点全不可达后直接渲染故障页，
 * 线上 Pages 因此「打不开」（只有一块报错卡）。
 *
 * 做法：boot() 检测到端点不可达时调用 window.enableOfflineMode()，
 * 把 window.cloud 替换成本文件的只读 mock —— api.js 通过动态 Proxy 取
 * window.cloud，无需任何改动即可透明切换。数据来自 js/seed-data.js
 * （tools/make-seed.py 生成的只读快照）。
 *
 * 能力边界：
 *   - 读（select/eq/order/limit/range/in/is/like/ilike/or/single）→ 查快照
 *   - 写（insert/update/delete/upsert）→ 返回 OFFLINE 错误，页面提示
 *   - 登录/上传/签名 → 返回错误或空会话，入口自然收敛为「请访问完整版」
 */
;(function () {
  'use strict'

  var OFFLINE_MSG = '离线演示模式：该操作需要连接云端，请访问完整版站点'
  var errRes = function () {
    return { data: null, error: { message: OFFLINE_MSG, code: 'OFFLINE_READONLY' } }
  }

  /** 宽松相等：数字/字符串形态差异兜底（id eq 1 vs "1"） */
  function cmp(a, b) {
    return a === b || String(a) === String(b)
  }

  /** SQL LIKE：仅支持 % 通配 */
  function likeMatch(val, pat, ci) {
    if (val == null) return false
    var parts = String(pat).split('%').map(function (x) {
      return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    var rx = new RegExp('^' + parts.join('.*') + '$', ci ? 'i' : '')
    return rx.test(String(val))
  }

  function enableOfflineMode() {
    // 幂等：已开启则跳过
    if (window.cloud && window.cloud.__offline) return
    if (!window.SEED_DATA) {
      console.error('[offline] 缺少 seed-data.js 快照，无法进入离线模式')
      return
    }
    var SEED = window.SEED_DATA

    /** 内存查询：实现 PostgREST 风格的链式 builder（thenable，可直接 await） */
    function query(table) {
      var st = { filters: [], order: null, limit: null, range: null, single: false }
      var q = {
        select: function () { return q },
        eq: function (c, v) { st.filters.push(function (r) { return cmp(r[c], v) }); return q },
        neq: function (c, v) { st.filters.push(function (r) { return !cmp(r[c], v) }); return q },
        gt: function (c, v) { st.filters.push(function (r) { return r[c] > v }); return q },
        gte: function (c, v) { st.filters.push(function (r) { return r[c] >= v }); return q },
        lt: function (c, v) { st.filters.push(function (r) { return r[c] < v }); return q },
        lte: function (c, v) { st.filters.push(function (r) { return r[c] <= v }); return q },
        in: function (c, arr) {
          st.filters.push(function (r) { return (arr || []).some(function (v) { return cmp(r[c], v) }) })
          return q
        },
        is: function (c, v) {
          st.filters.push(function (r) { return (r[c] == null) === (v == null) })
          return q
        },
        like: function (c, p) { st.filters.push(function (r) { return likeMatch(r[c], p, false) }); return q },
        ilike: function (c, p) { st.filters.push(function (r) { return likeMatch(r[c], p, true) }); return q },
        // PostgREST or 语法："col.eq.v,col.eq.v"（离线快照只按 eq 解析）
        or: function (expr) {
          var parts = String(expr || '').split(',').map(function (s) { return s.trim() }).filter(Boolean)
            .map(function (s) {
              var i = s.indexOf('.')
              var j = s.indexOf('.', i + 1)
              if (i < 0 || j < 0) return null
              return { col: s.slice(0, i), op: s.slice(i + 1, j), v: s.slice(j + 1) }
            })
            .filter(Boolean)
          st.filters.push(function (r) {
            return parts.some(function (p) { return p.op === 'eq' ? cmp(r[p.col], p.v) : false })
          })
          return q
        },
        order: function (c, opt) { st.order = [c, opt || {}]; return q },
        limit: function (n) { st.limit = n; return q },
        range: function (a, b) { st.range = [a, b]; return q },
        single: function () { st.single = true; return q },
        maybeSingle: function () { st.single = true; return q },
        insert: function () { return mutation() },
        update: function () { return mutation() },
        upsert: function () { return mutation() },
        delete: function () { return mutation() },
        then: function (resolve) {
          var rows = (SEED[table] || []).filter(function (r) {
            return st.filters.every(function (f) { return f(r) })
          })
          if (st.order) {
            var col = st.order[0]
            var asc = st.order[1].ascending !== false
            rows = rows.slice().sort(function (a, b) {
              var x = a[col], y = b[col]
              var c = (x == null ? 0 : 1) - (y == null ? 0 : 1) ||
                (typeof x === 'string' || typeof y === 'string'
                  ? String(x).localeCompare(String(y), 'zh')
                  : (Number(x) || 0) - (Number(y) || 0))
              return asc ? c : -c
            })
          }
          if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
          if (st.limit != null) rows = rows.slice(0, st.limit)
          var res = { data: st.single ? (rows[0] || null) : rows, error: null }
          setTimeout(function () { resolve(res) }, 0)
        }
      }
      return q
    }

    /** 写操作：一律返回 OFFLINE 错误（仍支持 .select() 链式收尾） */
    function mutation() {
      var q = {
        select: function () { return q },
        eq: function () { return q },
        single: function () { return q },
        maybeSingle: function () { return q },
        then: function (resolve) { setTimeout(function () { resolve(errRes()) }, 0) }
      }
      return q
    }

    var database = {
      from: function (t) { return query(t) },
      rpc: function (name) {
        // resolve_commission_rate：api.js 拿到空结果会走本地费率计算，安全
        // online_presence_beat：心跳无云端意义，返回错误 → 页面显示「– 人」
        return Promise.resolve({ data: null, error: { message: OFFLINE_MSG, code: 'OFFLINE_READONLY' } })
      }
    }

    var auth = {
      getSession: function () { return Promise.resolve({ data: null, error: null }) },
      signOut: function () { return Promise.resolve({ data: null, error: null }) },
      sendOtp: function () { return Promise.resolve(errRes()) },
      verifyOtp: function () { return Promise.resolve(errRes()) },
      signInWithOAuth: function () { return Promise.resolve(errRes()) },
      handleWechatWebCallback: function () { return Promise.resolve(errRes()) }
    }
    // 未列举的 auth 方法一律返回空成功，避免「函数不存在」报错
    var authProxy = new Proxy(auth, {
      get: function (t, p) {
        if (p in t) return t[p]
        return function () { return Promise.resolve({ data: null, error: null }) }
      }
    })

    // 存储：上传/签名在离线下均不可用
    var storageProxy = new Proxy({}, {
      get: function () {
        return function () { return Promise.resolve(errRes()) }
      }
    })

    window.cloud = { __offline: true, database: database, auth: authProxy, storage: storageProxy }

    document.body.classList.add('offline-mode')
    console.warn('[offline] 已进入离线演示模式（只读快照，' +
      Object.keys(SEED).length + ' 张表）')
  }

  window.enableOfflineMode = enableOfflineMode
})()
