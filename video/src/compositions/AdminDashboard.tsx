import React from 'react'
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring} from 'remotion'
import {colors, timing, yuanLabel, comma, emptyData, type DashboardData, easing} from '../tokens'
import {Panel, PanelTitle} from '../components/Panel'
import {KpiCard} from '../components/KpiCard'
import {TrendChart} from '../components/TrendChart'
import {DonutChart} from '../components/DonutChart'
import {TopList} from '../components/TopList'

/**
 * 管理端数据大屏 —— 横屏 1920×1080
 *
 * 这是「控制端可视化数据版」的主画面：
 * 4 个 KPI + 7 天趋势 + 分类环形 + 热销榜，一屏看完平台运营状况。
 */
export const AdminDashboard: React.FC<{data?: DashboardData}> = ({data = emptyData}) => {
  const frame = useCurrentFrame()
  const {fps, width, height} = useVideoConfig()
  const d = data

  // 整体入场：轻微缩放 + 淡入
  const intro = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easing.enter
  })

  // 背景网格（缓慢漂移，制造空间感）
  const drift = (frame * 0.35) % 56

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif",
        overflow: 'hidden'
      }}
    >
      {/* 背景：辉光 + 网格 */}
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(900px 520px at 6% -6%, ${colors.brand}33, transparent 62%),
            radial-gradient(820px 480px at 96% 2%, ${colors.accent}30, transparent 64%),
            radial-gradient(700px 520px at 50% 108%, ${colors.accent2}1f, transparent 62%)
          `,
          zIndex: 0
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `
            linear-gradient(${colors.line}55 1px, transparent 1px),
            linear-gradient(90deg, ${colors.line}55 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
          backgroundPosition: `${drift}px ${drift}px`,
          opacity: 0.5,
          zIndex: 0
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '38px 46px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          height: '100%',
          opacity: intro,
          transform: `scale(${0.985 + intro * 0.015})`
        }}
      >
        {/* 顶部标题栏 */}
        <header style={{display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between'}}>
          <div>
            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
              <span
                style={{
                  width: 4,
                  height: 22,
                  background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`,
                  boxShadow: `0 0 12px ${colors.brand}`,
                  borderRadius: 2
                }}
              />
              <span style={{color: colors.ink, fontSize: 25, fontWeight: 700, letterSpacing: 2}}>
                银川AIGC数字文化产业基地 · 运营数据
              </span>
            </div>
            <div style={{color: colors.ink3, fontSize: 13, marginTop: 8, marginLeft: 16}}>
              平台实时经营概况 · 数据来自云端订单与服务者库
            </div>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: colors.good,
                boxShadow: `0 0 10px ${colors.good}`,
                animation: `pulse 2s ease-in-out infinite`
              }}
            />
            <span style={{color: colors.ink2, fontSize: 13}}>实时</span>
            <span style={{color: colors.ink3, fontSize: 12, marginLeft: 10}}>宁夏云辇文化科技有限公司</span>
          </div>
        </header>

        {/* KPI 行 */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18}}>
          <KpiCard
            label="累计成交额"
            value={d.gmv}
            format="yuan"
            accent={colors.brand}
            delay={6}
            sub={`已完成 ${d.completed} 单 · 抽成 ${yuanLabel(d.commission)}`}
          />
          <KpiCard
            label="订单总数"
            value={d.total}
            format="comma"
            accent={colors.accent}
            delay={6 + timing.kpiStagger}
            sub={`进行中 ${d.taken + d.producing + d.delivered} · 待接单 ${d.open}`}
          />
          <KpiCard
            label="服务者"
            value={d.providers}
            accent={colors.good}
            delay={6 + timing.kpiStagger * 2}
            sub={`在架服务 ${d.onShelf} 单 · 待审 ${d.pendingApplications}`}
          />
          <KpiCard
            label="用户评价"
            value={d.reviews}
            accent={colors.accent2}
            delay={6 + timing.kpiStagger * 3}
            sub={`平均分 ${d.avgRating} · 全部可查`}
          />
        </div>

        {/* 图表行 */}
        <div style={{display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, flex: 1, minHeight: 0}}>
          <Panel style={{display: 'flex', flexDirection: 'column', minHeight: 0}}>
            <PanelTitle
              title="近 7 天订单趋势"
              sub="柱=订单量 · 折线=成交额"
              right={
                <span style={{color: colors.ink3, fontSize: 12}}>
                  共 {d.trend.reduce((s, t) => s + t.count, 0)} 单
                </span>
              }
            />
            <div style={{flex: 1, display: 'flex', alignItems: 'center', minHeight: 0}}>
              <TrendChart data={d.trend} style={{width: '100%'}} />
            </div>
          </Panel>

          <Panel style={{display: 'flex', flexDirection: 'column', minHeight: 0}}>
            <PanelTitle title="服务分类分布" sub="在架服务数" />
            <div style={{flex: 1, display: 'flex', alignItems: 'center', padding: '10px 20px 18px'}}>
              <DonutChart
                data={d.byCategory}
                centerValue={String(d.onShelf)}
                centerLabel="在架服务"
                style={{width: '100%'}}
              />
            </div>
          </Panel>
        </div>

        {/* 热销榜 */}
        <Panel style={{flexShrink: 0}}>
          <PanelTitle
            title="热销服务 TOP 5"
            sub="按销量排序"
            right={<span style={{color: colors.ink3, fontSize: 12}}>服务者 · 销量</span>}
          />
          <TopList data={d.topServices} />
        </Panel>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .35; }
        }
      `}</style>
    </AbsoluteFill>
  )
}
