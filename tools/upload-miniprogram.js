/**
 * 小程序上传自动化
 *
 * 沙箱环境里开发者工具的 IDE 进程只能活几秒（GPU 崩溃），
 * 所以必须在它活着的时候抢时间把命令发出去。
 *
 * 策略：
 *   1. 启动 IDE（CLI 模式）
 *   2. 轮询 HTTP 端口，一通就立刻发命令
 *   3. build-npm → upload
 */
const { spawn, execFileSync } = require('node:child_process')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const DEVTOOLS = 'D:/微信web开发者工具'
const CLI = path.join(DEVTOOLS, 'cli.bat')
const EXE = path.join(DEVTOOLS, '微信开发者工具.exe')
const PROJECT = 'D:/WorkBuddy/2026-10-21-10-58-00/miniprogram'
const PORT = 51616
const VERSION = '1.0.0'
const DESC = '宁夏云辇文化科技有限公司 v1.0.0'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 探测 IDE 端口是否就绪 */
function probe(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/upgrade', method: 'GET', timeout: 1200 },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ ok: res.statusCode === 200, body }))
      }
    )
    req.on('error', () => resolve({ ok: false }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false })
    })
    req.end()
  })
}

/** 启动 IDE（CLI 模式，禁用 GPU 加速） */
function startIde() {
  const args = [
    '--cli',
    '--remote-port', '3799',
    '--ide-http-port', String(PORT),
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-compositing',
    '--no-sandbox',
    '--disable-gpu-sandbox'
  ]
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const p = spawn(EXE, args, {
    cwd: DEVTOOLS,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  p.unref()
  return p.pid
}

/** 调用 CLI 命令 */
function runCli(args, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const child = spawn('cmd.exe', ['/c', CLI, ...args], {
      cwd: DEVTOOLS,
      env: { ...process.env },
      windowsHide: true
    })
    let out = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (out += c))
    const t = setTimeout(() => {
      try { child.kill() } catch (e) {}
      resolve({ code: -1, out })
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(t)
      resolve({ code, out })
    })
  })
}

;(async () => {
  console.log('')
  console.log('=== 宁夏云辇文化科技有限公司 · 小程序上传 ===')
  console.log('')

  // 1. 服务端口
  try {
    execFileSync(process.execPath, ['D:/WorkBuddy/2026-10-21-10-58-00/tools/enable-service-port.js'], {
      stdio: 'pipe'
    })
    console.log('  ✓ 服务端口已开启')
  } catch (e) {
    console.log('  ! 服务端口配置可能有问题：' + String(e.message).slice(0, 80))
  }

  // 2. 启动 IDE
  console.log('  → 启动开发者工具...')
  const pid = startIde()
  console.log('    PID ' + pid)

  // 3. 抢时间：端口一通就发命令
  let ready = false
  for (let i = 0; i < 40; i++) {
    await wait(1000)
    const r = await probe(PORT)
    if (r.ok) {
      ready = true
      console.log('  ✓ IDE 就绪（' + (i + 1) + 's）')
      break
    }
  }
  if (!ready) {
    console.log('  ✗ IDE 端口未就绪')
    process.exit(1)
  }

  // 4. 立即构建 npm
  console.log('  → 构建 npm...')
  const build = await runCli([
    'build-npm',
    '--project', PROJECT,
    '--port', String(PORT),
    '--lang', 'zh'
  ], 120000)
  const distPath = path.join(PROJECT, 'miniprogram_npm', '@tencent-ai', 'workbuddy-cloud-sdk', 'miniprogram.js')
  console.log('    ' + (fs.existsSync(distPath) ? '依赖就绪 ✓' : '构建未完成（用预置产物）'))

  // 5. 立即上传
  console.log('  → 上传 ' + VERSION + '...')
  const up = await runCli([
    'upload',
    '--project', PROJECT,
    '-v', VERSION,
    '-d', DESC,
    '--port', String(PORT),
    '--lang', 'zh'
  ], 150000)

  console.log('')
  console.log('  --- CLI 输出 ---')
  up.out.split(/\r?\n/).filter((l) => l.trim()).slice(-25).forEach((l) => {
    console.log('  ' + l.replace(/^[\s\u25b0-]+/, '  '))
  })
  console.log('')
  console.log('  退出码：' + up.code)

  // 上传失败时给出可执行的判断
  const text = up.out
  if (/需要重新登录/.test(text)) {
    console.log('  ============================================')
    console.log('   需要你扫码登录开发者工具')
    console.log('  ============================================')
    console.log('')
    console.log('   上传需要开发者工具处于已登录状态（登录后才能上传到')
    console.log('   你的小程序）。请：')
    console.log('')
    console.log('     1. 双击 打开小程序.bat')
    console.log('     2. 工具弹窗里用你的微信扫码登录')
    console.log('     3. 登录完成后回到本窗口，重新运行')
    console.log('')
    console.log('   登录后再次运行本脚本即可完成上传。')
    console.log('')
  } else if (/不存在此 AppID/.test(text)) {
    console.log('  ! AppID 无效：请用 node tools/set-appid.js wx你的AppID 填正确的 AppID')
    console.log('')
  }
})()
