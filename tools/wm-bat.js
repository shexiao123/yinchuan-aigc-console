const fs = require('fs')
const p = 'D:/WorkBuddy/2026-10-21-10-58-00/.workbuddy/memory/MEMORY.md'
let s = fs.readFileSync(p, 'utf8')

s += `

## ⚠️ 写 .bat 必须用 GBK 编码（2026-10-23 踩坑）

双端启动.bat 双击无反应、全屏乱码报错，根因是**文件编码**，不是启动逻辑。

**症状**：满屏 \`'xxx' 不是内部或外部命令'\`、%USER_PORT% 不展开（变空），
中文全乱码，但 ASCII 部分看起来正常。

**根因**：cmd.exe 用系统 OEM 代码页（中文 Windows = GBK/936）解析 .bat。
UTF-8 无 BOM 的 .bat 会被按 GBK 解读 → **每个中文字符吃掉后续 ASCII 字节** → 解析错位。
文件里写 \`chcp 65001\` **只影响子进程输出代码页，对 .bat 自身编码无效**。

**规则**：
1. 用 Write 工具写 .bat 后，必须转 GBK + CRLF
2. 项目里 \`打开网页版.bat\` 等历史文件本来就是 GBK，所以它们一直正常 —— 只有新写的会坏
3. 检查：\`node tools/write-bat.js --check *.bat\`
4. 转换：\`node tools/write-bat.js <输出.bat> <UTF-8输入.txt>\`

**同类坑**：Write 工具写 .sh / .py 一般没事（UTF-8 就行），
但 .bat / .cmd / Windows 脚本要用 GBK。

**另外**：双端脚本加了启动后自检（curl 验证两个端口），
不通会直接给排查建议，而不是让舍先生对着白屏猜。
`

fs.writeFileSync(p, s, 'utf8')
console.log('  ✓ 项目 MEMORY.md 已更新')
