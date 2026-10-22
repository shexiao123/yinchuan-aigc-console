# 工具脚本

| 脚本 | 作用 |
|---|---|
| `make-bat.js` | **生成**所有 .bat 启动脚本（GBK + CRLF）。改 bat 请改这里 |
| `set-appid.js` | 设置/查看小程序 AppID。`node tools/set-appid.js wx你的AppID` |
| `enable-service-port.js` | 开启微信开发者工具的「服务端口」（CLI 调用的前提） |
| `upload-miniprogram.js` | 上传自动化：启动 IDE → 构建 npm → 上传，附带错误诊断 |
| `check-apps.js` | 校验三个云应用的目录绑定是否正确。`--fix` 可自动修复 |
| `ide-client.js` | 开发者工具 CLI 客户端：扫描本机 IDE 实例并完成协议握手 |

---

## ⚠️ 改 .bat 的唯一正确方式

**不要手动编辑 .bat 文件。**改 `tools/make-bat.js` 里的内容，然后：

```bash
node tools/make-bat.js
```

原因（三个都是实测踩出来的坑）：

1. **编码**：cmd.exe 默认代码页 936（GBK）。UTF-8 存储的 bat 里，
   **路径中的中文会被截断**——`D:\微信web开发者工具` 变成 `D:\微信web开发者工`，
   后面的 `if exist` 全部失效，报「找不到开发者工具」但路径看着是对的。
2. **行尾**：cmd.exe 要求 CRLF。裸 LF 会把多行连成一行解析，
   症状是 `'M' 不是内部或外部命令`（`@echo off` 和下一行被连起来）。
3. **延时**：`timeout.exe` 在装了 Git Bash 的机器上会被 GNU `timeout` 抢走，
   报 `timeout: invalid time interval`。替代的 `ping -n $(( N + 1 ))` 是 bash 语法，
   cmd 不认，且 `$((` 里的 `)` 会提前闭合括号块。
   → 统一用 `node -e "setTimeout(()=>{},N*1000)"` 做延时。

另外：**绝不能反复转换编码**。GBK → 当 UTF-8 读 → 再转 GBK，第二次就会把内容彻底转坏。

---

## set-appid.js

游客 AppID（`touristappid`）只能在模拟器里跑，上传会被拒（`不存在此 AppID`）。

```bash
node tools/set-appid.js                    # 查看当前值 + 获取指引
node tools/set-appid.js wx1234567890abcdef # 设置（带格式校验）
```

AppID 在微信公众平台获取：注册小程序 → 开发管理 → 开发设置 → AppID。

---

## upload-miniprogram.js

完整的上传流程自动化，包含错误诊断：

```bash
node tools/upload-miniprogram.js
```

内部做的事：
1. 开启服务端口
2. 以 CLI 模式启动开发者工具（软件渲染参数，避开 GPU 崩溃）
3. 轮询 `GET /upgrade`，端口一通**立刻**发命令（IDE 在无 GPU 环境只活几秒，要抢时间）
4. `build-npm` → `upload`

失败时会按错误内容给出可执行提示：

| 报错 | 怎么办 |
|---|---|
| `不存在此 AppID` | `node tools/set-appid.js wx你的AppID` |
| `需要重新登录 (code 10)` | 打开开发者工具用微信扫码登录后重试 |
| `IDE 端口未就绪` | 工具 → 设置 → 安全设置 → 打开服务端口 |

---

## check-apps.js

`workbuddy_sites_deploy` 发布小程序目录时，会复用最近创建的应用并改写它的
`.genie` 里的 `localDir`，导致原型应用的产物卡片指向错误目录。

**每次发布后跑一次**：

```bash
node tools/check-apps.js        # 检查
node tools/check-apps.js --fix  # 检查并修复
```

---

## enable-service-port.js

命令行调用开发者工具需要「服务端口」开启。配置在：

```
%LOCALAPPDATA%\微信开发者工具\User Data\<hash>\WeappLocalData\localstorage_<hash>.json
  security.enableServicePort = true
  security.port = <端口>
```

脚本会动态查找配置目录、检测端口占用（被占用就重新分配）、改完提醒重启开发者工具。
