# 银川 AIGC 数字文化产业基地 · 网页端

> Yinchuan AIGC Digital Culture Industry Base Project Console

婚摄 / 品牌宣传片 / 短视频 / 商业摄影的接单撮合平台。

**在线地址**：<https://shexiao123.github.io/yinchuan-aigc-console/>

## 技术栈

纯静态前端，无构建步骤：

- 原生 HTML / CSS / JavaScript（无框架、无打包器）
- [WorkBuddy 云服务 SDK](https://www.workbuddy.cn) —— auth / database / storage
- 数据库：PostgreSQL（云端托管）
- GitHub Actions 自动部署到 GitHub Pages

## 目录结构

```
webapp/                 ← 网页端源码（Pages 发布的就是这个目录）
├── index.html          用户端首页
├── admin.html          管理端后台
├── sync.html           数据同步页
├── assets/
│   ├── style.css       用户端样式
│   ├── admin.css       管理端样式
│   └── covers/         服务封面与主视觉图
├── js/
│   ├── config.js       运行时配置（云服务接入）
│   ├── api.js          数据访问层（所有 cloud 调用集中在这）
│   ├── app.js          用户端页面与路由
│   ├── admin.js        管理端页面
│   ├── member.js       会员包月业务
│   ├── commission.js   佣金计算规则
│   ├── profile.js      用户资料
│   ├── adaptive-grid.js 宽屏自适应网格
│   ├── platform-rules.js 平台规则文案与费率同步
│   └── samples.js      样片上传
└── tests/              自检脚本（Node 运行，不进 Pages）

miniprogram/            ← 微信小程序端源码
assets/covers/          ← AI 生成的封面素材（生成脚本）
tools/                  ← 辅助脚本
```

## 本地运行

网页端是纯静态，起个静态服务器即可：

```bash
cd webapp
python -m http.server 8899
# 浏览器打开 http://127.0.0.1:8899
```

> 注意：直接双击 `index.html`（`file://` 协议）无法调用云服务，必须走 HTTP。

## 自检

```bash
cd webapp
node tests/features.js      # DOM 引用、路由、API 导出、样式类、配置安全
node tests/fill-check.js    # 宽屏铺满规则（加 --browser 跑真浏览器）
node tests/rules-check.js   # 平台规则文案与费率同步

cd ../miniprogram
node tests/smoke.js         # 冒烟检查
node tests/features.js      # 页面与数据字段检查
node tests/commission-check.js   # 佣金规则
node tests/membership-check.js   # 会员页（可传页面名检查任意页）
```

## 核心业务规则

### 佣金

平台基准 **10%**（`platform_settings.commission_rate`），从服务者收入中扣除。

会员按档位享受更低费率：

| 档位 | 月费 | 佣金率 | 在架上限 |
|---|---|---|---|
| 基础 | ¥99 | 10% | 3 |
| 专业 | ¥299 | 8% | 10 |
| 工作室 | ¥599 | 5% | 30 |

费率由服务端按服务者档位计算（`resolve_commission_rate` RPC），不采信前端传值。

### 会员

开通会员才能接单。首次开通需一次性支付会员费 + 保证金 + 入驻费。

支付通道尚未开通（小程序未绑定微信），当前流程为：用户下单生成待支付订单 → 管理员在后台确认收款 → 开通会员。

### 保证金

入驻时冻结，用于保障订单履约。退出接单或平台解约时可退还。

## 部署

推送到 `main` 分支后，GitHub Actions 自动构建并发布到 GitHub Pages。

需要在仓库 Settings → Pages → Source 选择 **GitHub Actions**。

## 版权

宁夏云辇文化科技有限公司 · 让每一次心动都有画面
