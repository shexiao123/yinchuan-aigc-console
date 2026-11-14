/**
 * 小程序包内插图索引（图片由 tools/sync-miniprogram-media.py 生成）
 *
 * 为什么需要它：数据库里的 image_url / cover_url 大多是网页端的完整外链
 * （https://guangying-web.app.workbuddy.host/assets/covers/...）。小程序要显示
 * 外链图必须在后台配置 downloadFile 合法域名，测试号 / 未绑定正式 AppID 时
 * 一律加载失败，首页就只剩 emoji 和「MG」字母占位。把同一套「按内容匹配」
 * 的冷白实色插画打进包里，云端有自定义封面时优先云端，没有或外链不可信时
 * 用包内图，保证任何环境都看得见画面。
 */

const DIR = '/assets/covers/'

/** 与网页端 webapp/js/api.js 的 CATEGORY_COVER 一一对应 */
const SLUG_NO = {
  'wedding-shoot': 1,      // 婚礼跟拍 · 取景框 + 双人剪影 + 相机
  'wedding-film': 2,       // 婚礼微电影 · 场记板 + 胶片带 + 交叠戒指
  'brand-film': 3,         // 品牌宣传片 · 摄影机 + 三脚架 + 打光
  'short-video': 4,        // 短视频剪辑 · 竖屏手机 + 时间轴 + 音轨
  'commercial-photo': 5,   // 商业摄影 · 柔光箱 + 静物台 + 产品
  'ae-motion': 6,          // AE 动画 · 贝塞尔曲线 + 关键帧 + 图层
  'ai-generate': 7,        // AI 生成 · 节点网络 + 发光核 + 生成粒子
  'comic-drama': 8         // 漫剧制作 · 分格画框 + 对话气泡 + 速度线
}

/** slug 不规范 / 新增分类时按中英文关键词匹配 */
const KEYWORDS = [
  [/婚礼.*(跟拍|摄影)|跟拍|双机位|纪实/, 1],
  [/(微电影|婚礼.*影|爱情.*片|叙事.*片)/, 2],
  [/(宣传片|品牌片|企业.*片|广告片|航拍)/, 3],
  [/(短视频|快剪|剪辑|口播|竖屏|抖音|快手|时间轴)/, 4],
  [/(商业摄影|产品摄影|棚拍|静物|电商图|精修图)/, 5],
  [/(AE|动画|动效|特效|关键帧|图层)/i, 6],
  [/(AI|AIGC|生成|智能|大模型|数字人)/i, 7],
  [/(漫剧|漫画|分镜|二次元|动漫|番剧)/, 8]
]

const BANNER_IMAGES = [
  DIR + 'mp-banner-1.jpg',  // 剪辑监视器工作台
  DIR + 'mp-banner-2.jpg',  // 短视频剪辑
  DIR + 'mp-banner-3.jpg',  // AI 生成
  DIR + 'mp-banner-4.jpg'   // 漫剧制作
]

/** 云端轮播文案 → 同主题插画，避免「摄影师文案配 AI 节点图」这类错配 */
const BANNER_HINTS = [
  [/基地|平台|AIGC|数字文化/i, DIR + 'mp-banner-1.jpg'],  // 剪辑监视器工作台
  [/摄影师|直约|同城|作品与评价|跟拍/, DIR + 'mp-cat-01.jpg'], // 取景框 + 相机
  [/宣传片|品牌片|企业片/, DIR + 'mp-cat-03.jpg'],
  [/短视频|剪辑|快剪|口播/, DIR + 'mp-cat-04.jpg'],
  [/AI|生成|智能|数字人/i, DIR + 'mp-cat-07.jpg'],
  [/漫剧|漫画|分镜/, DIR + 'mp-cat-08.jpg']
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function categoryImage(no) {
  return DIR + 'mp-cat-' + pad(no) + '.jpg'
}

function squareImage(no) {
  return DIR + 'mp-sq-' + pad(no) + '.jpg'
}

/** 稳定兜底：同一个服务每次都拿到同一张图，不会乱跳 */
function hashNo(text) {
  const s = String(text || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 8) + 1
}

/** 站点静态外链里带 l-cat-0N 时，直接换成包内同编号插画 */
function noFromUrl(url) {
  const m = String(url || '').match(/l-cat-0?([1-8])\b/)
  return m ? Number(m[1]) : 0
}

function textOf(o) {
  return [o && o.name, o && o.title, o && o.subtitle, o && o.description,
    o && o.category_name, o && o.category_slug, o && o.slug]
    .filter(Boolean).join(' ')
}

/** 分类 / 服务 → 插画编号（1..8） */
function pickNo(o) {
  if (!o) return 1
  if (SLUG_NO[o.slug]) return SLUG_NO[o.slug]
  if (SLUG_NO[o.category_slug]) return SLUG_NO[o.category_slug]
  const fromUrl = noFromUrl(o.image_url) || noFromUrl(o.cover_url)
  if (fromUrl) return fromUrl
  const cid = Number(o.category_id)
  if (cid >= 1 && cid <= 8) return cid
  const text = textOf(o)
  for (const [re, no] of KEYWORDS) if (re.test(text)) return no
  return hashNo(o.id || text)
}

/** 分类卡 / 详情大图：16:10 主题插画 */
function coverFor(o) {
  return categoryImage(pickNo(o))
}

/** 服务列表 / 订单 / 工作室：方图 */
function squareFor(o) {
  return squareImage(pickNo(o))
}

/** 轮播图：先看文案语义，再看 link_value 指向的分类，最后按顺序轮转 */
function bannerImage(b, index) {
  const text = textOf(b)
  for (const [re, url] of BANNER_HINTS) if (re.test(text)) return url
  const no = SLUG_NO[b && b.link_value] || noFromUrl(b && b.image_url)
  if (no) return categoryImage(no)
  return BANNER_IMAGES[(Number(index) || 0) % BANNER_IMAGES.length]
}

function heroImage() {
  return DIR + 'mp-hero.jpg'
}

/* ---------------------------------------------------------------- 离线演示数据 */
/* 云数据库不可达时（测试号、未绑定 AppID、断网）首页仍要有完整画面。
   数据取自网页端 seed-data.js 的公开快照，不含任何用户 / 会话标识。 */

const CATEGORIES = [
  { id: 1, name: '婚礼跟拍', slug: 'wedding-shoot', icon: '💍', description: '全天跟拍、双机位，纪实或摆拍风格', sort_order: 1 },
  { id: 2, name: '婚礼微电影', slug: 'wedding-film', icon: '🎬', description: '3 分钟成片，AI 修色与声音还原', sort_order: 2 },
  { id: 3, name: '品牌宣传片', slug: 'brand-film', icon: '🎥', description: '脚本策划、分镜、航拍与访谈', sort_order: 3 },
  { id: 4, name: '短视频剪辑', slug: 'short-video', icon: '📱', description: '竖屏快剪、动态字幕、统一调色', sort_order: 4 },
  { id: 5, name: '商业摄影', slug: 'commercial-photo', icon: '📷', description: '棚拍静物、电商图、布景灯光', sort_order: 5 },
  { id: 6, name: 'AE 动画', slug: 'ae-motion', icon: '✨', description: '关键帧动效、MG 动画与图层合成', sort_order: 6 },
  { id: 7, name: 'AI 生成', slug: 'ai-generate', icon: '🤖', description: 'AIGC 视觉生成、数字人与智能修片', sort_order: 7 },
  { id: 8, name: '漫剧制作', slug: 'comic-drama', icon: '🎭', description: '分格画框、对话气泡与整案对接', sort_order: 8 }
]

const BANNERS = [
  { id: 'b1', title: '银川AIGC数字文化产业基地', subtitle: '婚礼微电影 / 宣传片 / 短视频 · 一次下单全程托管', theme: 'amber', link_type: 'all', link_value: '' },
  { id: 'b2', title: '短视频快剪 · 当天交付', subtitle: '竖屏口播精修，字幕音效一次配齐', theme: 'olive', link_type: 'category', link_value: 'short-video' },
  { id: 'b3', title: 'AI 生成视觉工作站', subtitle: '节点生成、智能修片、数字人一体出片', theme: 'rose', link_type: 'category', link_value: 'ai-generate' },
  { id: 'b4', title: '漫剧制作 · 整案对接', subtitle: '分镜、画格、对白到成片全流程', theme: 'amber', link_type: 'category', link_value: 'comic-drama' }
]

const SERVICES = [
  { id: 1, title: '婚礼全天跟拍 · 双机位', subtitle: '单机位升级双机位，含妆造对接与当天精修', price: 299900, original_price: 399900, unit: '单', sales_count: 86, tags: ['双机位', '纪实', '含精修30张'], category_id: 1, status: 'on' },
  { id: 2, title: 'AI 婚礼微电影 · 快剪版', subtitle: '3 分钟成片，含 AI 修色与人物声音还原', price: 199900, original_price: 269900, unit: '单', sales_count: 112, tags: ['AI剪辑', '3分钟', '双规格'], category_id: 2, status: 'on' },
  { id: 4, title: '品牌宣传片 · 标准版', subtitle: '3 分钟成片，含脚本策划与分镜', price: 680000, original_price: 880000, unit: '单', sales_count: 31, tags: ['含脚本', '两机位', '两轮修改'], category_id: 3, status: 'on' },
  { id: 6, title: '短视频快剪 · 口播精修', subtitle: '竖屏 60 秒，含字幕与音效', price: 39900, original_price: 59900, unit: '单', sales_count: 168, tags: ['竖屏', '动态字幕', '含封面'], category_id: 4, status: 'on' },
  { id: 8, title: '商业棚拍 · 电商图', subtitle: '20 张精修，含布景与灯光', price: 260000, original_price: 320000, unit: '单', sales_count: 29, tags: ['含布景', '48小时', '可加急'], category_id: 5, status: 'on' },
  { id: 7, title: '短视频套餐 · 10 条', subtitle: '十条打包，含选题建议与统一调色', price: 320000, original_price: 420000, unit: '单', sales_count: 44, tags: ['套餐', '含选题', '统一调色'], category_id: 4, status: 'on' },
  { id: 9, title: 'AE 动画 · 品牌动态标识', subtitle: '关键帧动效、MG 图形与图层合成', price: 88000, original_price: 128000, unit: '单', sales_count: 23, tags: ['MG动画', '关键帧', '含源文件'], category_id: 6, status: 'on' },
  { id: 10, title: 'AI 生成 · 视觉海报套组', subtitle: '节点生成、智能修片，一次出 8 张', price: 68000, original_price: 98000, unit: '套', sales_count: 37, tags: ['AIGC', '8张', '含商用授权'], category_id: 7, status: 'on' },
  { id: 11, title: '漫剧制作 · 整案对接', subtitle: '分格画框、对话气泡到成片全流程', price: 480000, original_price: 0, unit: '部', sales_count: 12, tags: ['分镜', '整案', '按需报价'], category_id: 8, status: 'on' }
]

function demoCategories() {
  return CATEGORIES.map((c) => ({ ...c, imageUrl: coverFor(c) }))
}

function demoBanners() {
  return BANNERS.map((b, i) => ({ ...b, imageUrl: bannerImage(b, i), hasImage: true }))
}

function demoServices(slug) {
  const no = SLUG_NO[slug] || 0
  const rows = no ? SERVICES.filter((s) => s.category_id === no) : SERVICES
  return rows.map((s) => ({
    ...s,
    coverUrl: squareFor(s),
    localCover: squareFor(s),
    coverUrlWide: coverFor(s)
  }))
}

/**
 * 图片加载失败时把 src 换成包内插画。
 * 页面 wxml：<image src="{{item.coverUrl}}" data-fallback="{{item.localCover}}" binderror="onImageFallback" />
 * 页面 js：onImageFallback: media.makeImageFallback()
 */
function makeImageFallback() {
  return function onImageFallback(e) {
    const d = e.currentTarget.dataset
    if (!d.fallback || !d.field) return
    const name = d.key || 'coverUrl'
    const key = (d.idx === undefined || d.idx === '')
      ? d.field + '.' + name
      : d.field + '[' + d.idx + '].' + name
    const patch = {}
    patch[key] = d.fallback
    this.setData(patch)
  }
}

module.exports = {
  DIR,
  SLUG_NO,
  BANNER_IMAGES,
  categoryImage,
  squareImage,
  pickNo,
  coverFor,
  squareFor,
  bannerImage,
  heroImage,
  demoCategories,
  demoBanners,
  demoServices,
  makeImageFallback
}
