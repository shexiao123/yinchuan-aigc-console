/**
 * 首页动态可视化驱动
 * - 数字滚动（count-up，支持 data-decimals）
 * - 环形图生长（stroke-dashoffset: data-len -> 0）
 * - 区块入场（IntersectionObserver 加 .in）
 * - 动态背景（给 .home 加 .home-anim 触发 CSS 动画）
 *
 * 通过 MutationObserver 监听 #app，首页（.home）注入即自动跑，
 * 无需改动 app.js 渲染主流程；导航回到首页会重新触发。
 */
(function () {
  'use strict'

  const HomeViz = {}

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }

  function countUp(el) {
    if (el.__done) return
    el.__done = true
    const target = parseFloat(el.dataset.target || '0')
    const decimals = parseInt(el.dataset.decimals || '0', 10)
    const dur = 1500
    const start = performance.now()
    const fmt = (v) =>
      decimals
        ? v.toFixed(decimals)
        : Math.round(v).toLocaleString('zh-CN')
    function tick(now) {
      const t = Math.min(1, (now - start) / dur)
      el.textContent = fmt(target * easeOutCubic(t))
      if (t < 1) requestAnimationFrame(tick)
      else el.textContent = fmt(target)
    }
    requestAnimationFrame(tick)
  }

  function growDonut(svg) {
    const circles = svg.querySelectorAll('circle[data-len]')
    circles.forEach((c, i) => {
      const len = parseFloat(c.getAttribute('data-len'))
      const fallback = c.getAttribute('stroke-dashoffset') || len
      c.style.transition = 'none'
      c.style.strokeDashoffset = fallback
      // 强制回流，确保起始帧生效
      void c.getBoundingClientRect()
      c.style.transition =
        'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1) ' + (i * 90) + 'ms'
      c.style.strokeDashoffset = '0'
    })
  }

  function reveal(root) {
    const targets = root.querySelectorAll(
      '.home-animate-item, .home-stat, .home-viz-card, .home-viz-side'
    )
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    targets.forEach((t) => io.observe(t))
  }

  HomeViz.run = function () {
    const home = document.querySelector('.home')
    if (!home || home.__viz) return
    home.__viz = true
    home.classList.add('home-anim') // 触发动态背景 & 入场初始态
    home.querySelectorAll('.count-up[data-target]').forEach(countUp)
    const donut = home.querySelector('.home-donut-svg')
    if (donut) growDonut(donut)
    reveal(home)
  }

  window.HomeViz = HomeViz

  function observe() {
    const app = document.getElementById('app')
    if (!app) return
    const mo = new MutationObserver(() => {
      const home = document.querySelector('.home')
      if (home && !home.__viz) HomeViz.run()
    })
    mo.observe(app, { childList: true, subtree: true })
    // 兜底：home 已在 DOM 中
    HomeViz.run()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe)
  } else {
    observe()
  }
})()
