/**
 * 自适应网格
 *
 * 目标：内容 100% 铺满屏幕宽度，不留白边。
 *
 * 纯 CSS 的 auto-fill / auto-fit 都做不到「既填满又不多余」：
 *   - auto-fill：轨道数按容器算，项数少时右侧留空轨道（2560 下分类空 1231px）
 *   - auto-fit ：空轨道折叠，但已有项被拉伸（2560 下服务者卡被拉到 593px）
 *
 * 所以这里用 JS 按「项数」反推列数：
 *   1. 先算出容器能放下几列（受最小列宽约束）
 *   2. 列数不超过项数 —— 避免空轨道
 *   3. 列数固定后用 1fr 均分，宽度自然铺满
 *
 * 各项宽度不同时（如分类 5 个、服务 6 个），各自独立计算。
 */
(function (global) {
  /**
   * 各网格的最小/理想列宽（px）
   *
   * 注意：不收 'kpi-grid' —— 管理端 KPI 是固定 4 个指标卡，
   * 内容区本来就全宽，由 CSS 的固定列数控制更合适（JS 算出来会拉到 540px 宽）。
   */
  const RULES = {
    'cat-grid': { min: 180, ideal: 220 },
    'svc-grid': { min: 280, ideal: 340 },
    'prov-grid': { min: 220, ideal: 260 },
    'hall-grid': { min: 300, ideal: 340 },
    'stat-grid': { min: 150, ideal: 180 },
    'sample-grid': { min: 300, ideal: 360 }
  }

  /**
   * 运行模式：'desktop' | 'mobile'
   * 移动模式下网格列数交给 mobile.css（横滑列表 / 纵向信息流），
   * 桌面那套「按最小列宽算列数」的逻辑在窄屏会算出 1 列，不适用。
   */
  let mode = 'desktop'

  /**
   * 为单个网格计算列数
   * @param {number} containerWidth 容器可用宽度
   * @param {number} itemCount 项数
   * @param {number} gap 间距
   * @param {object} rule { min, ideal }
   * @returns {number} 列数（至少 1）
   */
  function calcColumns(containerWidth, itemCount, gap, rule) {
    if (!itemCount || containerWidth <= 0) return 1
    const min = rule.min || 200
    const ideal = rule.ideal || min

    // 最多能放几列（按最小宽度算，保证不挤压）
    const byMin = Math.max(1, Math.floor((containerWidth + gap) / (min + gap)))
    // 按理想宽度能放几列（上限，避免卡片过宽）
    const byIdeal = Math.max(1, Math.floor((containerWidth + gap) / (ideal + gap)))

    // 列数不超过项数 —— 否则就是空轨道
    const byCount = itemCount
    // 取「装得下且不超过项数」的最大列数
    let cols = Math.min(byMin, byCount)
    // 如果按理想宽度算出的列数更少且仍满足最小宽度，用它（卡片不会过宽）
    if (byIdeal < cols && (containerWidth + gap) / (byIdeal + gap) >= min) {
      cols = byIdeal
    }
    return Math.max(1, cols)
  }

  /** 处理一个网格元素 */
  function fitOne(el) {
    const cls = (el.getAttribute('class') || '').split(' ')[0]
    const rule = RULES[cls]
    if (!rule) return

    // 移动模式下列数由 mobile.css 决定（横滑列表 / 信息流），这里不插手
    if (mode === 'mobile') {
      el.style.removeProperty('grid-template-columns')
      return
    }

    const items = el.children
    if (!items.length) return

    const style = getComputedStyle(el)
    const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 0
    // 容器可用宽度（去掉自身 padding）
    const cs = getComputedStyle(el)
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    const width = el.clientWidth - padX
    if (width <= 0) return

    const cols = calcColumns(width, items.length, gap, rule)
    el.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
  }

  /** 处理页面内所有受管网格 */
  function fitAll(root) {
    const scope = root || document
    const els = scope.querySelectorAll(
      Object.keys(RULES)
        .map((c) => '.' + c)
        .join(',')
    )
    els.forEach(fitOne)
  }

  /** 屏幕尺寸变化时重算 */
  let raf = null
  function onResize() {
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = null
      fitAll()
    })
  }

  global.AdaptiveGrid = {
    fitAll,
    fitOne,
    calcColumns,
    onResize,
    /** 切换运行模式（由 mobile-mode.js 调用） */
    setMode(m) {
      mode = m === 'mobile' ? 'mobile' : 'desktop'
      fitAll()
    },
    get mode() {
      return mode
    }
  }
})(window)
