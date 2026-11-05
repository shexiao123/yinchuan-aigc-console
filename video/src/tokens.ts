/**
 * 设计令牌 —— 网页端 / 小程序端 / 视频输出 三处共用
 *
 * 视觉基准来自 webapp/assets/tech.css 的未来科技主题（深空蓝 + 霓虹青紫）。
 * 这里是那套主题的「数据可视化专用」子集：图表几何、动效曲线、数值格式。
 *
 * 小程序端没有 DOM，用 canvas 版渲染器读取同一份 tokens，
 * 保证两端画出来的图表完全一致。
 */

/* ---------------- 调色板 ---------------- */

export const colors = {
  // 底
  bg: '#101B30',
  bgDeep: '#0A1222',
  panel: 'rgba(28, 46, 76, 0.62)',
  panelSolid: '#16243E',

  // 霓虹
  brand: '#22D3EE',
  brandDeep: '#0891B2',
  accent: '#A78BFA',
  accent2: '#F472B6',

  // 语义
  good: '#34D399',
  warn: '#FBBF24',
  bad: '#FB7185',

  // 文字
  ink: '#F4FAFF',
  ink2: '#C3D6E8',
  ink3: '#94AEC6',

  // 线
  line: 'rgba(120, 190, 230, 0.20)',
  lineBright: 'rgba(34, 211, 238, 0.45)'
} as const

/** 分类色序（环形图/柱状图按序取用） */
export const seriesColors = [
  '#22D3EE',
  '#A78BFA',
  '#F472B6',
  '#34D399',
  '#FBBF24',
  '#60A5FA',
  '#FB7185',
  '#FB923C'
] as const

/* ---------------- 图表几何 ---------------- */

export const geo = {
  /** 折线图描边宽度 */
  lineWidth: 3,
  /** 折线图填充渐变上透明度 */
  areaFillTop: 0.32,
  areaFillBottom: 0.0,
  /** 柱宽占槽位比例 */
  barRatio: 0.52,
  /** 环形图线宽（占半径比） */
  donutThickness: 0.26,
  /** 环形图起始角（度，-90 = 12 点方向） */
  donutStart: -90,
  /** 圆角（px） */
  radius: 14,
  /** 内边距 */
  pad: 28
} as const

/* ---------------- 动效 ---------------- */

/**
 * 统一缓动
 *
 * Remotion 的 interpolate 的 easing 收的是函数（EasingFunction），
 * 不是 CSS 的 cubic-bezier 数组 —— 这里用 Easing.bezier 包一层。
 */
import {Easing} from 'remotion'

export const easing = {
  /** 入场：快起慢收 */
  enter: Easing.bezier(0.16, 1, 0.3, 1),
  /** 数据生长 */
  grow: Easing.bezier(0.33, 1, 0.68, 1),
  /** 线性（数字滚动用） */
  linear: Easing.linear
} as const

/** 各元素入场延迟（帧） */
export const timing = {
  /** 每个 KPI 卡之间错开 */
  kpiStagger: 6,
  /** 图表区入场延迟 */
  chartDelay: 18,
  /** 数字滚动时长 */
  countDuration: 40,
  /** 单个条形错开 */
  barStagger: 5,
  /** 场景总长（秒） */
  dashboardSeconds: 12,
  shareCardSeconds: 8
} as const

/* ---------------- 数值格式 ---------------- */

/** 金额：12345 → 1.2万 */
export function yuanShort(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return String(Math.round(n))
}

/** 金额带符号：¥1.2万 */
export function yuanLabel(n: number): string {
  return '¥' + yuanShort(n)
}

/** 千分位 */
export function comma(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 百分比 */
export function pct(part: number, total: number): string {
  if (!total) return '0%'
  return Math.round((part / total) * 100) + '%'
}

/* ---------------- 数据结构 ---------------- */

export interface TrendPoint {
  date: string
  count: number
  amount: number
}

export interface TopService {
  id: number
  title: string
  provider: string
  sales: number
  price: number
  status: string
}

export interface CategorySlice {
  name: string
  count: number
}

/** 管理端数据总览 —— 与 api.js 的 adminStats() 返回字段严格对齐 */
export interface DashboardData {
  total: number
  open: number
  taken: number
  producing: number
  delivered: number
  completed: number
  cancelled: number
  gmv: number
  commission: number
  providers: number
  verifiedProviders: number
  services: number
  onShelf: number
  categories: number
  reviews: number
  avgRating: string
  pendingApplications: number
  pendingSettlements: number
  trend: TrendPoint[]
  topServices: TopService[]
  byCategory: CategorySlice[]
}

export const emptyData: DashboardData = {
  total: 0,
  open: 0,
  taken: 0,
  producing: 0,
  delivered: 0,
  completed: 0,
  cancelled: 0,
  gmv: 0,
  commission: 0,
  providers: 0,
  verifiedProviders: 0,
  services: 0,
  onShelf: 0,
  categories: 0,
  reviews: 0,
  avgRating: '0.0',
  pendingApplications: 0,
  pendingSettlements: 0,
  trend: [],
  topServices: [],
  byCategory: []
}
