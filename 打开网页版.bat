@echo off
title 宁夏美格视觉传媒接单 · 网页版
cd /d "%~dp0"

set "PORT=8899"

echo.
echo  ============================================
echo   宁夏美格视觉传媒接单 · 网页版
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
node "miniprogram\tests\smoke.js" >nul 2>&1
if errorlevel 1 (
  echo         ! 小程序端自检未通过，仍继续启动
) else (
  echo         小程序端 OK
)
node "webapp\tests\features.js" >nul 2>&1
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
