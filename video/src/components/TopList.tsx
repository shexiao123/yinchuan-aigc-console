import React from 'react'
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion'
import {colors, easing, timing, yuanLabel, type TopService} from '../tokens'

/**
 * 排行榜 —— 热销服务 Top N
 * 条形从 0 生长到目标宽度，数值同步滚动
 */
export const TopList: React.FC<{
  data: TopService[]
  delay?: number
  metric?: 'sales' | 'price'
  style?: React.CSSProperties
}> = ({data, delay = timing.chartDelay, metric = 'sales', style}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()

  if (!data.length) {
    return <div style={{color: colors.ink3, fontSize: 13, padding: 20, ...style}}>暂无数据</div>
  }

  const max = Math.max(...data.map((d) => (metric === 'sales' ? d.sales : d.price)), 1)
  const medal = ['#FBBF24', '#C3D6E8', '#CD7F32']

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 13, padding: '16px 22px 20px', ...style}}>
      {data.map((d, i) => {
        const appear = interpolate(frame, [delay + i * timing.barStagger, delay + i * timing.barStagger + 16], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: easing.grow
        })
        const raw = metric === 'sales' ? d.sales : d.price
        const shown = raw * appear
        const text = metric === 'sales' ? String(Math.round(shown)) : yuanLabel(shown)

        return (
          <div key={d.id} style={{opacity: appear}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6}}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: i < 3 ? '#0A1222' : colors.ink3,
                  background: i < 3 ? medal[i] : colors.line
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  color: colors.ink,
                  fontSize: 13,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {d.title}
              </span>
              <span style={{color: colors.ink3, fontSize: 11.5}}>{d.provider}</span>
              <span
                style={{
                  color: metric === 'sales' ? colors.brand : colors.accent,
                  fontSize: 14,
                  fontWeight: 700,
                  minWidth: 46,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {text}
              </span>
            </div>
            <div style={{height: 5, borderRadius: 3, background: 'rgba(120,190,230,0.10)', overflow: 'hidden'}}>
              <div
                style={{
                  width: `${(raw / max) * 100 * appear}%`,
                  height: '100%',
                  borderRadius: 3,
                  background:
                    metric === 'sales'
                      ? `linear-gradient(90deg, ${colors.brand}, ${colors.accent})`
                      : `linear-gradient(90deg, ${colors.accent}, ${colors.accent2})`,
                  boxShadow: `0 0 10px ${metric === 'sales' ? colors.brand : colors.accent}77`
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
