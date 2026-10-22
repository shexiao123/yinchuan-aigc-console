/**
 * 生成批处理启动脚本
 *
 * 三个坑（都是实测踩出来的）：
 *   1. 编码：cmd 默认代码页 936（GBK）。bat 里若有中文（输出文案、路径），
 *      必须存成 GBK，否则中文乱码甚至把命令截断。
 *      ⚠️ 路径里的中文尤其致命：UTF-8 存储时 D:\微信web开发者工具
 *         会被截断成 D:\微信web开发者工，后面的 if exist 全部失效。
 *   2. 行尾：cmd.exe 要求 CRLF，裸 LF 会把多行连成一行解析
 *      （典型症状：'M' 不是内部或外部命令）
 *   3. 延时：timeout.exe 在装了 Git Bash 的机器上会被 GNU timeout 抢走
 *      （'timeout: invalid time interval'）→ 统一用 node 做延时
 *
 * 做法：脚本内容在 JS 里是 UTF-8 字符串，**一次性**转成 GBK + CRLF 写盘。
 *      绝不能反复转换（第二次会把 GBK 当 UTF-8 读，产出乱码）。
 *
 * 用法：node tools/make-bat.js
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

const BATS = {
  '打开网页版.bat': `@echo off
title 宁夏云辇文化科技有限公司 · 网页版
cd /d "%~dp0"

set "PORT=8899"

echo.
echo  ============================================
echo   宁夏云辇文化科技有限公司 · 网页版
echo  ============================================
echo.

echo  [1/3] 释放端口 %PORT% ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%PORT%"') do (
  echo         发现占用进程 PID %%p，正在结束...
  taskkill /F /PID %%p >nul 2>&1
  if errorlevel 1 (
    echo         [!] 结束失败，请以管理员身份运行
  ) else (
    echo         已释放
  )
)
node -e "setTimeout(()=>{},1000)"

echo.
echo  [2/3] 工程自检...
node "miniprogram\\tests\\smoke.js" >nul 2>&1
if errorlevel 1 (
  echo         ! 小程序端自检未通过，仍继续启动
) else (
  echo         小程序端 OK
)
node "webapp\\tests\\features.js" >nul 2>&1
if errorlevel 1 (
  echo         ! 网页端自检未通过，仍继续启动
) else (
  echo         网页端 OK
)

echo.
echo  --------------------------------------------
echo   管理端首次登录（激活管理员身份）：
echo.
echo     1. 打开  http://127.0.0.1:%PORT%/admin.html
echo     2. 管理码填：MG2026ADMIN8842
echo     3. 点「验证管理码」
echo     4. 填你的手机号，点「获取验证码」
echo     5. 填短信验证码，点「绑定并登录」
echo.
echo   详细说明见 docs 目录
echo  --------------------------------------------
echo.

echo  [3/3] 启动本地服务...
cd /d "%~dp0webapp"
start "" /b python -m http.server %PORT% --bind 127.0.0.1
node -e "setTimeout(()=>{},2000)"

start "" "http://127.0.0.1:%PORT%/admin.html"
node -e "setTimeout(()=>{},1000)"
start "" "http://127.0.0.1:%PORT%/index.html"

echo.
echo  --------------------------------------------
echo   客户端  http://127.0.0.1:%PORT%/index.html
echo   管理端  http://127.0.0.1:%PORT%/admin.html
echo.
echo   关闭本窗口即停止服务。
echo.
pause
`,

  '打开小程序.bat': `@echo off
title 宁夏云辇文化科技有限公司 · 微信小程序
cd /d "%~dp0"

set "DEVTOOLS=D:\\微信web开发者工具"
set "PROJECT=%~dp0miniprogram"
set "DEFAULT=%LOCALAPPDATA%\\微信开发者工具\\User Data\\270d7310f77e162f7f0cb30ab692180c\\Default"

if not exist "%DEVTOOLS%\\cli.bat" (
  echo.
  echo   找不到微信开发者工具： %DEVTOOLS%
  echo   请手动打开后导入项目： %PROJECT%
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   宁夏云辇文化科技有限公司 · 微信小程序
echo  ============================================
echo.
echo   工程目录： %PROJECT%
echo.

echo  [1/4] 启动微信开发者工具...
if not exist "%DEVTOOLS%\\微信开发者工具.exe" (
  echo   未找到主程序，请手动导入项目。
  goto :manual
)

start "" "%DEVTOOLS%\\微信开发者工具.exe"
echo         等待初始化（首次启动请扫码登录）...
node -e "setTimeout(()=>{},15000)"

echo.
echo  [2/4] 读取开发者工具端口...
set "IDEPORT="
for /l %%i in (1,1,15) do (
  if not defined IDEPORT (
    if exist "%DEFAULT%\\.ide" (
      set /p IDEPORT=<"%DEFAULT%\\.ide"
    )
    if defined IDEPORT (
      curl -s -o nul --noproxy "*" "http://127.0.0.1:%IDEPORT%/upgrade" 2>nul
      if errorlevel 1 set "IDEPORT="
    )
    if not defined IDEPORT node -e "setTimeout(()=>{},2000)"
  )
)

if not defined IDEPORT (
  echo         [X] 无法连接开发者工具。
  echo.
  echo         请确认：
  echo           1. 开发者工具已打开且已登录
  echo           2. 工具 - 设置 - 安全设置 - 打开服务端口
  echo.
  goto :manual
)
echo         端口 %IDEPORT% 已就绪。

echo.
echo  [3/4] 构建 npm 依赖...
call "%DEVTOOLS%\\cli.bat" build-npm --project "%PROJECT%" --port %IDEPORT% --lang zh >nul 2>&1
if exist "%PROJECT%\\miniprogram_npm\\@tencent-ai\\workbuddy-cloud-sdk\\miniprogram.js" (
  echo         依赖就绪
) else (
  echo         [X] 构建失败，请在工具里点「工具 - 构建 npm」
)

echo.
echo  [4/4] 导入项目...
call "%DEVTOOLS%\\cli.bat" open --project "%PROJECT%" --port %IDEPORT% --lang zh >nul 2>&1

echo.
echo  ============================================
echo   完成。项目应已在工具中打开。
echo  ============================================
echo.
echo   接下来：
echo     - 如提示登录，用你的微信扫码
echo     - AppID 处选「测试号」或填自己的 AppID
echo     - 点「编译」，模拟器即可运行
echo.
echo   真实微信登录与真机预览需先在 WorkBuddy 后台
echo   为该应用开启「小程序绑定」。
echo.
pause
exit /b 0

:manual
echo.
echo  ============================================
echo   请手动完成导入
echo  ============================================
echo.
echo     1. 打开微信开发者工具
echo     2. 点「导入项目」
echo     3. 目录： %PROJECT%
echo     4. AppID 选「测试号」或填自己的 AppID
echo     5. 点「工具 → 构建 npm」（必须做）
echo     6. 点「编译」
echo.
pause
`,

  '发布小程序.bat': `@echo off
title 发布小程序 · 宁夏云辇文化科技有限公司
cd /d "%~dp0"

set "DEVTOOLS=D:\\微信web开发者工具"
set "PROJECT=%~dp0miniprogram"
set "DEFAULT=%LOCALAPPDATA%\\微信开发者工具\\User Data\\270d7310f77e162f7f0cb30ab692180c\\Default"
set "VERSION=1.0.0"
set "DESC=Meige Visual v%VERSION%"

echo.
echo  ============================================
echo   发布小程序
echo  ============================================
echo.
echo   工程目录： %PROJECT%
echo   版本号： %VERSION%
echo.

if not exist "%DEVTOOLS%\\cli.bat" (
  echo   [X] 找不到微信开发者工具： %DEVTOOLS%
  echo.
  pause
  exit /b 1
)

echo  [1/5] 检查 AppID...
for /f "delims=" %%a in ('node -e "console.log(require('./miniprogram/project.config.json').appid)"') do set "APPID=%%a"
if "%APPID%"=="touristappid" (
  echo.
  echo   [X] 游客 AppID 无法上传。
  echo.
  echo   发布需要你自己的小程序 AppID：
  echo.
  echo     1. 打开 https://mp.weixin.qq.com 注册小程序
  echo     2. 开发管理 - 开发设置 - 复制 AppID
  echo     3. 执行：
  echo.
  echo        node tools\\set-appid.js wxYourAppID
  echo.
  pause
  exit /b 1
)
echo         AppID: %APPID%

echo.
echo  [2/5] Pre-publish check...
node "%~dp0miniprogram\\tests\\pre-publish.js"
if errorlevel 1 (
  echo.
  echo   先修复上面的问题再发布。
  echo.
  pause
  exit /b 1
)

echo.
echo  [3/5] 开启服务端口...
node "%~dp0tools\\enable-service-port.js" 2>nul
if errorlevel 1 (
  echo         [X] 无法修改配置，请手动开启：
  echo             工具 - 设置 - 安全设置 - 服务端口
) else (
  echo         服务端口已开启
)

echo.
echo  [4/5] 启动开发者工具...
start "" "%DEVTOOLS%\\微信开发者工具.exe"
echo         等待初始化（首次启动请扫码登录）...
node -e "setTimeout(()=>{},25000)"

echo.
echo  [5/5] 等待开发者工具就绪...
set "IDEPORT="
for /l %%i in (1,1,20) do (
  if not defined IDEPORT (
    if exist "%DEFAULT%\\.ide" (
      set /p IDEPORT=<"%DEFAULT%\\.ide"
    )
    if defined IDEPORT (
      curl -s -o nul --noproxy "*" "http://127.0.0.1:%IDEPORT%/upgrade" 2>nul
      if errorlevel 1 set "IDEPORT="
    )
    if not defined IDEPORT node -e "setTimeout(()=>{},2000)"
  )
)

if not defined IDEPORT (
  echo         [X] 未能连接开发者工具
  echo.
  echo         请确认：
  echo           1. 开发者工具已打开且已登录
  echo           2. 工具 - 设置 - 安全设置 - 打开服务端口
  echo           3. 重跑本脚本，或直接在工具里点「上传」
  echo.
  pause
  exit /b 1
)
echo         端口 %IDEPORT% 已就绪。

echo.
echo   构建 npm 依赖...
call "%DEVTOOLS%\\cli.bat" build-npm --project "%PROJECT%" --port %IDEPORT% --lang zh >nul 2>&1
if exist "%PROJECT%\\miniprogram_npm\\@tencent-ai\\workbuddy-cloud-sdk\\miniprogram.js" (
  echo         依赖就绪
) else (
  echo         [X] 构建失败，请在工具里点「工具 - 构建 npm」
)

echo.
echo   正在上传 %VERSION% ...
call "%DEVTOOLS%\\cli.bat" upload --project "%PROJECT%" -v %VERSION% -d "%DESC%" --port %IDEPORT% --lang zh

echo.
echo  ============================================
echo   上传完成
echo  ============================================
echo.
echo   接下来在微信公众平台后台：
echo     1. 版本管理 - 找到刚上传的版本
echo     2. 提交审核
echo     3. 审核通过后发布
echo.
echo   体验版扫码即可使用。
echo.
pause
`,

  '打开原型.bat': `@echo off
title 宁夏云辇文化科技有限公司 · 原型
cd /d "%~dp0prototype"
start "" "index.html"
echo.
echo   原型已在浏览器中打开。
echo.
pause
`
}

console.log('')
console.log('=== 生成批处理启动脚本（GBK + CRLF）===')
console.log('')

const tmp = path.join(os.tmpdir(), `batgen-${process.pid}.txt`)

Object.entries(BATS).forEach(([name, content]) => {
  const file = path.join(ROOT, name)
  // 统一 CRLF
  const crlf = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')

  // 走中间文件交给 PowerShell 转 GBK（内容走文件不走命令行，避免中文被破坏）
  fs.writeFileSync(tmp, crlf, 'utf8')
  const ps = `
$enc = [System.Text.Encoding]::GetEncoding(936)
$text = [System.IO.File]::ReadAllText('${tmp.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)
$bytes = $enc.GetBytes($text)
[System.IO.File]::WriteAllBytes('${file.replace(/'/g, "''")}', $bytes)
`
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'pipe' })
    // 回读校验：按 GBK 解码后不应有替换字符
    const back = new TextDecoder('gbk').decode(fs.readFileSync(file))
    const bad = back.includes('\uFFFD')
    console.log(`  ✓ ${name}${bad ? '  ⚠️ 编码异常' : ''}`)
  } catch (e) {
    console.log(`  ✗ ${name}  生成失败：${String(e.message).slice(0, 60)}`)
  }
})

try { fs.unlinkSync(tmp) } catch (e) {}

console.log('')
console.log('  全部为 GBK + CRLF，cmd.exe 可正常解析。')
console.log('  改完 bat 请重新运行本脚本，不要手动改编码。')
console.log('')
