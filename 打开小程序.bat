@echo off
title 宁夏美格视觉传媒接单 · 微信小程序
cd /d "%~dp0"

set "DEVTOOLS=D:\微信web开发者工具"
set "PROJECT=%~dp0miniprogram"
set "DEFAULT=%LOCALAPPDATA%\微信开发者工具\User Data\270d7310f77e162f7f0cb30ab692180c\Default"

if not exist "%DEVTOOLS%\cli.bat" (
  echo.
  echo   找不到微信开发者工具： %DEVTOOLS%
  echo   请手动打开后导入项目： %PROJECT%
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   宁夏美格视觉传媒接单 · 微信小程序
echo  ============================================
echo.
echo   工程目录： %PROJECT%
echo.

echo  [1/4] 启动微信开发者工具...
if not exist "%DEVTOOLS%\微信开发者工具.exe" (
  echo   未找到主程序，请手动导入项目。
  goto :manual
)

start "" "%DEVTOOLS%\微信开发者工具.exe"
echo         等待初始化（首次启动请扫码登录）...
node -e "setTimeout(()=>{},15000)"

echo.
echo  [2/4] 读取开发者工具端口...
set "IDEPORT="
for /l %%i in (1,1,15) do (
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
call "%DEVTOOLS%\cli.bat" build-npm --project "%PROJECT%" --port %IDEPORT% --lang zh >nul 2>&1
if exist "%PROJECT%\miniprogram_npm\@tencent-ai\workbuddy-cloud-sdk\miniprogram.js" (
  echo         依赖就绪
) else (
  echo         [X] 构建失败，请在工具里点「工具 - 构建 npm」
)

echo.
echo  [4/4] 导入项目...
call "%DEVTOOLS%\cli.bat" open --project "%PROJECT%" --port %IDEPORT% --lang zh >nul 2>&1

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
