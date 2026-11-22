<div align="center">
  <img src="docs/assets/branding/readme-hero.png" width="100%" alt="银川 AIGC 数字文化产业基地 · 影视制作接单撮合平台">
</div>

<div align="center">

**银川 AIGC 数字文化产业基地** · 影视制作接单撮合平台

婚礼微电影 / 品牌宣传片 / 短视频剪辑 / 商业摄影 —— 让每一次心动都有画面

宁夏云辇文化科技有限公司

</div>

---

## 在线入口

| 端 | 地址 | 说明 |
|---|---|---|
| 用户端 | <https://shexiao123.github.io/yinchuan-aigc-console/> | 浏览服务、发布需求、订单与交付 |
| 管理端 | <https://shexiao123.github.io/yinchuan-aigc-console/admin.html> | 商家、订单、公告、分类、样片管理 |
| 官方托管（带实时数据） | <https://guangying-web.app.workbuddy.host/?sharecode=L4AF6QVF4Q> | 云数据按 Origin 白名单放行，Pages 域名读不到实时数据 |
| 微信小程序 | 版本 `1.0.1` 已上传公众平台开发版本 | 提审 / 备案流程进行中，详见 [正式上线清单.md](正式上线清单.md) |

> GitHub Pages 域名读不了云数据库是平台侧 Origin 白名单策略，静态页面本身正常；要看实时数据请用官方托管地址。

## 三端结构

| 目录 | 内容 | 技术 |
|---|---|---|
| `webapp/` | 网页端源码（用户端 / 管理端 / 同步页） | 原生 HTML · CSS · JavaScript，无构建步骤 |
| `miniprogram/` | 微信小程序端源码 | 微信原生小程序，WXML / WXSS |
| `docs/` | GitHub Pages 发布源（由 `webapp/` 镜像生成，请勿手改） | GitHub Actions 自动部署 |
| `tools/branding/` | 品牌视觉唯一真源（分享卡 / README 横幅 / 暖色主题脚本） | HTML → Chrome 截图 |

---

## 品牌视觉

2026-11-22 起全站统一「暖铜纸感」：米纸底 `#FAF5EC`、卡片 `#FFFDF9`、墨棕字 `#2A2018`、铜金点缀 `#B5793D`。卡片封面与主视觉**一律使用真实摄影作品**，不用表情符号、不用彩虹渐变字、不用科技插画。

| 文件 | 用途 |
|---|---|
| `webapp/assets/branding/readme-hero.png` | README 顶部横幅（1600×440） |
| `webapp/assets/branding/github-card.png` | **GitHub 分享预览卡**（1280×640），需上传到仓库 Settings → Social preview 才会生效 |
| `webapp/assets/branding/share-card.png` | **链接分享卡**（1080×1080），已由 `index.html` 的 `og:image` 引用，链接发到微信 / 企业微信 / 浏览器时显示 |
| `tools/branding/*.html` | 上面三张图的源文件，改这里再重新渲染 |
| `tools/branding/warm-theme.py` | 把 `tech.css` 冷色板整体转暖（幂等，可反复运行） |

重新生成品牌图（改完 `tools/branding/*.html` 后，用 Chrome headless 按各自尺寸截图）：

```bash
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files \
  --window-size=1080,1080 --screenshot=webapp/assets/branding/share-card.png \
  file:///D:/WorkBuddy/2026-10-21-10-58-00/tools/branding/share-card.html
# github-card.html 用 1280x640，readme-hero.html 用 1600x440
```

> 分享链接时显示的那张灰色卡片，是 GitHub 按仓库名自动生成的。把 `github-card.png` 上传到 **Settings → General → Social preview** 即可换成上面的品牌卡；这一步需要仓库管理员本人操作。
>
> 网页链接的分享卡则由 `index.html` 里的 `og:image` 控制，指向 Pages 上的 `share-card.png`（GitHub Pages 公开可抓）；托管域名的网关若按 UA 拦截爬虫，微信内可能仍显示平台默认卡片，这是网关策略，前端改不了。

## 本地运行

网页端是纯静态，起个静态服务器即可：

```bash
cd webapp
python -m http.server 8899     # 用户端 http://127.0.0.1:8899/index.html
python -m http.server 8900     # 管理端 http://127.0.0.1:8900/admin.html
```

也可以双击根目录 `双端启动.bat`（一个窗口起两个服务，端口冲突自动清理）。
管理员账号：`MG2026ADMIN8842`。

> 直接双击 `index.html`（`file://` 协议）无法调用云服务，必须走 HTTP。

## 每次更新同步到 GitHub 线上

**双击 `同步GitHub.bat`** 即可（自动完成前三步）：

1. `node tools/sync-pages.js` —— 把 `webapp/` 同步到 `docs/`（Pages 发布源），并校验发布配置结构
2. `git add -A && git commit` —— 提交本地改动
3. `python -u tools/gh-sync.py` —— 推送到 GitHub `main`
4. GitHub Actions 自动部署 Pages，约 1–2 分钟生效

`tools/gh-sync.py` 走 GitHub Data API（增量 blob → tree → commit → 更新 ref），因为本机 `git push` 到 `github.com` 常被网关重置，而 `api.github.com` 可达。凭据读系统凭据管理器里的 PAT（需要 `repo` + `workflow` 权限）。默认跳过根 `assets/`、`_docs/`、`prototype/`、`shots/`、`video/out/` 等历史素材目录，`--full` 可全量同步，`--check` 只对比不写入。

## 自检

```bash
node webapp/tests/features.js       # DOM 引用、资源、路由、API 导出、样式类
node webapp/tests/fill-check.js     # 宽屏铺满规则（加 --browser 跑真浏览器）
node webapp/tests/rules-check.js    # 平台规则文案与费率同步
node miniprogram/tests/smoke.js     # 小程序冒烟检查
node miniprogram/tests/features.js  # 小程序页面与数据字段
node tools/test-guarantee.js        # 履约 / 保证金 / 逾期违约金
node tools/test-taskchain.js        # 商家任务链
node tools/test-demand.js           # 需求池
node tools/test-payout.js           # 提现
node tools/test-req-templates.js    # 8 品类结构化需求模板
python tools/branding/warm-theme.py --check   # 主题色板幂等校验
```

## 核心业务规则

### 佣金

平台基准 **10%**（`platform_settings.commission_rate`），从服务者收入中扣除。

| 档位 | 月费 | 佣金率 | 在架上限 |
|---|---|---|---|
| 基础 | ¥99 | 10% | 3 |
| 专业 | ¥299 | 8% | 10 |
| 工作室 | ¥599 | 5% | 30 |

费率由服务端按服务者档位计算（`resolve_commission_rate` RPC），不采信前端传值。

### 会员与保证金

开通会员才能接单。首次开通需一次性支付会员费 + 保证金 + 入驻费；保证金在入驻时冻结，退出接单或平台解约时退还。

小程序端当前资金流程为**本机演示记账**（`demoMode = true`）：15% 接单保证金、10% 发布方保证金、逾期违约金 3:7 分账、原路退回、提现均只写本地账本，**不是真实支付**。真实交易版需接入微信支付商户号、分账资质与服务端定时任务。

## 部署

推送到 `main` 分支后，GitHub Actions 自动构建并发布到 GitHub Pages。
需要在仓库 Settings → Pages → Source 选择 **GitHub Actions**。

## 版权

宁夏云辇文化科技有限公司 · 让每一次心动都有画面
