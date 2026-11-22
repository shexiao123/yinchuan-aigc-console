/**
 * 管理端演示数据（100% 合成，不含任何真实客户信息）
 *
 * 为什么单独放一份：
 *   1. 订单、结算、会员、客服这些表涉及客户姓名/手机号/金额，
 *      绝对不能进公开离线快照（见 tools/make-seed.py 的安全约定）；
 *   2. 但 GitHub Pages 域名读不到云数据库，管理端如果只拿公开快照，
 *      看板会是「成交额 ¥0 / 订单 0 单」，看不出后台到底长什么样。
 *
 * 做法：这里用一套完全虚构的数据补齐管理端需要的表，只在离线只读演示模式下
 *      由 offline.js 合并进 SEED。姓名虚构、手机号打码、订单号带 DEMO 前缀，
 *      金额单位与线上一致（分）。
 *
 * 日期在运行时按「几天前」生成，保证近 7 天趋势、逾期徽标始终有内容。
 */
;(function () {
  'use strict'
  if (window.ADMIN_DEMO) return

  var DAY = 86400000

  /** n 天前的 hh:mm（本地时区，转 ISO；取 10 点避免跨时区串日） */
  function ago(n, hh, mm) {
    var t = new Date()
    t.setHours(hh == null ? 10 : hh, mm == null ? 0 : mm, 0, 0)
    return new Date(t.getTime() - n * DAY).toISOString()
  }
  /** n 天后的 hh:mm */
  function later(n, hh, mm) {
    return ago(-n, hh, mm)
  }
  function fee(amount) {
    return Math.round(amount * 0.12)
  }

  /* ---------------- 订单（26 单：已完成 10 / 待接单 5 / 已接单 3 / 制作中 3 / 已交付 2 / 已取消 3） ---------------- */
  var CUSTOMERS = [
    '王*', '李*', '张*', '刘*', '陈*', '杨*', '赵*', '黄*', '周*', '吴*',
    '徐*', '孙*', '马*', '朱*', '胡*', '郭*'
  ]
  var TITLES = [
    ['婚礼全天跟拍 · 双机位', 6, 299900, 1],
    ['短视频快剪 · 口播精修', 4, 39900, 4],
    ['AE 动效包装 · 30 秒', 4, 129900, 5],
    ['活动摄影 · 半日', 1, 159900, 2],
    ['电商主图精修 · 20 张', 4, 49900, 4],
    ['AI 短片生成 · 15 秒', 3, 69900, 6],
    ['漫剧分集制作 · 第 1 集', 3, 450000, 7],
    ['婚礼跟拍 · 单机位', 2, 199900, 1],
    ['宣传片剪辑 · 3 分钟', 4, 259900, 5],
    ['证件照精修 · 全套', 1, 9900, 2]
  ]
  var STATUS_PLAN = [
    ['completed', 10], ['open', 5], ['taken', 3],
    ['producing', 3], ['delivered', 2], ['cancelled', 3]
  ]

  var orders = []
  var seq = 0
  STATUS_PLAN.forEach(function (pair) {
    var status = pair[0]
    var count = pair[1]
    for (var i = 0; i < count; i++) {
      var tpl = TITLES[seq % TITLES.length]
      var dayAgo = (seq * 3) % 7
      seq++
      var amount = tpl[2]
      var providerIdx = (seq % 6) + 1
      orders.push({
        id: 9000 + seq,
        order_no: 'DEMO' + String(9000 + seq),
        title: tpl[0],
        brief: '演示数据 · 需求说明占位',
        amount: amount,
        platform_fee: fee(amount),
        status: status,
        provider_id: providerIdx,
        customer_id: 'demo-c-' + ((seq % 10) + 1),
        customer_name: CUSTOMERS[seq % CUSTOMERS.length],
        service_id: tpl[3],
        category_id: tpl[1],
        is_demo: true,
        created_at: ago(dayAgo, 9 + (seq % 9), (seq * 7) % 60),
        updated_at: ago(dayAgo, 15, 20),
        deadline: later(3 + (seq % 8), 18, 0)
      })
    }
  })

  /* ---------------- 结算单 ---------------- */
  var settlements = [
    { id: 8001, period: '2026-11', provider_id: 1, order_count: 4, gross_amount: 1299600, commission_amount: 155952, net_amount: 1143648, status: 'pending', created_at: ago(2, 11, 0) },
    { id: 8002, period: '2026-11', provider_id: 3, order_count: 6, gross_amount: 239400, commission_amount: 28728, net_amount: 210672, status: 'pending', created_at: ago(2, 11, 0) },
    { id: 8003, period: '2026-11', provider_id: 4, order_count: 3, gross_amount: 389700, commission_amount: 46764, net_amount: 342936, status: 'pending', created_at: ago(5, 11, 0) },
    { id: 8004, period: '2026-10', provider_id: 1, order_count: 5, gross_amount: 1499500, commission_amount: 179940, net_amount: 1319560, status: 'paid', created_at: ago(22, 11, 0) },
    { id: 8005, period: '2026-10', provider_id: 5, order_count: 7, gross_amount: 909300, commission_amount: 109116, net_amount: 800184, status: 'paid', created_at: ago(22, 11, 0) }
  ]

  /* ---------------- 服务者入驻申请 ---------------- */
  var provider_applications = [
    { id: 7001, nickname: '朔方影像工作室', bio: '银川本地团队，主拍婚礼与政务活动，双机位 + 航拍。', city: '银川', tags: ['婚礼跟拍', '航拍', '活动'], applicant_uid: 'demo-u-01', applicant_name: '何*', status: 'pending', created_at: ago(1, 16, 20) },
    { id: 7002, nickname: '六盘山剪辑社', bio: '短视频批量剪辑，日更账号代运营，48 小时交付。', city: '固原', tags: ['短视频剪辑', '口播'], applicant_uid: 'demo-u-02', applicant_name: '马*', status: 'pending', created_at: ago(2, 10, 5) },
    { id: 7003, nickname: '沙湖视觉', bio: '电商视觉全案，产品摄影 + 详情页设计。', city: '石嘴山', tags: ['商业摄影', '电商'], applicant_uid: 'demo-u-03', applicant_name: '柳*', status: 'approved', created_at: ago(9, 14, 40) },
    { id: 7004, nickname: '黄河动漫组', bio: 'AI 漫剧分镜与配音，全流程独立完成。', city: '吴忠', tags: ['漫剧制作', 'AI 生成'], applicant_uid: 'demo-u-04', applicant_name: '丁*', status: 'rejected', admin_note: '作品集与申报品类不符，建议补 3 集完整成片后重提', created_at: ago(13, 9, 15) }
  ]

  /* ---------------- 商家 ---------------- */
  var merchants = [
    { id: 6001, name: '银川西夏区「拾光」婚礼馆', category_slug: 'wedding-plan', city: '银川', owner_id: 'demo-m-01', status: 'active', payment_status: 'paid', paid_until: later(240, 0, 0), plan_code: 'merchant_year', contact: '王*', created_at: ago(150, 10, 0) },
    { id: 6002, name: '贺兰山葡萄酒庄影像需求部', category_slug: 'brand-ad', city: '银川', owner_id: 'demo-m-02', status: 'active', payment_status: 'paid', paid_until: later(18, 0, 0), plan_code: 'merchant_half', contact: '李*', created_at: ago(96, 11, 30) },
    { id: 6003, name: '中卫沙坡头文旅运营公司', category_slug: 'travel-shoot', city: '中卫', owner_id: 'demo-m-03', status: 'active', payment_status: 'pending', paid_until: null, plan_code: 'merchant_year', contact: '张*', created_at: ago(12, 15, 10) },
    { id: 6004, name: '吴忠早茶品牌策划部', category_slug: 'food-shoot', city: '吴忠', owner_id: 'demo-m-04', status: 'active', payment_status: 'paid', paid_until: later(5, 0, 0), plan_code: 'merchant_quarter', contact: '马*', created_at: ago(80, 9, 0) },
    { id: 6005, name: '石嘴山工业记忆展陈项目组', category_slug: 'doc-film', city: '石嘴山', owner_id: 'demo-m-05', status: 'disabled', payment_status: 'paid', paid_until: ago(20, 0, 0), plan_code: 'merchant_half', contact: '刘*', created_at: ago(210, 14, 0) },
    { id: 6006, name: '固原冷凉蔬菜区域公用品牌', category_slug: 'brand-ad', city: '固原', owner_id: 'demo-m-06', status: 'active', payment_status: 'unpaid', paid_until: null, plan_code: 'merchant_year', contact: '何*', created_at: ago(4, 16, 45) }
  ]

  /* ---------------- 商家入驻缴费单 ---------------- */
  var merchant_enroll_orders = [
    { id: 5001, order_no: 'DEMO-E-5001', merchant_id: 6001, merchant_name: merchants[0].name, plan_code: 'merchant_year', amount_cents: 398000, status: 'paid', created_at: ago(150, 10, 5) },
    { id: 5002, order_no: 'DEMO-E-5002', merchant_id: 6002, merchant_name: merchants[1].name, plan_code: 'merchant_half', amount_cents: 228000, status: 'paid', created_at: ago(96, 11, 35) },
    { id: 5003, order_no: 'DEMO-E-5003', merchant_id: 6003, merchant_name: merchants[2].name, plan_code: 'merchant_year', amount_cents: 398000, status: 'pending', created_at: ago(12, 15, 12) },
    { id: 5004, order_no: 'DEMO-E-5004', merchant_id: 6004, merchant_name: merchants[3].name, plan_code: 'merchant_quarter', amount_cents: 128000, status: 'paid', created_at: ago(80, 9, 5) },
    { id: 5005, order_no: 'DEMO-E-5005', merchant_id: 6006, merchant_name: merchants[5].name, plan_code: 'merchant_year', amount_cents: 398000, status: 'pending', created_at: ago(4, 16, 50) }
  ]

  /* ---------------- 会员订阅 ---------------- */
  var member_subscriptions = [
    { id: 4101, user_id: 'demo-u-11', customer_name: '王*', tier: 'pro', status: 'active', amount_cents: 9900, start_at: ago(40, 0, 0), expire_at: later(5, 0, 0), created_at: ago(40, 12, 0) },
    { id: 4102, user_id: 'demo-u-12', customer_name: '李*', tier: 'studio', status: 'active', amount_cents: 19900, start_at: ago(60, 0, 0), expire_at: later(120, 0, 0), created_at: ago(60, 9, 30) },
    { id: 4103, user_id: 'demo-u-13', customer_name: '张*', tier: 'basic', status: 'active', amount_cents: 3900, start_at: ago(20, 0, 0), expire_at: later(3, 0, 0), created_at: ago(20, 18, 10) },
    { id: 4104, user_id: 'demo-u-14', customer_name: '刘*', tier: 'pro', status: 'active', amount_cents: 9900, start_at: ago(15, 0, 0), expire_at: later(75, 0, 0), created_at: ago(15, 11, 0) },
    { id: 4105, user_id: 'demo-u-15', customer_name: '陈*', tier: 'basic', status: 'expired', amount_cents: 3900, start_at: ago(70, 0, 0), expire_at: ago(10, 0, 0), created_at: ago(70, 10, 0) }
  ]

  var member_payment_orders = [
    { id: 4201, order_no: 'DEMO-M-4201', user_id: 'demo-u-11', plan_name: '专业会员 · 月付', amount_cents: 9900, fee_type: 'member', status: 'paid', created_at: ago(40, 12, 0) },
    { id: 4202, order_no: 'DEMO-M-4202', user_id: 'demo-u-12', plan_name: '工作室会员 · 半年', amount_cents: 19900, fee_type: 'member', status: 'paid', created_at: ago(60, 9, 30) },
    { id: 4203, order_no: 'DEMO-M-4203', user_id: 'demo-u-13', plan_name: '基础会员 · 月付', amount_cents: 3900, fee_type: 'member', status: 'paid', created_at: ago(20, 18, 10) },
    { id: 4204, order_no: 'DEMO-M-4204', user_id: 'demo-u-16', plan_name: '专业会员 · 月付', amount_cents: 9900, fee_type: 'member', status: 'pending', created_at: ago(1, 20, 15) }
  ]

  var provider_deposits = [
    { id: 4301, provider_id: 1, amount_cents: 50000, status: 'held', created_at: ago(45, 10, 0) },
    { id: 4302, provider_id: 3, amount_cents: 50000, status: 'held', created_at: ago(38, 14, 20) },
    { id: 4303, provider_id: 5, amount_cents: 50000, status: 'held', created_at: ago(12, 9, 40) },
    { id: 4304, provider_id: 2, amount_cents: 50000, status: 'released', created_at: ago(90, 16, 0) }
  ]

  /* ---------------- 客服会话 ---------------- */
  var support_conversations = [
    { id: 3101, customer_name: '王*', user_id: 'demo-c-1', status: 'open', unread_for_staff: 2, last_message: '验收后多久结算给服务者？', updated_at: ago(0, 21, 10) },
    { id: 3102, customer_name: '李*', user_id: 'demo-c-2', status: 'open', unread_for_staff: 1, last_message: '想改一下交付时间，可以吗', updated_at: ago(0, 18, 40) },
    { id: 3103, customer_name: '张*', user_id: 'demo-c-3', status: 'closed', unread_for_staff: 0, last_message: '谢谢，问题解决了', updated_at: ago(2, 11, 5) },
    { id: 3104, customer_name: '刘*', user_id: 'demo-c-4', status: 'open', unread_for_staff: 0, last_message: '商家年费能开票吗', updated_at: ago(3, 9, 25) }
  ]

  var support_messages = [
    { id: 3201, conversation_id: 3101, sender: 'customer', content: '验收后多久结算给服务者？', created_at: ago(0, 21, 8) },
    { id: 3202, conversation_id: 3101, sender: 'customer', content: '平台抽成比例是多少？', created_at: ago(0, 21, 10) },
    { id: 3203, conversation_id: 3102, sender: 'customer', content: '想改一下交付时间，可以吗', created_at: ago(0, 18, 40) },
    { id: 3204, conversation_id: 3103, sender: 'customer', content: '谢谢，问题解决了', created_at: ago(2, 11, 5) },
    { id: 3205, conversation_id: 3104, sender: 'customer', content: '商家年费能开票吗', created_at: ago(3, 9, 25) }
  ]

  /* ---------------- 操作日志 ---------------- */
  var admin_actions = [
    { id: 2101, admin_name: '演示管理员', admin_uid: 'offline-demo-admin', action: 'pay_settlement', target_type: 'settlement', target_id: '8005', detail: '2026-10 服务者 #5 结算 ¥8,001.84', created_at: ago(20, 15, 30) },
    { id: 2102, admin_name: '演示管理员', admin_uid: 'offline-demo-admin', action: 'generate_settlements', target_type: 'settlement', target_id: '', detail: '按已完成订单生成 3 张结算单', created_at: ago(5, 11, 2) },
    { id: 2103, admin_name: '演示管理员', admin_uid: 'offline-demo-admin', action: 'approve_application', target_type: 'provider', target_id: '7003', detail: '沙湖视觉 入驻通过', created_at: ago(9, 14, 50) },
    { id: 2104, admin_name: '演示管理员', admin_uid: 'offline-demo-admin', action: 'reject_application', target_type: 'provider', target_id: '7004', detail: '作品集与申报品类不符', created_at: ago(13, 9, 20) },
    { id: 2105, admin_name: '演示管理员', admin_uid: 'offline-demo-admin', action: 'update_order_status', target_type: 'order', target_id: 'DEMO9012', detail: '已交付 → 已完成', created_at: ago(2, 17, 45) }
  ]

  /* ---------------- 群聊 ---------------- */
  var chat_groups = [
    { id: 1201, name: '银川影像交流群', icon: '🎬', description: '本地摄影摄像同行日常交流、互推单子', owner_name: '平台官方', owner_id: 'platform', status: 'active', created_at: ago(60, 10, 0) },
    { id: 1202, name: '短视频剪辑互助', icon: '✂️', description: '剪辑技巧、模板共享、接急单', owner_name: '平台官方', owner_id: 'platform', status: 'active', created_at: ago(35, 14, 30) },
    { id: 1203, name: 'AI 创作实验场', icon: '🤖', description: 'AI 生成与漫剧制作的踩坑记录', owner_name: '平台官方', owner_id: 'platform', status: 'archived', created_at: ago(80, 9, 15) }
  ]

  var chat_messages = [
    { id: 1301, group_id: 1201, user_id: 'demo-u-01', sender_name: '何*', content: '下周有个婚礼双机位，谁能接？', status: 'normal', created_at: ago(0, 9, 12) },
    { id: 1302, group_id: 1201, user_id: 'demo-u-05', sender_name: '柳*', content: '我可以，私聊你', status: 'normal', created_at: ago(0, 9, 20) },
    { id: 1303, group_id: 1202, user_id: 'demo-u-02', sender_name: '马*', content: '求一份竖屏卡点模板', status: 'normal', created_at: ago(1, 15, 40) },
    { id: 1304, group_id: 1203, user_id: 'demo-u-04', sender_name: '丁*', content: '分镜提示词这样写更稳', status: 'normal', created_at: ago(3, 11, 5) }
  ]

  window.ADMIN_DEMO = {
    chat_groups: chat_groups,
    chat_messages: chat_messages,
    orders: orders,
    settlements: settlements,
    provider_applications: provider_applications,
    merchants: merchants,
    merchant_enroll_orders: merchant_enroll_orders,
    member_subscriptions: member_subscriptions,
    member_payment_orders: member_payment_orders,
    provider_deposits: provider_deposits,
    support_conversations: support_conversations,
    support_messages: support_messages,
    admin_actions: admin_actions
  }
})()
