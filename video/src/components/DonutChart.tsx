import React from 'react'
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion'
import {colors, easing, geo, seriesColors, timing, type CategorySlice} from '../tokens'

/**
 * 环形图 —— 分类分布
 * 用 stroke-dasharray 做扇形，动画从 0 长到目标弧长
 */
export const DonutChart: React.FC<{
  data: CategorySlice[]
  delay?: number
  size?: number
  centerLabel?: string
  centerValue?: string
  style?: React.CSSProperties
}> = ({data, delay = timing.chartDelay, size = 190, centerLabel, centerValue, style}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  if (!data.length) {
    return <div style={{color: colors.ink3, fontSize: 13, padding: 20, ...style}}>暂无数据</div>
  }

  const total = data.reduce((s, d) => s + d.count, 0) || 1
  const r = size / 2 - geo.donutThickness * size * 0.5
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  // 整体生长进度
  const grow = interpolate(frame, [delay, delay + 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing.grow
  })

  let acc = 0

  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 24, ...style}}>
      <div style={{position: 'relative', width: size, height: size, flexShrink: 0}}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(${geo.donutStart} ${cx} ${cy})`}>
            {/* 底环 */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={colors.line}
              strokeWidth={geo.donutThickness * size}
            />
            {data.map((d, i) => {
              const frac = d.count / total
              const len = frac * circumference * grow
              const dash = `${len} ${circumference}`
              const offset = -acc * circumference * grow
              acc += frac
              const color = seriesColors[i % seriesColors.length]
              return (
                <circle
                  key={d.name}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth={geo.donutThickness * size}
                  strokeDasharray={dash}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  style={{filter: `drop-shadow(0 0 6px ${color}66)`}}
                />
              )
            })}
          </g>
        </svg>

        {/* 中心文字 */}
        {(centerValue || centerLabel) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2
            }}
          >
            <span style={{color: colors.ink, fontSize: 26, fontWeight: 700}}>{centerValue}</span>
            <span style={{color: colors.ink3, fontSize: 12}}>{centerLabel}</span>
          </div>
        )}
      </div>

      {/* 图例 */}
      <div style={{display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 0}}>
        {data.map((d, i) => {
          const appear = interpolate(frame, [delay + 8 + i * 3, delay + 8 + i * 3 + 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: easing.enter
          })
          const color = seriesColors[i % seriesColors.length]
          return (
            <div
              key={d.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: appear,
                transform: `translateX(${(1 - appear) * 10}px)`
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                  boxShadow: `0 0 8px ${color}`,
                  flexShrink: 0
                }}
              />
              <span style={{color: colors.ink2, fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                {d.name}
              </span>
              <span style={{color: colors.ink, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums'}}>
                {d.count}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
