import React from 'react'
import {AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig} from 'remotion'
import {colors, timing, yuanLabel, comma, emptyData, type DashboardData, easing} from '../tokens'
import {TrendChart} from '../components/TrendChart'
import {DonutChart} from '../components/DonutChart'

/**
 * 竖屏数据卡 —— 1080×1920
 *
 * 用途：微信小程序分享卡 / 平台宣传图 / 朋友圈长图
 * 与横屏大屏共用 tokens，视觉语言一致
 */
export const MobileShareCard: React.FC<{data?: DashboardData}> = ({data = emptyData}) => {
  const frame = useCurrentFrame()
  const {fps} = useVideoConfig()
  const d = data

  const intro = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing.enter
  })

  const drift = (frame * 0.4) % 48

  const kpis = [
    {label: '订单总数', value: comma(d.total), accent: colors.accent},
    {label: '服务者', value: String(d.providers), accent: colors.good},
    {label: '用户评价', value: String(d.reviews), accent: colors.accent2},
    {label: '在架服务', value: String(d.onShelf), accent: colors.brand}
  ]

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif",
        overflow: 'hidden'
      }}
    >
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(700px 480px at 12% 2%, ${colors.brand}38, transparent 62%),
            radial-gradient(620px 440px at 92% 18%, ${colors.accent}33, transparent 64%),
            radial-gradient(700px 560px at 50% 96%, ${colors.accent2}22, transparent 62%)
          `,
          zIndex: 0
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `
            linear-gradient(${colors.line}66 1px, transparent 1px),
            linear-gradient(90deg, ${colors.line}66 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          backgroundPosition: `${drift}px ${drift}px`,
          opacity: 0.45,
          zIndex: 0
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '92px 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: 34,
          height: '100%',
          opacity: intro
        }}
      >
        {/* 品牌头 */}
        <div>
          <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
            <span
              style={{
                width: 5,
                height: 30,
                background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`,
                boxShadow: `0 0 14px ${colors.brand}`,
                borderRadius: 3
              }}
            />
            <span style={{color: colors.ink, fontSize: 34, fontWeight: 700, letterSpacing: 3}}>
              银川AIGC数字文化产业基地
            </span>
          </div>
          <div style={{color: colors.ink3, fontSize: 20, marginTop: 14, marginLeft: 19, letterSpacing: 2}}>
            平台运营数据报告
          </div>
        </div>

        {/* 主数字 */}
        <div>
          <div style={{color: colors.ink3, fontSize: 20, marginBottom: 10}}>累计成交额</div>
          <div
            style={{
              color: colors.brand,
              fontSize: 86,
              fontWeight: 700,
              lineHeight: 1.05,
              textShadow: `0 0 34px ${colors.brand}77`,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {yuanLabel(d.gmv)}
          </div>
          <div style={{color: colors.ink2, fontSize: 20, marginTop: 12}}>
            已完成 {d.completed} 单 · 平台抽成 {yuanLabel(d.commission)}
          </div>
        </div>

        {/* 四宫格 KPI */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}>
          {kpis.map((k, i) => {
            const appear = interpolate(frame, [14 + i * 6, 14 + i * 6 + 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: easing.enter
            })
            return (
              <div
                key={k.label}
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.line}`,
                  borderRadius: 16,
                  padding: '24px 26px',
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 18}px)`
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, transparent, ${k.accent}, transparent)`
                  }}
                />
                <div style={{color: colors.ink3, fontSize: 18}}>{k.label}</div>
                <div
                  style={{
                    color: k.accent,
                    fontSize: 38,
                    fontWeight: 700,
                    marginTop: 8,
                    textShadow: `0 0 20px ${k.accent}55`,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {k.value}
                </div>
              </div>
            )
          })}
        </div>

        {/* 趋势图 */}
        <div
          style={{
            background: colors.panel,
            border: `1px solid ${colors.line}`,
            borderRadius: 16,
            paddingTop: 22,
            overflow: 'hidden'
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '0 26px'}}>
            <span
              style={{
                width: 3,
                height: 15,
                background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`,
                boxShadow: `0 0 10px ${colors.brand}`,
                borderRadius: 2
              }}
            />
            <span style={{color: colors.ink, fontSize: 21, letterSpacing: 1}}>近 7 天订单趋势</span>
          </div>
          <TrendChart data={d.trend} delay={30} height={240} style={{padding: '10px 16px 6px'}} />
        </div>

        {/* 分类分布 */}
        <div
          style={{
            background: colors.panel,
            border: `1px solid ${colors.line}`,
            borderRadius: 16,
            paddingTop: 22,
            overflow: 'hidden',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '0 26px'}}>
            <span
              style={{
                width: 3,
                height: 15,
                background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`,
                boxShadow: `0 0 10px ${colors.brand}`,
                borderRadius: 2
              }}
            />
            <span style={{color: colors.ink, fontSize: 21, letterSpacing: 1}}>服务分类分布</span>
          </div>
          <div style={{padding: '16px 22px 20px', flex: 1, display: 'flex', alignItems: 'center'}}>
            <DonutChart data={d.byCategory} delay={36} size={200} centerValue={String(d.onShelf)} centerLabel="在架服务" />
          </div>
        </div>

        {/* 页脚 */}
        <div style={{marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
          <div>
            <div style={{color: colors.ink2, fontSize: 18}}>宁夏云辇文化科技有限公司</div>
            <div style={{color: colors.ink3, fontSize: 16, marginTop: 8}}>认证服务者 · 作品与评价全部公开可查</div>
          </div>
          <div
            style={{
              color: colors.brand,
              fontSize: 16,
              border: `1px solid ${colors.lineBright}`,
              borderRadius: 999,
              padding: '8px 18px'
            }}
          >
            扫码下单
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
