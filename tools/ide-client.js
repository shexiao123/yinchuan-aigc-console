/**
 * 微信开发者工具 CLI 客户端（自实现）
 *
 * 官方 cli.bat 依赖 IDE 已开启服务端口 + 正确的 .ide 文件。
 * 这个脚本自己完成端口发现与协议握手，适配「服务端口刚开启、IDE 需要重启」的场景。
 *
 * 协议（从官方 CLI 源码逆向）：
 *   1. GET http://127.0.0.1:<httpPort>/upgrade  →  { port, projectId }
 *   2. WebSocket 连 ws://127.0.0.1:<wsPort>/<projectId>_CLI_<clientId>
 *   3. HTTP 命令走 http://127.0.0.1:<httpPort>/<cmd>?<query>
 */
const http = require('http')
const crypto = require('crypto')

const CLIENT_ID = crypto.randomBytes(20).toString('hex')

function httpGet(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers, timeout: 3000 },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.end()
  })
}

/** 扫描本机所有监听端口，找 IDE 的 HTTP 服务端口 */
function listPorts() {
  return new Promise((resolve) => {
    const { exec } = require('child_process')
    exec('netstat -ano -p tcp', { encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve([])
      const ports = []
      stdout.split(/\r?\n/).forEach((line) => {
        if (!/LISTENING/.test(line)) return
        const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/)
        if (m) ports.push({ addr: m[1], port: Number(m[2]), pid: Number(m[3]) })
      })
      resolve(ports)
    })
  })
}

/** 找出哪个端口是 IDE 的 HTTP 服务（对 /upgrade 返回 JSON） */
async function findIdeHttpPort() {
  const ports = await listPorts()
  const candidates = ports.filter((p) => p.addr.startsWith('127.0.0.1') || p.addr.startsWith('0.0.0.0'))
  const results = []

  for (const p of candidates) {
    try {
      const r = await httpGet(p.port, '/upgrade')
      let json = null
      try {
        json = JSON.parse(r.body)
      } catch (e) {
        /* 不是 JSON */
      }
      if (json && (json.port || json.projectId)) {
        results.push({ httpPort: p.port, wsPort: json.port, projectId: json.projectId, pid: p.pid })
      }
    } catch (e) {
      /* 端口不通，跳过 */
    }
  }
  return results
}

module.exports = { httpGet, listPorts, findIdeHttpPort, CLIENT_ID }

if (require.main === module) {
  findIdeHttpPort().then((rs) => {
    console.log('=== 找到的 IDE 实例 ===')
    if (!rs.length) {
      console.log('  未找到。可能服务端口未开启，需在「设置 → 安全设置」开启。')
      process.exit(1)
    }
    rs.forEach((r) => {
      console.log('  httpPort=' + r.httpPort + '  wsPort=' + r.wsPort + '  pid=' + r.pid)
      console.log('    projectId=' + r.projectId)
    })
  })
}
