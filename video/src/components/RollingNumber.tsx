import React from 'react'
import {interpolate, useCurrentFrame, useVideoConfig, Easing, spring} from 'remotion'
import {colors} from '../tokens'

/**
 * 逐位翻滚数字
 *
 * 不是整体淡入，是每一位数字像机械里程表一样向上滚动到位，
 * 带轻微过冲（overshoot）—— 这是「视频感」的核心细节之一。
 */
export const RollingNumber: React.FC<{
  value: number
  /** 格式化：先转字符串再逐位处理 */
  format?: (n: number) => string
  delay?: number
  size?: number
  color?: string
  style?: React.CSSProperties
}> = ({value, format = (n) => String(Math.round(n)), delay = 0, size = 40, color = colors.brand, style}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  const target = format(value)
  const chars = target.split('')

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        fontVariantNumeric: 'tabular-nums',
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.1,
        color,
        textShadow: `0 0 26px ${color}77`,
        ...style
      }}
    >
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <span key={i} style={{opacity: 0.9}}>
              {ch}
            </span>
          )
        }

        // 每位错开 3 帧，形成波浪式滚动
        const d = delay + i * 3
        const progress = interpolate(frame, [d, d + 26], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.22, 1.35, 0.36, 1) // 带过冲
        })

        // 位数从 0 滚到目标值
        const from = 0
        const to = Number(ch)
        const current = from + (to - from) * progress

        // 翻滚位移：末尾从下方滑入
        const offset = (1 - progress) * size * 0.85

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              height: size * 1.1,
              overflow: 'hidden',
              verticalAlign: 'top'
            }}
          >
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${offset}px)`,
                opacity: progress > 0.02 ? 1 : 0
              }}
            >
              {Math.round(current)}
            </span>
          </span>
        )
      })}
    </div>
  )
}
