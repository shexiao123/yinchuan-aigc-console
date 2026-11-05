import React from 'react'
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion'
import {colors, easing, geo, timing, type TrendPoint} from '../tokens'

/**
 * 趋势图 —— 面积折线 + 柱状混合
 *
 * 7 天订单量：柱（每日单量）+ 折线（成交额）
 */
export const TrendChart: React.FC<{
  data: TrendPoint[]
  delay?: number
  height?: number
  style?: React.CSSProperties
}> = ({data, delay = timing.chartDelay, height = 200, style}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  if (!data.length) {
    return <div style={{height, color: colors.ink3, fontSize: 13, padding: '20px 0', ...style}}>暂无数据</div>
  }

  const W = 640
  const H = height
  const padX = 12
  const padTop = 18
  const padBottom = 26

  const maxCount = Math.max(...data.map((d) => d.count), 1)
  const maxAmount = Math.max(...data.map((d) => d.amount), 1)

  const plotW = W - padX * 2
  const plotH = H - padTop - padBottom
  const slot = plotW / data.length

  // 折线绘制进度（从左到右生长）
  const lineProgress = interpolate(frame, [delay, delay + 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing.grow
  })

  const xOf = (i: number) => padX + slot * i + slot / 2
  const yCount = (v: number) => padTop + plotH - (v / maxCount) * plotH
  const yAmount = (v: number) => padTop + plotH - (v / maxAmount) * plotH

  // 只画到 lineProgress 处的折线段
  const pts = data.map((d, i) => ({
    x: xOf(i),
    y: yAmount(d.amount),
    raw: d
  }))

  const visibleCount = Math.max(2, Math.ceil(pts.length * lineProgress))
  const shown = pts.slice(0, visibleCount)

  const path = shown.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath =
    shown.length > 1
      ? `${path} L ${shown[shown.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${shown[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : ''

  return (
    <div style={{padding: '14px 18px 10px', ...style}}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.brand} stopOpacity={geo.areaFillTop} />
            <stop offset="100%" stopColor={colors.brand} stopOpacity={geo.areaFillBottom} />
          </linearGradient>
          <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colors.brand} />
            <stop offset="100%" stopColor={colors.accent} />
          </linearGradient>
        </defs>

        {/* 网格 */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={W - padX}
            y1={padTop + plotH * t}
            y2={padTop + plotH * t}
            stroke={colors.line}
            strokeWidth={1}
            strokeDasharray={t === 1 ? undefined : '4 6'}
          />
        ))}

        {/* 柱：每日单量 */}
        {data.map((d, i) => {
          const appear = interpolate(frame, [delay + i * timing.barStagger, delay + i * timing.barStagger + 12], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: easing.grow
          })
          const h = (d.count / maxCount) * plotH * appear
          const w = slot * geo.barRatio
          return (
            <g key={d.date}>
              <rect
                x={xOf(i) - w / 2}
                y={padTop + plotH - h}
                width={w}
                height={Math.max(h, 0)}
                rx={3}
                fill={colors.brand}
                opacity={0.22}
              />
              {d.count > 0 ? (
                <text
                  x={xOf(i)}
                  y={padTop + plotH - h - 6}
                  fill={colors.ink2}
                  fontSize={11}
                  textAnchor="middle"
                  opacity={appear}
                >
                  {d.count}
                </text>
              ) : null}
            </g>
          )
        })}

        {/* 面积 + 折线：成交额 */}
        {areaPath ? <path d={areaPath} fill="url(#trendArea)" /> : null}
        {shown.length > 1 ? (
          <path
            d={path}
            fill="none"
            stroke="url(#trendLine)"
            strokeWidth={geo.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{filter: `drop-shadow(0 0 8px ${colors.brand}88)`}}
          />
        ) : null}

        {/* 末端光点 */}
        {shown.length > 1 ? (
          <circle
            cx={shown[shown.length - 1].x}
            cy={shown[shown.length - 1].y}
            r={4.5}
            fill={colors.accent}
            style={{filter: `drop-shadow(0 0 10px ${colors.accent})`}}
          />
        ) : null}

        {/* X 轴标签 */}
        {data.map((d, i) => (
          <text
            key={d.date}
            x={xOf(i)}
            y={H - 8}
            fill={colors.ink3}
            fontSize={11}
            textAnchor="middle"
          >
            {d.date}
          </text>
        ))}
      </svg>
    </div>
  )
}
