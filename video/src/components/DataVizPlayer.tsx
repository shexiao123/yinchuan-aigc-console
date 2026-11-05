import React from 'react'
import {Player, type PlayerRef} from '@remotion/player'
import {CineDashboard} from '../compositions/CineDashboard'
import type {DashboardData} from '../tokens'

/**
 * 网页端嵌入组件
 *
 * 用 @remotion/player 在真实网页里播放 Remotion 组合，
 * 无需渲染成视频文件，直接吃实时数据。
 */
export const DataVizPlayer: React.FC<{
  data: DashboardData
  /** 循环播放 */
  loop?: boolean
  /** 暴露播放器实例（调试 / 手动控制用） */
  playerRef?: (ref: PlayerRef | null) => void
  style?: React.CSSProperties
}> = ({data, loop = true, playerRef, style}) => {
  return (
    <Player
      ref={playerRef as unknown as React.Ref<PlayerRef>}
      component={CineDashboard}
      inputProps={{data}}
      durationInFrames={360}
      fps={30}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{width: '100%', height: '100%', ...style}}
      loop={loop}
      controls={false}
      acknowledgeRemotionLicense
    />
  )
}
