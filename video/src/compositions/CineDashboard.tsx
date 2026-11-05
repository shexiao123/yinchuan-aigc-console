import React from 'react'
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, spring} from 'remotion'
import {colors, timing, yuanLabel, comma, emptyData, type DashboardData} from '../tokens'
import {CineBackground} from '../components/CineBackground'
import {RollingNumber} from '../components/RollingNumber'
import {ScanLight, PulseRing} from '../components/ScanLight'
import {TrendChart} from '../components/TrendChart'
import {DonutChart} from '../components/DonutChart'
import {TopList} from '../components/TopList'

/**
 * 电影感数据界面 —— 1920×1080
 *
 * 与 AdminDashboard 的区别：这不是「看板」，是一段有镜头语言的影片。
 *   0.0s  镜头从远推近，网格从纵深里铺开
 *   0.4s  标题逐字揭示，扫描光横扫
 *   0.9s  四张 KPI 卡从两侧弹入，数字逐位翻滚
 *   1.4s  趋势图从左向右生长，光点跑动
 *   2.0s  环形图扇区依次展开，中心数字脉冲
 *   2.6s  TOP5 条形弹起，数字跟随
 *   持续   背景粒子漂浮、辉光呼吸、扫描线循环
 */
export const CineDashboard: React.FC<{data?: DashboardData}> = ({data = emptyData}) => {
  const frame = useCurrentFrame()
  const {fps, width, height} = useVideoConfig()
  const d = data

  /* ---------- 镜头：整体推近 + 轻微倾斜 ---------- */
  const camZoom = interpolate(frame, [0, 42], [1.10, 1.0], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1)
  })
  const camTilt = interpolate(frame, [0, 42], [1.4, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1)
  })

  /* ---------- 标题：逐字揭示 ---------- */
  const title = '银川AIGC数字文化产业基地'
  const sub = '平台运营数据 · 实时可视化'

  /* ---------- 章节标记：一条进度轴 ---------- */
  const chapters = [
    {label: '概览', at: 0},
    {label: '趋势', at: 42},
    {label: '分类', at: 62},
    {label: '榜单', at: 84}
  ]
  const activeChapter = chapters.reduce((acc, c, i) => (frame >= c.at ? i : acc), 0)

  /* ---------- 首尾淡入淡出：循环时无缝 ---------- */
  const fadeIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad)
  })
  const totalFrames = timing.dashboardSeconds * 30
  const fadeOut = interpolate(frame, [totalFrames - 16, totalFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad)
  })
  const masterOpacity = Math.min(fadeIn, fadeOut)

  /* ---------- 卡片显形：内容长出来时卡片边框才亮 ---------- */
  const trendCard = interpolate(frame, [38, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad)
  })
  const donutCard = interpolate(frame, [58, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad)
  })
  const topCard = interpolate(frame, [80, 92], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad)
  })

  /* ---------- KPI 卡：从两侧弹入 ---------- */
  const kpiDefs = [
    {label: '累计成交额', value: d.gmv, fmt: yuanLabel, accent: colors.brand, sub: `已完成 ${d.completed} 单 · 抽成 ${yuanLabel(d.commission)}`, side: -1},
    {label: '订单总数', value: d.total, fmt: comma, accent: colors.accent, sub: `进行中 ${d.taken + d.producing + d.delivered} · 待接单 ${d.open}`, side: 1},
    {label: '服务者', value: d.providers, fmt: (n: number) => String(Math.round(n)), accent: colors.good, sub: `在架 ${d.onShelf} 单 · 待审 ${d.pendingApplications}`, side: -1},
    {label: '用户评价', value: d.reviews, fmt: (n: number) => String(Math.round(n)), accent: colors.accent2, sub: `平均分 ${d.avgRating}`, side: 1}
  ]

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bgDeep,
        fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif",
        overflow: 'hidden'
      }}
    >
      {/* 背景层（不参与镜头变换，独立呼吸） */}
      <CineBackground push={1} />

      {/* 前景：参与镜头变换 */}
      <AbsoluteFill
        style={{
          opacity: masterOpacity,
          transform: `perspective(2200px) rotateY(${camTilt * 0.5}deg) scale(${camZoom})`,
          transformOrigin: '50% 45%',
          padding: '40px 48px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}
      >
        {/* 顶栏 */}
        <header style={{display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative'}}>
          <div>
            {/* 逐字揭示的标题 */}
            <div style={{display: 'flex', alignItems: 'center', gap: 14, height: 40}}>
              <span
                style={{
                  width: 4,
                  height: 30,
                  background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`,
                  boxShadow: `0 0 14px ${colors.brand}`,
                  borderRadius: 2,
                  transform: `scaleY(${interpolate(frame, [8, 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1)})})`,
                  transformOrigin: 'bottom'
                }}
              />
              {title.split('').map((ch, i) => {
                const appear = interpolate(frame, [10 + i * 1.4, 10 + i * 1.4 + 12], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.bezier(0.16, 1, 0.3, 1)
                })
                return (
                  <span
                    key={i}
                    style={{
                      color: colors.ink,
                      fontSize: 28,
                      fontWeight: 700,
                      letterSpacing: 3,
                      opacity: appear,
                      transform: `translateY(${(1 - appear) * -14}px)`,
                      textShadow: `0 0 24px ${colors.brand}66`
                    }}
                  >
                    {ch}
                  </span>
                )
              })}
            </div>
            <div
              style={{
                color: colors.ink3,
                fontSize: 13,
                marginTop: 8,
                marginLeft: 18,
                letterSpacing: 2,
                opacity: interpolate(frame, [24, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
              }}
            >
              {sub}
            </div>
          </div>

          {/* 章节进度轴 */}
          <div style={{display: 'flex', alignItems: 'center', gap: 16, opacity: interpolate(frame, [30, 46], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
            {chapters.map((c, i) => (
              <div key={c.label} style={{display: 'flex', alignItems: 'center', gap: 7}}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: i === activeChapter ? colors.brand : colors.ink3,
                    boxShadow: i === activeChapter ? `0 0 12px ${colors.brand}` : 'none',
                    transition: 'background .3s'
                  }}
                />
                <span style={{color: i === activeChapter ? colors.ink2 : colors.ink3, fontSize: 12, letterSpacing: 1}}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </header>

        {/* KPI 行：卡片从两侧弹入 */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16}}>
          {kpiDefs.map((k, i) => {
            const delay = 26 + i * 6
            const enter = interpolate(frame, [delay, delay + 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.16, 1, 0.3, 1)
            })
            return (
              <div
                key={k.label}
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.line}`,
                  borderRadius: 14,
                  backdropFilter: 'blur(20px) saturate(150%)',
                  boxShadow: `0 0 0 1px ${colors.line}, 0 10px 32px rgba(2,8,20,.45)`,
                  padding: '18px 20px',
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: enter,
                  transform: `translateX(${(1 - enter) * k.side * 46}px) scale(${0.94 + enter * 0.06})`
                }}
              >
                <ScanLight delay={delay + 8} period={150} color={k.accent} />
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
                <div style={{color: colors.ink3, fontSize: 12.5, letterSpacing: 1, marginBottom: 8}}>{k.label}</div>
                <RollingNumber value={k.value} format={k.fmt} delay={delay + 10} size={38} color={k.accent} />
                <div style={{color: colors.ink2, fontSize: 12, marginTop: 8, opacity: 0.8}}>{k.sub}</div>
              </div>
            )
          })}
        </div>

        {/* 图表行 */}
        <div style={{display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, flex: 1, minHeight: 0}}>
          {/* 趋势图 */}
          <div
            style={{
              background: colors.panel,
              border: `1px solid ${colors.line}`,
              borderRadius: 14,
              backdropFilter: 'blur(20px) saturate(150%)',
              boxShadow: `0 0 0 1px ${colors.line}, 0 10px 32px rgba(2,8,20,.45)`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              opacity: trendCard
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 0'}}>
              <span style={{width: 3, height: 14, background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`, boxShadow: `0 0 10px ${colors.brand}`, borderRadius: 2}} />
              <span style={{color: colors.ink, fontSize: 15, letterSpacing: 1}}>近 7 天订单趋势</span>
              <span style={{color: colors.ink3, fontSize: 11.5, marginLeft: 'auto'}}>柱=订单量 · 折线=成交额</span>
            </div>
            <div style={{flex: 1, display: 'flex', alignItems: 'center'}}>
              <TrendChart data={d.trend} delay={44} height={210} style={{width: '100%'}} />
            </div>
          </div>

          {/* 环形图 */}
          <div
            style={{
              background: colors.panel,
              border: `1px solid ${colors.line}`,
              borderRadius: 14,
              backdropFilter: 'blur(20px) saturate(150%)',
              boxShadow: `0 0 0 1px ${colors.line}, 0 10px 32px rgba(2,8,20,.45)`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              opacity: donutCard
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 0'}}>
              <span style={{width: 3, height: 14, background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`, boxShadow: `0 0 10px ${colors.brand}`, borderRadius: 2}} />
              <span style={{color: colors.ink, fontSize: 15, letterSpacing: 1}}>服务分类分布</span>
            </div>
            <div style={{flex: 1, display: 'flex', alignItems: 'center', padding: '10px 18px 16px', position: 'relative'}}>
              <PulseRing delay={66} size={120} color={colors.brand} style={{left: '22%', top: '52%'}} />
              <DonutChart data={d.byCategory} delay={64} size={180} centerValue={String(d.onShelf)} centerLabel="在架服务" style={{width: '100%'}} />
            </div>
          </div>
        </div>

        {/* TOP5 */}
        <div
          style={{
            background: colors.panel,
            border: `1px solid ${colors.line}`,
            borderRadius: 14,
            backdropFilter: 'blur(20px) saturate(150%)',
            boxShadow: `0 0 0 1px ${colors.line}, 0 10px 32px rgba(2,8,20,.45)`,
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
            opacity: topCard
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 0'}}>
            <span style={{width: 3, height: 14, background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`, boxShadow: `0 0 10px ${colors.brand}`, borderRadius: 2}} />
            <span style={{color: colors.ink, fontSize: 15, letterSpacing: 1}}>热销服务 TOP 5</span>
            <span style={{color: colors.ink3, fontSize: 11.5, marginLeft: 'auto'}}>按销量排序</span>
          </div>
          <TopList data={d.topServices} delay={86} style={{padding: '12px 20px 16px'}} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
