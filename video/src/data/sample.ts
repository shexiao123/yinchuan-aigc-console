import type {DashboardData} from '../tokens'

/**
 * 样例数据 —— 用于预览和渲染演示
 * 真实运行时由 API.adminStats() 提供，字段完全对齐
 */
export const sampleData: DashboardData = {
  gmv: 286400,
  commission: 28640,
  total: 128,
  completed: 96,
  taken: 12,
  producing: 8,
  delivered: 7,
  open: 5,
  providers: 42,
  services: 13,
  onShelf: 11,
  cancelled: 3,
  verifiedProviders: 36,
  categories: 7,
  avgRating: '4.8',
  pendingSettlements: 2,
  reviews: 76,
  pendingApplications: 3,
  trend: [
    {date: '10-22', count: 12, amount: 26800},
    {date: '10-23', count: 18, amount: 39400},
    {date: '10-24', count: 9, amount: 21600},
    {date: '10-25', count: 23, amount: 51200},
    {date: '10-26', count: 27, amount: 58600},
    {date: '10-27', count: 21, amount: 46300},
    {date: '10-28', count: 18, amount: 42500}
  ],
  topServices: [
    {id: 1, title: '婚礼全天跟拍 · 双机位', provider: '沈屿', sales: 32, price: 4800, status: 'active'},
    {id: 2, title: 'AI 婚礼微电影 · 快剪版', provider: '林晚', sales: 28, price: 3600, status: 'active'},
    {id: 3, title: '品牌宣传片 · 标准版', provider: '周野', sales: 19, price: 8800, status: 'active'},
    {id: 4, title: '短视频快剪 · 口播精修', provider: '陈默', sales: 15, price: 1200, status: 'active'},
    {id: 5, title: 'AI 数字人视频 · 口播带货', provider: '苏澈', sales: 11, price: 2600, status: 'active'}
  ],
  byCategory: [
    {name: '婚礼跟拍', count: 3},
    {name: '婚礼微电影', count: 2},
    {name: '品牌宣传片', count: 2},
    {name: '短视频剪辑', count: 2},
    {name: '商业摄影', count: 2},
    {name: 'AE 动画', count: 1},
    {name: 'AI 生成', count: 1}
  ]
}
