/**
 * 项目履约链路模拟器端到端验证（需先开开发者工具自动化端口 9420）
 * 用法：node tools/e2e-guarantee.js
 *
 * 覆盖：发布者商家门槛 → 15% 保证金 → 上传成片 → 审核驳回（意见+日期）
 *      → 重新交付 → 审核通过自动返还 → 逾期违约金分账
 */
const automator = require('miniprogram-automator')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ctx = '() => { const ps = getCurrentPages(); return ps[ps.length - 1] }'

async function main() {
  const m = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  const errs = []
  m.on('exception', (e) => errs.push('EX ' + String((e && e.message) || e).slice(0, 200)))
  m.on('console', (c) => {
    if (c.type === 'error') errs.push('CE ' + JSON.stringify(c.args).slice(0, 200))
  })

  // ---------- 0. 干净环境 ----------
  await m.evaluate(() => {
    ;['gy_taskchain_v1', 'gy_guarantee_v1', 'gy_publisher_v1', 'gy_demand_v1'].forEach((k) => wx.removeStorageSync(k))
    wx.setStorageSync('gy_wallet_v1', { balance: 500000, frozen: 0, seq: 1, ledger: [] })
  })

  // ---------- 1. 发布者商家门槛 ----------
  await m.reLaunch('/pages/demand-publish/demand-publish')
  await sleep(1600)
  let r = await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    return { path: p.route, isMerchant: p.data.isMerchant, canSubmit: p.data.canSubmit, dueDate: p.data.dueDate, minDue: p.data.minDue }
  })
  console.log('1. 未注册商家:', JSON.stringify(r))

  // ---------- 2. 注册演示店铺 ----------
  await m.evaluate(() => {
    wx.setStorageSync('gy_taskchain_v1', {
      seq: 1,
      merchant: {
        id: 'shop-e2e', name: '砚生端到端店铺', city: '银川', demoPaid: true,
        status: 'active', planCode: 'demo', paidAt: new Date().toISOString(),
        paidUntil: new Date(Date.now() + 365 * 86400000).toISOString()
      },
      tasks: []
    })
  })
  await m.reLaunch('/pages/demand-publish/demand-publish')
  await sleep(1500)
  r = await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    return { isMerchant: p.data.isMerchant, merchantName: p.data.merchantName, cats: p.data.reqCatName, fields: (p.data.reqFields || []).length }
  })
  console.log('2. 注册后:', JSON.stringify(r))

  // ---------- 3. 发布需求（含交付截止日期） ----------
  await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    const due = new Date(Date.now() + 9 * 86400000)
    const pad = (n) => String(n).padStart(2, '0')
    p.setData({
      title: '端到端 · 品牌宣传片项目', budget: '1000',
      dueDate: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`
    })
    p.submit()
  })
  await sleep(1400)
  r = await m.evaluate(() => {
    const d = wx.getStorageSync('gy_demand_v1')
    const it = (d && d.items || []).filter((x) => String(x.title).indexOf('端到端') >= 0)[0]
    const w = wx.getStorageSync('gy_wallet_v1')
    const g = wx.getStorageSync('gy_guarantee_v1')
    return {
      published: !!it, dueAt: it && it.dueAt, gid: it && it.guaranteeId,
      balance: w.balance / 100, frozen: w.frozen / 100,
      publisherDeposit: g && it && g.projects[it.guaranteeId] && g.projects[it.guaranteeId].publisherDeposit
    }
  })
  console.log('3. 发单:', JSON.stringify(r))

  const demandId = await m.evaluate(() => {
    const d = wx.getStorageSync('gy_demand_v1')
    const it = (d.items || []).filter((x) => String(x.title).indexOf('端到端') >= 0)[0]
    return it && it.id
  })

  // ---------- 4. 抢单：冻结 15% ----------
  await m.reLaunch('/pages/hall/hall')
  await sleep(1700)
  await m.evaluate((id) => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    const orig = wx.showModal
    wx.showModal = (o) => { if (o && o.success) o.success({ confirm: true }) }
    p.onTake({ currentTarget: { dataset: { id } } })
    wx.showModal = orig
  }, demandId)
  await sleep(1200)
  r = await m.evaluate((id) => {
    const g = wx.getStorageSync('gy_guarantee_v1')
    const it = (wx.getStorageSync('gy_demand_v1').items || []).filter((x) => String(x.id) === String(id))[0]
    const p = g.projects[it.guaranteeId]
    const w = wx.getStorageSync('gy_wallet_v1')
    return { status: it.status, providerDeposit: p.providerDeposit, state: p.providerDepositState, frozen: w.frozen / 100 }
  }, demandId)
  console.log('4. 抢单 15%:', JSON.stringify(r))

  // ---------- 5. 交付页：上传成片 ----------
  await m.reLaunch('/pages/delivery/delivery?source=demand&id=' + encodeURIComponent(demandId))
  await sleep(1700)
  r = await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    return {
      path: p.route, status: p.data.project && p.data.project.statusText,
      providerRate: p.data.project && p.data.project.providerRateText,
      publisherRate: p.data.project && p.data.project.publisherRateText,
      split: p.data.project && p.data.project.splitText,
      canUpload: p.data.project && p.data.project.canUpload
    }
  })
  console.log('5. 交付页:', JSON.stringify(r))

  await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    p.setData({ deliveryTempPath: '/tmp/e2e-final.mp4', deliveryName: '成片v1.mp4', deliveryNote: '第一版' })
    p.onUpload()
  })
  await sleep(1200)
  r = await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    return { status: p.data.project && p.data.project.statusText, hasDelivery: p.data.project && p.data.project.hasDelivery, canReview: p.data.project && p.data.project.canReview, err: p.data.errText }
  })
  console.log('6. 上传后:', JSON.stringify(r))

  // ---------- 7. 审核不通过：意见 + 新提交日期 ----------
  await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    const d = new Date(Date.now() + 14 * 86400000)
    const pad = (n) => String(n).padStart(2, '0')
    p.setData({
      showReject: true,
      rejectOpinion: '片头字幕与配乐需要重做',
      rejectDue: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    })
    p.onRejectSubmit()
  })
  await sleep(1200)
  r = await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    return {
      status: p.data.project && p.data.project.statusText,
      due: p.data.project && p.data.project.dueText,
      reviews: p.data.project && p.data.project.reviewList.length,
      firstOpinion: p.data.project && p.data.project.reviewList[0] && p.data.project.reviewList[0].opinion,
      firstDue: p.data.project && p.data.project.reviewList[0] && p.data.project.reviewList[0].newDueAt
    }
  })
  console.log('7. 驳回后:', JSON.stringify(r))

  // ---------- 8. 重新交付 + 审核通过 ----------
  await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    p.setData({ deliveryTempPath: '/tmp/e2e-final2.mp4', deliveryName: '成片v2.mp4' })
    p.onUpload()
  })
  await sleep(1000)
  await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    const orig = wx.showModal
    wx.showModal = (o) => { if (o && o.success) o.success({ confirm: true }) }
    p.onApprove()
    wx.showModal = orig
  })
  await sleep(1300)
  r = await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    const w = wx.getStorageSync('gy_wallet_v1')
    return {
      status: p.data.project && p.data.project.statusText,
      providerState: p.data.project && p.data.project.providerDepositState,
      publisherState: p.data.project && p.data.project.publisherDepositState,
      reviews: p.data.project && p.data.project.reviewList.length,
      frozen: w.frozen / 100,
      refundLedger: w.ledger.filter((x) => String(x.title).indexOf('原路退回') >= 0).length
    }
  })
  console.log('8. 审核通过返还:', JSON.stringify(r))

  // ---------- 9. 逾期违约金 ----------
  await m.evaluate(() => {
    const g = wx.getStorageSync('gy_guarantee_v1')
    const pid = 'task:overdue-e2e'
    const y = new Date(Date.now() - 2 * 86400000)
    const pad = (n) => String(n).padStart(2, '0')
    const dueAt = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`
    // 直接构造一份「已接单但逾期」的档案，验证进入页面即自动扣款
    g.projects[pid] = {
      id: pid, source: 'task', refId: 'overdue-e2e', title: '逾期违约测试项目',
      budget: 100000, publisherName: '砚生端到端店铺',
      publisherDeposit: 10000, publisherDepositState: 'held',
      providerName: '乙工作室', providerDeposit: 15000, providerDepositState: 'held',
      payChannel: '微信零钱（演示）', dueAt, originalDueAt: dueAt,
      deliveredAt: '', deliveryVideoPath: '', deliveryVideoName: '', deliveryNote: '',
      reviewHistory: [], penalty: null, status: 'taken', timeline: [], legacy: false,
      isDemo: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }
    wx.setStorageSync('gy_guarantee_v1', g)
  })
  await m.reLaunch('/pages/delivery/delivery?source=task&id=overdue-e2e')
  await sleep(1600)
  r = await m.evaluate(() => {
    const ps = getCurrentPages(), p = ps[ps.length - 1]
    return {
      status: p.data.project && p.data.project.statusText,
      penalty: p.data.project && p.data.project.penaltyText,
      platform: p.data.project && p.data.project.penaltyPlatformText,
      publisher: p.data.project && p.data.project.penaltyPublisherText,
      providerState: p.data.project && p.data.project.providerDepositState,
      publisherState: p.data.project && p.data.project.publisherDepositState,
      canUpload: p.data.project && p.data.project.canUpload
    }
  })
  console.log('9. 逾期违约:', JSON.stringify(r))

  // ---------- 10. 三个发布页字段 ----------
  for (const [name, url] of [
    ['demand-publish', '/pages/demand-publish/demand-publish'],
    ['merchant-console', '/pages/merchant-console/merchant-console'],
    ['order-create', '/pages/order-create/order-create?serviceId=1']
  ]) {
    await m.reLaunch(url)
    await sleep(1500)
    const f = await m.evaluate(() => {
      const ps = getCurrentPages(), p = ps[ps.length - 1]
      return {
        dueDate: p.data.dueDate || (p.data.form && p.data.form.deadline) || p.data.deliveryDue || '',
        minDue: p.data.minDue || '',
        isMerchant: p.data.isMerchant,
        fields: (p.data.reqFields || []).length,
        loading: p.data.loading
      }
    })
    console.log('10.', name, JSON.stringify(f))
  }

  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none')
  await m.disconnect()
  process.exit(errs.length ? 1 : 0)
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
