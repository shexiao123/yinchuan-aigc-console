import React, {useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {DataVizPlayer} from './components/DataVizPlayer'
import type {DashboardData} from './tokens'
import type {PlayerRef} from '@remotion/player'

/**
 * 网页端嵌入入口 —— 挂到 window.WBDataViz
 *
 * 管理端（admin.html）用法：
 *   <div id="dataviz"></div>
 *   <script src="js/dataviz.js"></script>
 *   <script>WBDataViz.mount('dataviz', {gmv: 123, ...})</script>
 */
export interface WBDataVizApi {
  /** 挂载到指定容器 */
  mount(el: string | HTMLElement, data: Partial<DashboardData>, opts?: {loop?: boolean}): void
  /** 更新数据（不重新挂载） */
  update(data: Partial<DashboardData>): void
  /** 卸载 */
  unmount(): void
  /** 导出当前帧为 PNG（dataURL） */
  snapshot(): string | null
  /** 播放器实例（调试 / 手动控制） */
  player(): PlayerRef | null
}

const state: {
  root: ReturnType<typeof createRoot> | null
  el: HTMLElement | null
  data: Partial<DashboardData>
  loop: boolean
  player: PlayerRef | null
} = {root: null, el: null, data: {}, loop: true, player: null}

function build() {
  const {el, data, loop} = state
  if (!el) return
  const root = state.root ?? createRoot(el)
  state.root = root
  root.render(
    <DataVizPlayer
      data={data as DashboardData}
      loop={loop}
      playerRef={(ref) => {
        state.player = ref
        // 浏览器自动播放策略可能让 Player 停在第 0 帧 —— 显式起播
        if (ref) {
          setTimeout(() => {
            try {
              ref.play()
            } catch (e) {
              console.warn('[dataviz] play() 失败', e)
            }
          }, 60)
        }
      }}
    />
  )
}

/**
 * 标签页切回时恢复播放
 * 浏览器会暂停后台标签页的 requestAnimationFrame，Player 会卡住。
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const pl = state.player
    if (!pl) return
    try {
      if (pl.isPlaying && !pl.isPlaying()) pl.play()
    } catch (e) {
      /* ignore */
    }
  })
}

const api: WBDataVizApi = {
  mount(el, data, opts) {
    const target = typeof el === 'string' ? document.getElementById(el) : el
    if (!target) {
      console.error('[dataviz] 找不到容器:', el)
      return
    }
    state.el = target
    state.data = data
    state.loop = opts?.loop ?? true
    build()
  },
  update(data) {
    state.data = {...state.data, ...data}
    build()
    // 数据变了 → 重播一遍动画，让新数据从零长出来
    const pl = state.player
    if (pl) {
      setTimeout(() => {
        try {
          pl.seekTo(0)
          pl.play()
        } catch (e) {
          /* ignore */
        }
      }, 80)
    }
  },
  unmount() {
    state.root?.unmount()
    state.root = null
    state.el = null
  },
  snapshot() {
    // Remotion Player 内部是 iframe/canvas 结构，取不到直接引用
    // 退而求其次：找 canvas 元素
    const canvas = state.el?.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return null
    try {
      return canvas.toDataURL('image/png')
    } catch (e) {
      return null
    }
  },
  player() {
    return state.player
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as {WBDataViz: WBDataVizApi}).WBDataViz = api
}

export default api
