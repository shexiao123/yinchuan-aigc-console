/**
 * 品类需求模板单测（纯 Node，不依赖微信运行时）
 * 运行：node tools/test-req-templates.js
 */
const path = require('path')
const tpl = require(path.join(__dirname, '../miniprogram/utils/requirement-templates.js'))

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  OK  ' + name) }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')) }
}

console.log('\n[1] 8 大品类 + 通用模板')
ok('模板数量为 8', tpl.TEMPLATES.length === 8)
ok('CATEGORIES 数量为 8', tpl.CATEGORIES.length === 8)
ok('每个模板 5 个以上字段', tpl.TEMPLATES.every((t) => t.fields.length >= 5))
ok('每个模板都有补充说明', tpl.TEMPLATES.every((t) => t.fields.some((f) => f.key === 'extra' && f.type === 'textarea')))
ok('每个模板 key 不重复', tpl.TEMPLATES.every((t) => {
  const keys = t.fields.map((f) => f.key)
  return new Set(keys).size === keys.length
}))
ok('每个模板都有 id/name/slug/summary', tpl.TEMPLATES.every((t) => t.id && t.name && t.slug && t.summary))

console.log('\n[2] 品类解析（数字 id / slug / 中文名 / 对象 / 别名）')
ok('数字 id 1 = 婚礼跟拍', tpl.resolve(1).name === '婚礼跟拍')
ok('slug comic-drama = 漫剧制作', tpl.resolve('comic-drama').name === '漫剧制作')
ok('中文名 AI 生成', tpl.resolve('AI 生成').name === 'AI 生成')
ok('别名 ai-create = AI 生成', tpl.resolve('ai-create').name === 'AI 生成')
ok('别名 wedding = 婚礼跟拍', tpl.resolve('wedding').name === '婚礼跟拍')
ok('FALLBACK「漫剧 / 动画」模糊命中', tpl.resolve('漫剧 / 动画').name === '漫剧制作')
ok('对象 {slug:short-video}', tpl.resolve({ slug: 'short-video' }).name === '短视频剪辑')
ok('对象 {id:6}', tpl.resolve({ id: 6 }).name === 'AE 动画')
ok('未知 slug 退回通用', tpl.resolve('unknown-xyz').id === 0)
ok('空值退回通用', tpl.resolve(null).id === 0)
ok('全部 8 个真实 slug 都能命中', tpl.TEMPLATES.every((t) => tpl.resolve(t.slug).id === t.id))

console.log('\n[3] 动态字段模型')
const f1 = tpl.fieldsFor(3)
ok('品牌宣传片字段数 = 9', f1.length === 9, String(f1.length))
ok('picker 默认预选第一项', f1.filter((f) => f.type === 'picker').every((f) => f.optionIndex === 0 && !!f.value))
ok('date 默认空', f1.filter((f) => f.type === 'date').every((f) => !f.value))
ok('input 默认空', f1.filter((f) => f.type === 'input').every((f) => !f.value))
const f2 = tpl.fieldsFor(3, { scenes: '航拍葡萄园' })
ok('preset 能回填已填值', f2.filter((f) => f.key === 'scenes')[0].value === '航拍葡萄园')
const f3 = tpl.fieldsFor(0)
ok('通用模板也有字段', f3.length >= 5)
// 回归：婚礼跟拍→品牌宣传片，同名 deliverable 但选项不同，不能串值
const crossed = tpl.fieldsFor(3, { deliverable: '全部底片' })
const deliverable = crossed.filter((f) => f.key === 'deliverable')[0]
ok('跨品类 picker 非法值回落本品类默认', deliverable.value === '横屏 16:9' && deliverable.optionIndex === 0, deliverable.value)
ok('跨品类不残留他品类选项', deliverable.value.indexOf('全部底片') < 0)

console.log('\n[4] 汇总为规范文本 + 反解析闭环')
const fields = tpl.fieldsFor(3)
fields.forEach((f) => { if (f.key === 'scenes') f.value = '航拍葡萄园 + 车间特写' })
const text = tpl.buildText(fields, 3)
ok('文本每行都是【标签】值', text.split('\n').every((l) => tpl.ROW_RE.test(l.trim())))
ok('文本包含拍摄内容', text.indexOf('【拍摄内容】航拍葡萄园') >= 0)
ok('文本为空值跳过（拍摄日期未填不出现）', text.indexOf('【拍摄日期】') < 0)
const rows = tpl.buildRows({ requirement: text })
ok('反解析出行数 > 5', rows.length > 5, String(rows.length))
ok('反解析保留标签', rows.some((r) => r.label === '拍摄内容' && r.value === '航拍葡萄园 + 车间特写'))
ok('reqFields 优先于文本', (() => {
  const r = tpl.buildRows({ reqCatId: 3, reqFields: [{ key: 'scenes', label: '拍摄内容', value: '来自结构化' }], requirement: text })
  return r.length === 1 && r[0].value === '来自结构化'
})())

console.log('\n[5] 老数据降级（不改一行代码也不会白屏）')
const legacy = tpl.buildRows({ requirement: '需要航拍葡萄园全景 + 酿酒车间特写，访谈 2 位酿酒师，成片 3 分钟。' })
ok('纯文本降级为单行', legacy.length === 1 && legacy[0].label === '需求说明')
ok('降级保留原文', legacy[0].value.indexOf('航拍葡萄园') >= 0)
ok('空记录返回空数组', tpl.buildRows({}).length === 0)
ok('半截规范文本不误判', (() => {
  const r = tpl.buildRows({ requirement: '【成片时长】3 分钟\n另外还需要航拍' })
  return r.length === 1 && r[0].label === '需求说明'
})())
ok('description 字段也能解析（商家任务）', tpl.buildRows({ description: '【集数】12 集\n【每集时长】90 秒' }).length === 2)
const brief = tpl.briefRows({ requirement: text }, 2)
ok('briefRows 只取前 2 行', brief.rows.length === 2 && brief.total === rows.length)

console.log('\n[6] 校验')
ok('全空表单报错', !!tpl.validate(tpl.fieldsFor(3).map((f) => ({ ...f, value: '' }))))
ok('只有 3 个字的补充说明报错', (() => {
  const empty = tpl.fieldsFor(3).map((f) => ({ ...f, value: '' }))
  empty[empty.length - 1].value = 'abc'
  return !!tpl.validate(empty)
})())
ok('有默认 picker 值时不报错', !tpl.validate(tpl.fieldsFor(3)))
ok('填写 input 后不报错', !tpl.validate(tpl.fieldsFor(0).map((f) => f.key === 'deliverable' ? { ...f, value: '3 分钟成片' } : f)))

console.log('\n[7] 演示需求池（6 条按品类完整填写）')
const demandSrc = require('fs').readFileSync(path.join(__dirname, '../miniprogram/utils/demand.js'), 'utf8')
const demoBlock = demandSrc.slice(demandSrc.indexOf('const DEMO = ['), demandSrc.indexOf('/* ------------------------------------------------------------------ 本地存储'))
const normalizedCount = (demoBlock.match(/'\u3010/g) || []).length
ok('演示文本含大量规范标签', normalizedCount >= 40, String(normalizedCount))
ok('6 条演示都有 reqCatId', (demoBlock.match(/reqCatId:/g) || []).length === 6)

console.log('\n[8] 云端零 schema 变更（防幻觉红线）')
const apiSrc = require('fs').readFileSync(path.join(__dirname, '../miniprogram/utils/api.js'), 'utf8')
const body = apiSrc.slice(apiSrc.indexOf('  const body = {', apiSrc.indexOf('async function createOrder')), apiSrc.indexOf("  const res = await cloud.database.from('orders')", apiSrc.indexOf('async function createOrder')))
ok('createOrder 没有新增 req_fields 列', body.indexOf('req_fields') < 0)
ok('createOrder 仍写 requirement 列', body.indexOf('requirement:') >= 0)
ok('createOrder 支持 reqText fallback', body.indexOf('payload.reqText') >= 0)

console.log('\n==============================')
console.log('PASS ' + pass + ' / FAIL ' + fail)
console.log('==============================\n')
process.exit(fail ? 1 : 0)
