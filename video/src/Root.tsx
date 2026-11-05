import React from 'react'
import {Composition} from 'remotion'
import {AdminDashboard} from './compositions/AdminDashboard'
import {MobileShareCard} from './compositions/MobileShareCard'
import {CineDashboard} from './compositions/CineDashboard'
import {sampleData} from './data/sample'
import {emptyData, timing} from './tokens'

/**
 * Remotion 入口 —— 注册所有组合
 *
 * AdminDashboard   1920×1080 横屏 · 管理端数据大屏
 * MobileShareCard  1080×1920 竖屏 · 小程序端分享卡
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AdminDashboard"
        component={AdminDashboard}
        durationInFrames={timing.dashboardSeconds * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{data: sampleData}}
      />
      <Composition
        id="CineDashboard"
        component={CineDashboard}
        durationInFrames={timing.dashboardSeconds * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{data: sampleData}}
      />
      <Composition
        id="MobileShareCard"
        component={MobileShareCard}
        durationInFrames={timing.shareCardSeconds * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{data: sampleData}}
      />
      <Composition
        id="AdminDashboardEmpty"
        component={AdminDashboard}
        durationInFrames={timing.dashboardSeconds * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{data: emptyData}}
      />
    </>
  )
}
