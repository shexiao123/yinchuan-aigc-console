/**
 * 品类需求模板 · 唯一真源
 *
 * 设计目标：让「婚礼跟拍」「品牌宣传片」「漫剧制作」等每个项目类型，
 * 发布时都有自己专属的需求字段，而不是所有人共用一个大文本框。
 *
 * 三条硬约束（改动前务必读）：
 * 1) 云端 orders 表只有 requirement 一个文本列，不能新增列，否则 insert 会失败。
 *    因此结构化字段统一汇总成 `【标签】值` 逐行的规范文本，仍写回原字段。
 * 2) 老数据（演示需求池、历史任务/订单）只有自然语言纯文本，展示端必须能降级。
 *    buildRows() 优先读 reqFields，其次反解析规范文本，最后退回「需求说明」单行。
 * 3) 本项目有三套品类标识：数字 id(1-8) / slug / 中文名，resolve() 统一收口。
 *
 * 纯数据 + 纯函数，不依赖 wx / Page，可在 Node 下单测。
 */

/* ------------------------------------------------------------------ 字段构造 */

/** 生成一个字段定义。type: input | textarea | picker | date */
function f(key, label, type, extra) {
  return Object.assign(
    { key, label, type, placeholder: '', options: [], required: false },
    extra || {}
  )
}

/** picker 字段（第一个选项作为常见默认值，用户可改） */
function pick(key, label, options, placeholder) {
  return f(key, label, 'picker', {
    options,
    placeholder: placeholder || '请选择',
    defaultValue: options[0] || ''
  })
}

function input(key, label, placeholder) {
  return f(key, label, 'input', { placeholder: placeholder || '' })
}

/** 每个模板末尾统一的补充说明 */
function extraField() {
  return f('extra', '补充说明', 'textarea', {
    placeholder: '其他要求、参考资料、验收标准，写得越细接单越快',
    maxlength: 300
  })
}

/* ------------------------------------------------------------------ 8 大品类 */

const TEMPLATES = [
  {
    id: 1,
    name: '婚礼跟拍',
    slug: 'wedding-shoot',
    summary: '档期、机位、精修与交付物',
    fields: [
      f('shootDate', '拍摄日期', 'date', { placeholder: '选择婚期' }),
      input('venue', '拍摄地点', '例：银川 · 阅海宾馆 / 新娘家'),
      pick('camera', '机位要求', ['单机位', '双机位', '三机位及以上']),
      pick('duration', '服务时长', ['半天', '全天跟拍', '全天 + 晚宴']),
      pick('retouch', '精修张数', ['9 张', '20 张', '30 张', '50 张以上']),
      pick('deliverable', '交付物', ['全部底片', '底片 + 精修', '底片 + 精修 + 当日快剪']),
      pick('style', '风格倾向', ['纪实自然', '唯美摆拍', '电影感']),
      extraField()
    ]
  },
  {
    id: 2,
    name: '婚礼微电影',
    slug: 'wedding-film',
    summary: '成片规格、故事线与声音',
    fields: [
      f('shootDate', '拍摄日期', 'date', { placeholder: '选择婚期' }),
      pick('filmLength', '成片时长', ['1 分钟', '3 分钟', '5 分钟', '8 分钟以上']),
      pick('story', '故事线', ['现场纪实剪辑', '需服务方策划脚本', '定制爱情故事短片']),
      pick('ratio', '画幅', ['横屏 16:9', '竖屏 9:16', '横竖双版本']),
      pick('music', '配乐', ['平台商用曲库', '客户指定曲目', '原创配乐']),
      pick('colorAI', 'AI 智能修色', ['需要', '不需要']),
      pick('revisions', '修改轮次', ['1 轮', '2 轮', '3 轮']),
      extraField()
    ]
  },
  {
    id: 3,
    name: '品牌宣传片',
    slug: 'brand-film',
    summary: '脚本、拍摄内容、字幕与交付规格',
    fields: [
      pick('filmLength', '成片时长', ['30 秒', '1 分钟', '3 分钟', '5 分钟以上']),
      input('scenes', '拍摄内容', '例：航拍葡萄园 + 车间特写 + 2 位酿酒师访谈'),
      pick('script', '脚本分镜', ['客户已提供', '需服务方策划', '仅拍摄剪辑']),
      pick('interview', '访谈人数', ['不需要', '1-2 位', '3-5 位', '5 位以上']),
      pick('subtitle', '字幕', ['中文字幕', '中英双语', '不需要']),
      pick('music', '配乐', ['商用授权配乐', '客户指定', '不需要']),
      pick('deliverable', '交付格式', ['横屏 16:9', '竖屏 9:16', '横竖双版本', '含 15 秒剪辑版']),
      pick('revisions', '修改轮次', ['1 轮', '2 轮', '3 轮']),
      extraField()
    ]
  },
  {
    id: 4,
    name: '短视频剪辑',
    slug: 'short-video',
    summary: '条数、画幅、包装与结算方式',
    fields: [
      pick('count', '视频条数', ['单条', '每周 5 条', '每月 20 条', '长期合作']),
      pick('length', '单条时长', ['15 秒内', '30 秒', '60 秒', '1-3 分钟']),
      pick('ratio', '画幅', ['竖屏 9:16', '横屏 16:9', '方形 1:1']),
      pick('caption', '动态字幕', ['需要', '不需要']),
      pick('cover', '封面设计', ['需要', '不需要']),
      pick('grading', '统一调色', ['需要', '不需要']),
      pick('material', '素材来源', ['客户提供', '需服务方代拍']),
      pick('settlement', '结算方式', ['按条结算', '按月结算', '按项目结算']),
      extraField()
    ]
  },
  {
    id: 5,
    name: '商业摄影',
    slug: 'commercial-photo',
    summary: '款数、张数、棚拍规格与授权',
    fields: [
      input('skuCount', '产品款数', '例：20 款枸杞产品'),
      pick('perSku', '每款张数', ['白底 5 张', '白底 + 场景 7 张', '10 张以上']),
      pick('shootType', '拍摄方式', ['棚拍白底', '场景布景', '模特实拍', '组合方案']),
      pick('retouch', '是否含精修', ['含精修', '仅原片']),
      pick('detailCut', '详情页切图', ['需要', '不需要']),
      pick('format', '交付格式', ['JPG', 'RAW + JPG', '含透明底 PNG']),
      pick('license', '商用授权', ['需要商用授权', '仅内部使用']),
      extraField()
    ]
  },
  {
    id: 6,
    name: 'AE 动画',
    slug: 'ae-motion',
    summary: '动效类型、分辨率与源文件',
    fields: [
      pick('length', '动画时长', ['5 秒', '10 秒', '15 秒', '30 秒以上']),
      pick('resolution', '分辨率', ['1080P', '2K', '4K']),
      pick('motionType', '动效类型', ['品牌动态标识', 'MG 图形动画', '关键帧特效', '图层合成']),
      pick('sourceFile', '是否含源文件', ['含 AE 工程文件', '只要成片']),
      pick('format', '输出格式', ['MP4', 'MOV', '含透明通道', 'GIF']),
      pick('sound', '配乐音效', ['需要', '不需要']),
      pick('revisions', '修改轮次', ['1 轮', '2 轮', '3 轮']),
      extraField()
    ]
  },
  {
    id: 7,
    name: 'AI 生成',
    slug: 'ai-generate',
    summary: '主题、数量、风格与商用授权',
    fields: [
      input('theme', '生成主题', '例：西夏陵、镇北堡、沙湖文旅海报'),
      pick('count', '生成数量', ['4 张', '8 张', '12 张', '20 张以上']),
      pick('size', '画幅尺寸', ['竖版海报', '横版 Banner', '方形 1:1', '自定义尺寸']),
      pick('style', '视觉风格', ['国潮', '写实摄影', '3D 渲染', '扁平插画', '水墨']),
      pick('license', '商用授权', ['需要商用授权', '仅个人/内部使用']),
      pick('typography', '含文字排版', ['需要', '不需要']),
      pick('revisions', '修改轮次', ['1 轮', '2 轮', '3 轮']),
      extraField()
    ]
  },
  {
    id: 8,
    name: '漫剧制作',
    slug: 'comic-drama',
    summary: '集数、剧本状态、配音与交付范围',
    fields: [
      input('episodes', '集数', '例：12 集'),
      pick('perEpisode', '每集时长', ['60 秒', '90 秒', '3 分钟', '5 分钟']),
      pick('script', '剧本状态', ['剧本已定', '有大纲需扩写', '需原创编剧']),
      pick('artStyle', '画风', ['国漫', '日漫', '写实厚涂', 'Q 版']),
      pick('voice', '配音', ['需配音对接', 'AI 配音', '客户提供音轨']),
      pick('deliverable', '交付范围', ['分镜 + 画格', '含配音对接', '整案到成片']),
      pick('cadence', '更新节奏', ['一次性交付', '按周更新', '按集结算']),
      extraField()
    ]
  }
]

/** 未匹配品类（含「其他」）的通用模板，保证任何入口都有字段可填 */
const GENERIC = {
  id: 0,
  name: '综合服务',
  slug: 'other',
  summary: '交付物、规格、风格与验收标准',
  fields: [
    input('deliverable', '交付物', '例：3 分钟成片 + 15 秒竖版剪辑'),
    input('spec', '规格要求', '例：4K / 横竖双版本 / 含字幕'),
    pick('style', '风格倾向', ['简洁商业', '纪实自然', '电影感', '活泼年轻']),
    pick('revisions', '修改轮次', ['1 轮', '2 轮', '3 轮']),
    input('acceptance', '验收标准', '例：成片无水印、字幕无错别字'),
    extraField()
  ]
}

/* ------------------------------------------------------------------ 品类解析 */

/** slug 别名：云端 / FALLBACK_CATS / 简写统一收敛到数字 id */
const SLUG_ALIAS = {
  'wedding-shoot': 1, wedding: 1, 'wedding-photo': 1,
  'wedding-film': 2, 'wedding-micro-film': 2,
  'brand-film': 3, brand: 3,
  'short-video': 4, video: 4,
  'commercial-photo': 5, photo: 5,
  'ae-motion': 6, ae: 6,
  'ai-generate': 7, 'ai-create': 7, ai: 7,
  'comic-drama': 8, comic: 8,
  other: 0, general: 0
}

/**
 * 中文展示名关键词（长词在前，避免「婚礼微电影」被「婚礼」抢先命中）。
 * FALLBACK_CATS 里有「漫剧 / 动画」「AI 生成 / 修图」这类复合名，
 * 精确名匹配不到时靠这张表兜底。
 */
const NAME_HINTS = [
  ['漫剧', 8], ['婚礼微电影', 2], ['微电影', 2], ['品牌宣传片', 3], ['宣传片', 3],
  ['短视频', 4], ['剪辑', 4], ['商业摄影', 5], ['摄影', 5], ['棚拍', 5],
  ['AI 生成', 7], ['ai生成', 7], ['修图', 7], ['AE', 6], ['动画', 6],
  ['婚礼', 1], ['其他', 0], ['综合', 0]
]

/**
 * 统一解析品类：支持数字 id / slug / 中文名 / {id,slug,name} 对象。
 * 永远返回一个模板（找不到退回通用），调用方不需要判空。
 */
function resolve(key) {
  if (key && typeof key === 'object') {
    const t = resolve(key.id)
    if (t.id) return t
    const t2 = resolve(key.slug)
    if (t2.id) return t2
    return resolve(key.name)
  }
  if (typeof key === 'number' || /^\d+$/.test(String(key || ''))) {
    const id = Number(key)
    return TEMPLATES.filter((x) => x.id === id)[0] || GENERIC
  }
  const s = String(key || '').trim()
  if (!s) return GENERIC
  const byName = TEMPLATES.filter((x) => x.name === s || x.name.replace(/\s/g, '') === s.replace(/\s/g, ''))[0]
  if (byName) return byName
  const lower = s.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(SLUG_ALIAS, lower)) {
    const id = SLUG_ALIAS[lower]
    return id === 0 ? GENERIC : (TEMPLATES.filter((x) => x.id === id)[0] || GENERIC)
  }
  // 中文名包含匹配（容错「AI 生成 / 修图」「漫剧 / 动画」这类展示名）
  const exact = TEMPLATES.filter((x) => s.indexOf(x.name) >= 0 || x.name.indexOf(s) >= 0)[0]
  if (exact) return exact
  for (let i = 0; i < NAME_HINTS.length; i++) {
    const kw = NAME_HINTS[i][0]
    const id = NAME_HINTS[i][1]
    if (s.indexOf(kw) >= 0 || lower.indexOf(kw.toLowerCase()) >= 0) {
      return id === 0 ? GENERIC : (TEMPLATES.filter((x) => x.id === id)[0] || GENERIC)
    }
  }
  return GENERIC
}

function byId(id) {
  return resolve(id)
}

function all() {
  return TEMPLATES.map((t) => ({ id: t.id, name: t.name, slug: t.slug, summary: t.summary }))
}

/* ------------------------------------------------------------------ 表单模型 */

/**
 * 生成可直接丢给 WXML 渲染的字段数组。
 * @param {*} key 品类（id / slug / name / 对象）
 * @param {Object} preset 已填值 { key: value }，切换品类时保留同名项
 */
function fieldsFor(key, preset) {
  const tpl = resolve(key)
  const pre = preset || {}
  return tpl.fields.map((raw) => {
    const field = {
      key: raw.key,
      label: raw.label,
      type: raw.type,
      placeholder: raw.placeholder,
      options: raw.options.slice(),
      maxlength: raw.maxlength || 0,
      value: Object.prototype.hasOwnProperty.call(pre, raw.key) ? String(pre[raw.key] || '') : '',
      optionIndex: -1
    }
    // picker 默认预选第一项作为「常见选择」，避免必填卡住发布。
    // 关键：preset 来自「切换品类前的同名 key」，若该值不属于当前品类的选项
    // （例：婚礼跟拍的「全部底片」串到品牌宣传片的「交付格式」），必须回落默认，
    // 否则会出现张冠李戴的需求内容。
    if (field.type === 'picker') {
      const idx = field.options.indexOf(field.value)
      if (idx >= 0) {
        field.optionIndex = idx
      } else {
        field.value = raw.defaultValue || ''
        field.optionIndex = field.value ? 0 : -1
      }
    }
    return field
  })
}

/** 从字段数组里取出 { key: value }，只保留有值的 */
function valuesOf(fields) {
  const out = {}
  ;(fields || []).forEach((x) => {
    const v = String(x.value || '').trim()
    if (v) out[x.key] = v
  })
  return out
}

/**
 * 汇总成规范文本，写回原有 requirement / description 字段。
 * 格式：每行 `【标签】值`，展示端可反解析；空值跳过。
 * 云端 orders 表零改动，老页面读到的仍是一段可读文本。
 */
function buildText(fields, key) {
  const tpl = resolve(key)
  const labelOf = {}
  tpl.fields.forEach((x) => { labelOf[x.key] = x.label })
  const lines = []
  ;(fields || []).forEach((x) => {
    const v = String(x.value || '').trim()
    if (!v) return
    lines.push('【' + (labelOf[x.key] || x.label || x.key) + '】' + v)
  })
  return lines.join('\n')
}

/** 校验：至少填 1 项实质内容，返回错误提示（无错误返回空串） */
function validate(fields) {
  const values = valuesOf(fields)
  const keys = Object.keys(values)
  if (!keys.length) return '请至少填写 1 项项目需求'
  // 只有补充说明、且过短时也提示
  if (keys.length === 1 && keys[0] === 'extra' && String(values.extra).length < 6) {
    return '需求描述再写细一点'
  }
  return ''
}

/* ------------------------------------------------------------------ 展示模型 */

const ROW_RE = /^【([^】]+)】(.+)$/

/**
 * 把记录转成展示用的键值行，三级降级：
 *   ① reqFields（结构化数组/对象）→ 直接用
 *   ② requirement/description 里的 `【标签】值` 规范文本 → 反解析
 *   ③ 老数据纯文本 → 单行「需求说明」
 * @returns {Array<{label:string, value:string}>}
 */
function buildRows(record) {
  const r = record || {}
  // ① 结构化字段
  if (r.reqFields) {
    const tpl = resolve(r.reqCatId || r.categoryId || r.category_id || r.category_slug)
    const labelOf = {}
    tpl.fields.forEach((x) => { labelOf[x.key] = x.label })
    let rows = []
    if (Array.isArray(r.reqFields)) {
      rows = r.reqFields.map((x) => ({
        label: x.label || labelOf[x.key] || x.key,
        value: String(x.value || '').trim()
      }))
    } else if (typeof r.reqFields === 'object') {
      rows = Object.keys(r.reqFields).map((k) => ({
        label: labelOf[k] || k,
        value: String(r.reqFields[k] || '').trim()
      }))
    }
    rows = rows.filter((x) => x.value)
    if (rows.length) return rows
  }
  // ② 规范文本反解析
  const text = String(r.requirement || r.description || r.reqText || '').trim()
  if (text) {
    const lines = text.split('\n')
    const parsed = []
    lines.forEach((line) => {
      const m = ROW_RE.exec(line.trim())
      if (m) parsed.push({ label: m[1].trim(), value: m[2].trim() })
    })
    // 规范文本：所有非空行都能解析才认为是结构化，避免半截误判
    const nonEmpty = lines.filter((l) => l.trim())
    if (parsed.length && parsed.length === nonEmpty.length) return parsed
    // ③ 老数据降级
    return [{ label: '需求说明', value: text }]
  }
  return []
}

/** 列表卡片的短摘要（取前 2 行） */
function briefRows(record, limit) {
  const rows = buildRows(record)
  const n = limit || 2
  return { rows: rows.slice(0, n), total: rows.length }
}

module.exports = {
  TEMPLATES,
  GENERIC,
  CATEGORIES: all(),
  resolve,
  byId,
  all,
  fieldsFor,
  valuesOf,
  buildText,
  validate,
  buildRows,
  briefRows,
  ROW_RE
}
