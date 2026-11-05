@echo off
title 银川AIGC数字文化产业基地 - 用户端 + 管理端
cd /d "%~dp0"

set "USER_PORT=8899"
set "ADMIN_PORT=8900"

echo.
echo  ============================================
echo    银川AIGC数字文化产业基地
echo    用户端 + 管理端 · 双端启动
echo  ============================================
echo.

rem ---------- 释放端口 ----------
echo  [1/3] 释放端口 %USER_PORT% / %ADMIN_PORT% ...
for %%P in (%USER_PORT% %ADMIN_PORT%) do (
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%%P "') do (
    echo         占用端口 %%P 的 PID %%p 正在结束...
    taskkill /F /PID %%p >nul 2>&1
  )
)
node -e "setTimeout(()=>{},1200)"

rem ---------- 自检 ----------
echo.
echo  [2/3] 运行自检 ...
node "webapp\tests\features.js" >nul 2>&1
if errorlevel 1 (
  echo         ! 网页端自检未通过，请先修复
) else (
  echo         网页端自检 OK
)
node "webapp\tests\fill-check.js" >nul 2>&1
if errorlevel 1 (
  echo         ! 静态检查未通过，请先修复
) else (
  echo         静态检查 OK
)

rem ---------- 启动 ----------
echo.
echo  [3/3] 启动服务 ...
cd /d "%~dp0webapp"

start "用户端 :%USER_PORT%" /b python -m http.server %USER_PORT% --bind 127.0.0.1
node -e "setTimeout(()=>{},1200)"

start "管理端 :%ADMIN_PORT%" /b python -m http.server %ADMIN_PORT% --bind 127.0.0.1
node -e "setTimeout(()=>{},2000)"

rem ---------- 启动后自检 ----------
echo.
echo  验证服务状态 ...
set "USER_OK=0"
set "ADMIN_OK=0"
curl -s -o nul --max-time 6 "http://127.0.0.1:%USER_PORT%/index.html" && set "USER_OK=1"
curl -s -o nul --max-time 6 "http://127.0.0.1:%ADMIN_PORT%/admin.html" && set "ADMIN_OK=1"

if "%USER_OK%"=="1" (
  echo         用户端 :%USER_PORT% 已就绪
) else (
  echo         ! 用户端 :%USER_PORT% 启动失败 - 请确认已安装 Python 并加入 PATH
)
if "%ADMIN_OK%"=="1" (
  echo         管理端 :%ADMIN_PORT% 已就绪
) else (
  echo         ! 管理端 :%ADMIN_PORT% 启动失败 - 请确认已安装 Python 并加入 PATH
)

if "%USER_OK%"=="1" (
  start "" "http://127.0.0.1:%USER_PORT%/index.html"
) else (
  echo.
  echo         排查建议：
  echo           1. 确认 Python 已安装：python --version
  echo           2. 若提示找不到 python，改用 python3 或在脚本里换成完整路径
  echo           3. 端口被占用时本脚本会自动清理，如仍失败请手动查端口
  echo.
  pause
  exit /b 1
)

echo.
echo  --------------------------------------------
echo   用户端（客户端）  http://127.0.0.1:%USER_PORT%/index.html
echo   管理端（后台）    http://127.0.0.1:%ADMIN_PORT%/admin.html
echo  --------------------------------------------
echo.
echo   管理员账号：MG2026ADMIN8842
echo   管理端首次登录需「获取验证码」→ 输入收到的短信码
echo   详细说明见 docs 目录
echo.
echo   关闭本窗口即停止两个服务
echo.
pause
