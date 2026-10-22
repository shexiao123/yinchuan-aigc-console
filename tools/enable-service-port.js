/**
 * 开启微信开发者工具的「服务端口」
 *
 * 命令行调用开发者工具必须开这个开关。开关在 settings 里：
 *   %LOCALAPPDATA%\微信开发者工具\User Data\<hash>\WeappLocalData\localstorage_b72da75d....json
 *     security.enableServicePort = true
 *     security.port = <端口>
 *
 * 改完需要重启开发者工具才生效。
 */
const fs = require('fs')
const path = require('path')
const net = require('net')
const os = require('os')

/** 找到开发者工具的 User Data 目录（不同安装路径 hash 不同） */
function findUserDataDir() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const base = path.join(local, '微信开发者工具', 'User Data')
  if (!fs.existsSync(base)) return null
  const dirs = fs.readdirSync(base).filter((d) => {
    const f = path.join(base, d, 'WeappLocalData')
    return fs.existsSync(f)
  })
  if (!dirs.length) return null
  // 优先选最近修改的
  dirs.sort((a, b) => {
    const ta = fs.statSync(path.join(base, a, 'WeappLocalData')).mtimeMs
    const tb = fs.statSync(path.join(base, b, 'WeappLocalData')).mtimeMs
    return tb - ta
  })
  return path.join(base, dirs[0])
}

/** 找 settings 文件（localstorage_b72da75d*.json 是开发者工具的设置存储） */
function findSettingsFile() {
  const ud = findUserDataDir()
  if (!ud) return null
  const ld = path.join(ud, 'WeappLocalData')
  const files = fs.readdirSync(ld).filter((f) => /^localstorage_[0-9a-f]+\.json$/.test(f))
  for (const f of files) {
    const full = path.join(ld, f)
    try {
      const d = JSON.parse(fs.readFileSync(full, 'utf8'))
      if (d && d.security && 'enableServicePort' in d.security) return full
    } catch (e) {
      // 不是目标文件，继续找
    }
  }
  return null
}

/** 端口是否被占用 */
function portInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(true))
    srv.once('listening', () => srv.close(() => resolve(false)))
    srv.listen(port, '127.0.0.1')
  })
}

/** 找一个空闲端口 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port
      srv.close(() => resolve(p))
    })
  })
}

;(async () => {
  const file = findSettingsFile()
  if (!file) {
    console.error('  [X] 找不到开发者工具的设置文件')
    console.error('      请手动开启：工具 → 设置 → 安全设置 → 服务端口')
    process.exitCode = 1
    return
  }

  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  const sec = d.security || (d.security = {})

  const before = { enabled: sec.enableServicePort, port: sec.port }

  sec.enableServicePort = true

  // 端口无效或被占用时重新分配
  let port = sec.port
  if (!port || (await portInUse(port))) {
    port = await findFreePort()
  }
  sec.port = port

  fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf8')

  const changed = before.enabled !== true || before.port !== port
  console.log('  服务端口:', changed ? '已开启 ✓' : '本来就开着 ✓')
  console.log('  端口:', port)
})()
