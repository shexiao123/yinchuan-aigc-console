@echo off
title 上传小程序体验版 · 银川AIGC数字文化产业基地
cd /d "%~dp0"
setlocal enabledelayedexpansion

set "DEVTOOLS=D:\微信web开发者工具"
set "PROJECT=%~dp0miniprogram"
set "DEFAULT=%LOCALAPPDATA%\微信开发者工具\User Data\270d7310f77e162f7f0cb30ab692180c\Default"
set "VERSION=1.0.0"
set "DESC=银川AIGC接单平台 v1.0.0 演示版"

echo.
echo  ============================================
echo   上传小程序体验版（上传不等于正式上线）
echo  ============================================
echo.
echo   工程目录： %PROJECT%
echo   版本号：   %VERSION%
echo.

if not exist "%DEVTOOLS%\cli.bat" (
  echo   [X] 找不到微信开发者工具： %DEVTOOLS%
  echo       请手动打开工具后导入 miniprogram 目录
  echo.
  pause
  exit /b 1
)

echo  [1/6] 发布资格预检...
node "%~dp0tools\check-release.js"
if errorlevel 2 (
  echo.
  echo   当前 AppID 是开发者工具分配的测试号，只能跑模拟器。
  echo   上传体验版 / 提审发布需要你自己的小程序 AppID：
  echo.
  echo     1. 打开 https://mp.weixin.qq.com 注册小程序（建议企业主体）
  echo     2. 开发管理 - 开发设置 - 复制 AppID
  echo     3. 执行：node tools\set-appid.js wx你的AppID
  echo     4. 执行：node tools\confirm-release.js
  echo.
  echo   完整步骤见《正式上线清单.md》
  echo.
  pause
  exit /b 1
)

echo.
echo  [2/6] 发布前体检（体验版口径）...
node "%~dp0miniprogram\tests\pre-publish.js" --experience
if errorlevel 1 (
  echo.
  echo   体检未通过，请先修复上面的问题再上传。
  echo.
  pause
  exit /b 1
)

echo.
echo  [3/6] 开启服务端口...
node "%~dp0tools\enable-service-port.js" 2>nul
if errorlevel 1 (
  echo         [X] 无法自动开启，请手动：工具 - 设置 - 安全设置 - 服务端口
) else (
  echo         服务端口已开启
)

echo.
echo  [4/6] 启动开发者工具...
start "" "%DEVTOOLS%\微信开发者工具.exe"
echo         等待初始化（首次启动请扫码登录）...
node -e "setTimeout(()=>{},25000)"

echo.
echo  [5/6] 等待开发者工具就绪...
set "IDEPORT="
for /l %%i in (1,1,20) do (
  if not defined IDEPORT (
    if exist "%DEFAULT%\.ide" set /p IDEPORT=<"%DEFAULT%\.ide"
    if defined IDEPORT (
      curl -s -o nul --noproxy "*" "http://127.0.0.1:!IDEPORT!/upgrade" 2>nul
      if errorlevel 1 set "IDEPORT="
    )
    if not defined IDEPORT node -e "setTimeout(()=>{},2000)"
  )
)

if not defined IDEPORT (
  echo         [X] 未能连接开发者工具
  echo.
  echo         请确认：工具已打开并登录、安全设置里服务端口已开。
  echo         也可以直接在工具里点「上传」。
  echo.
  pause
  exit /b 1
)
echo         端口 %IDEPORT% 已就绪。

echo.
echo  [6/6] 构建 npm 依赖并上传...
call "%DEVTOOLS%\cli.bat" build-npm --project "%PROJECT%" --port %IDEPORT% --lang zh >nul 2>&1
if exist "%PROJECT%\miniprogram_npm\@tencent-ai\workbuddy-cloud-sdk\miniprogram.js" (
  echo         依赖就绪
) else (
  echo         [警告] npm 构建未完成，请在工具里点「工具 - 构建 npm」
)
call "%DEVTOOLS%\cli.bat" upload --project "%PROJECT%" -v %VERSION% -d "%DESC%" --port %IDEPORT% --lang zh

echo.
echo  ============================================
echo   上传结束 —— 此时还没有正式上线
echo  ============================================
echo.
echo   上传只生成开发版 / 体验版。正式上线必须在网页后台完成：
echo     1. 打开 https://mp.weixin.qq.com 并登录
echo     2. 版本管理 - 找到 1.0.0 - 提交审核
echo     3. 审核通过 - 点「发布」- 全量发布
echo.
echo   [注意] 当前为演示记账版：保证金、违约金、提现均不产生真实资金往来。
echo          作为真实交易版本提审前，必须接后端支付与分账资质，
echo          并把 tools\release.json 的 demoMode 改为 false。
echo.
echo   详细清单：正式上线清单.md
echo.
start "" "https://mp.weixin.qq.com"
pause
