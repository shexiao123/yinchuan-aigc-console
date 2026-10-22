@echo off
title 发布小程序 · 宁夏美格视觉传媒接单
cd /d "%~dp0"

set "DEVTOOLS=D:\微信web开发者工具"
set "PROJECT=%~dp0miniprogram"
set "DEFAULT=%LOCALAPPDATA%\微信开发者工具\User Data\270d7310f77e162f7f0cb30ab692180c\Default"
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

if not exist "%DEVTOOLS%\cli.bat" (
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
  echo        node tools\set-appid.js wxYourAppID
  echo.
  pause
  exit /b 1
)
echo         AppID: %APPID%

echo.
echo  [2/5] Pre-publish check...
node "%~dp0miniprogram\tests\pre-publish.js"
if errorlevel 1 (
  echo.
  echo   先修复上面的问题再发布。
  echo.
  pause
  exit /b 1
)

echo.
echo  [3/5] 开启服务端口...
node "%~dp0tools\enable-service-port.js" 2>nul
if errorlevel 1 (
  echo         [X] 无法修改配置，请手动开启：
  echo             工具 - 设置 - 安全设置 - 服务端口
) else (
  echo         服务端口已开启
)

echo.
echo  [4/5] 启动开发者工具...
start "" "%DEVTOOLS%\微信开发者工具.exe"
echo         等待初始化（首次启动请扫码登录）...
node -e "setTimeout(()=>{},25000)"

echo.
echo  [5/5] 等待开发者工具就绪...
set "IDEPORT="
for /l %%i in (1,1,20) do (
  if not defined IDEPORT (
    if exist "%DEFAULT%\.ide" (
      set /p IDEPORT=<"%DEFAULT%\.ide"
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
call "%DEVTOOLS%\cli.bat" build-npm --project "%PROJECT%" --port %IDEPORT% --lang zh >nul 2>&1
if exist "%PROJECT%\miniprogram_npm\@tencent-ai\workbuddy-cloud-sdk\miniprogram.js" (
  echo         依赖就绪
) else (
  echo         [X] 构建失败，请在工具里点「工具 - 构建 npm」
)

echo.
echo   正在上传 %VERSION% ...
call "%DEVTOOLS%\cli.bat" upload --project "%PROJECT%" -v %VERSION% -d "%DESC%" --port %IDEPORT% --lang zh

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
