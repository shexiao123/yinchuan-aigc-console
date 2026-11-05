import React from 'react'
import {interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion'
import {colors} from '../tokens'

/**
 * 扫描光条
 *
 * 一道窄光横扫过容器，模拟雷达/HUD 扫描 —— 视频界面里最能拉出「实时感」的元素。
 */
export const ScanLight: React.FC<{
  delay?: number
  /** 扫描周期（帧），0 = 只扫一次 */
  period?: number
  color?: string
  angle?: number
  style?: React.CSSProperties
}> = ({delay = 0, period = 0, color = colors.brand, angle = 105, style}) => {
  const frame = useCurrentFrame()
  const {width, height} = useVideoConfig()

  const t = period > 0 ? ((frame - delay) % period) / period : 1
  const raw = period > 0 ? t : interpolate(frame, [delay, delay + 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1)
  })

  // 光条沿对角线扫过
  const dist = Math.sqrt(width * width + height * height)
  const x = -width * 0.4 + raw * (dist + width * 0.8)

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        ...style
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '-30%',
          left: x,
          width: 150,
          height: '160%',
          background: `linear-gradient(90deg, transparent, ${color}22, ${color}44, ${color}22, transparent)`,
          transform: `rotate(${angle}deg)`,
          filter: 'blur(6px)',
          opacity: raw > 0.98 ? 0 : 1
        }}
      />
    </div>
  )
}

/**
 * 脉冲光圈
 *
 * 数据点出现时的扩散环 —— 让关键数据有「被捕捉」的瞬间感
 */
export const PulseRing: React.FC<{
  delay?: number
  size?: number
  color?: string
  style?: React.CSSProperties
}> = ({delay = 0, size = 30, color = colors.brand, style}) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [delay, delay + 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad)
  })
  if (p <= 0) return null
  const scale = 0.3 + p * 1.9
  const opacity = (1 - p) * 0.7

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        border: `1.5px solid ${color}`,
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: 'none',
        ...style
      }}
    />
  )
}
