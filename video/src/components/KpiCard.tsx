import React from 'react'
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion'
import {colors, easing, timing, yuanLabel, comma} from '../tokens'

/**
 * KPI 指标卡 —— 数字滚动 + 霓虹描边 + 辉光
 */
export const KpiCard: React.FC<{
  label: string
  value: number
  sub?: string
  /** 显示格式 */
  format?: 'number' | 'yuan' | 'comma'
  accent?: string
  delay?: number
  style?: React.CSSProperties
}> = ({label, value, sub, format = 'number', accent = colors.brand, delay = 0, style}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  // 数字滚动：延迟后开始，countDuration 帧内从 0 涨到目标
  const progress = interpolate(frame, [delay, delay + timing.countDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing.grow
  })

  const shown = value * progress

  const text =
    format === 'yuan' ? yuanLabel(shown) : format === 'comma' ? comma(shown) : String(Math.round(shown))

  // 卡片入场
  const enter = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing.enter
  })

  return (
    <div
      style={{
        background: colors.panel,
        border: `1px solid ${colors.line}`,
        borderRadius: 14,
        backdropFilter: 'blur(18px)',
        boxShadow: `0 0 0 1px ${colors.line}, 0 8px 28px rgba(2,8,20,0.4)`,
        padding: '20px 22px',
        position: 'relative',
        overflow: 'hidden',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 16}px)`,
        ...style
      }}
    >
      {/* 顶部霓虹条 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`
        }}
      />
      {/* 右下角辉光 */}
      <div
        style={{
          position: 'absolute',
          right: -40,
          bottom: -40,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22, transparent 70%)`,
          pointerEvents: 'none'
        }}
      />

      <div style={{color: colors.ink3, fontSize: 13, letterSpacing: 1, marginBottom: 10}}>{label}</div>
      <div
        style={{
          color: accent,
          fontSize: 40,
          fontWeight: 700,
          lineHeight: 1.1,
          textShadow: `0 0 22px ${accent}66`,
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {text}
      </div>
      {sub ? (
        <div style={{color: colors.ink2, fontSize: 12.5, marginTop: 8, opacity: 0.85}}>{sub}</div>
      ) : null}
    </div>
  )
}
