/**
 * 移动端模式
 *
 * 目的：手机端用「移动版布局」，不是把桌面版缩小。
 *
 * 做法：
 *   1. 按视口宽度 + 设备能力判定是否进入移动模式
 *   2. 进入时给 <body> 加 .m-mode，并注入 mobile.css
 *   3. 移动模式下把「自适应网格」的 JS 算列数接管权交回 CSS
 *      （桌面端那套按最小列宽算的逻辑在手机端会算出 1 列）
 *   4. 监听尺寸变化，横竖屏切换时自动重判
 *
 * 判定依据（任一命中即算移动端）：
 *   - 视口宽度 ≤ 900px
 *   - 设备是触屏（pointer: coarse）且宽度 ≤ 1024px
 *   - UA 含移动端标识
 */
(function () {
  const MOBILE_MAX = 900
  const COARSE_MAX = 1024

  let mode = false
  let styleEl = null

  /** 判定当前是否移动模式 */
  function detect() {
    const w = window.innerWidth
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent)

    // iPad 桌面模式宽度大，但它是触屏 —— 仍算移动端
    if (uaMobile) return true
    if (w <= MOBILE_MAX) return true
    if (coarse && touch && w <= COARSE_MAX) return true
    return false
  }

  /** 注入 / 移除移动端样式 */
  function apply(on) {
    if (on === mode && (mode ? !!styleEl : true)) return
    mode = on
    document.body.classList.toggle('m-mode', mode)

    if (mode) {
      if (!styleEl) {
        styleEl = document.createElement('link')
        styleEl.rel = 'stylesheet'
        styleEl.href = 'assets/mobile.css'
        document.head.appendChild(styleEl)
      }
    } else if (styleEl) {
      styleEl.remove()
      styleEl = null
    }

    // 通知自适应网格：移动模式下列数由 CSS 决定
    if (window.AdaptiveGrid && window.AdaptiveGrid.setMode) {
      window.AdaptiveGrid.setMode(mode ? 'mobile' : 'desktop')
    }
    // 通知页面：布局变了，需要重算
    window.dispatchEvent(new CustomEvent('layoutmode', { detail: { mobile: mode } }))
  }

  window.__mobileMode = { detect, get active() { return mode } }

  // 首屏：尽早执行，避免闪烁
  apply(detect())

  // 尺寸变化重判（横竖屏切换、地址栏收起）
  let timer = null
  window.addEventListener('resize', () => {
    clearTimeout(timer)
    timer = setTimeout(() => apply(detect()), 120)
  })
  window.addEventListener('orientationchange', () => {
    setTimeout(() => apply(detect()), 220)
  })
})()
