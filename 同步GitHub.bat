@echo off
title 同步更新到 GitHub 线上
cd /d "%~dp0"
echo.
echo ==================================================
echo   银川AIGC数字文化产业基地 - 同步到 GitHub
echo ==================================================
echo.
echo [1/4] 同步 webapp 到 docs（GitHub Pages 发布源）...
call node tools/sync-pages.js
if errorlevel 1 goto :fail
echo.
echo [2/4] 提交本地改动...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "chore: 同步更新（本机一键同步）"
) else (
  echo     没有需要提交的改动
)
echo.
echo [3/4] 推送到 GitHub main（API 通道）...
call python -u tools/gh-sync.py -m "chore: 同步更新（本机一键同步）"
if errorlevel 1 goto :fail
echo.
echo [4/4] 完成
echo.
echo   用户端线上: https://shexiao123.github.io/yinchuan-aigc-console/
echo   管理端线上: https://shexiao123.github.io/yinchuan-aigc-console/admin.html
echo.
echo   GitHub Actions 部署约需 1-2 分钟，稍后刷新即可看到新版本。
echo.
pause
exit /b 0
:fail
echo.
echo   同步失败，请查看上方错误信息。
echo   常见原因：未配置 GitHub 凭据 / 网络被拦 / docs 同步失败。
echo.
pause
exit /b 1
