import React from 'react'
import {colors, geo, easing} from '../tokens'

/**
 * 面板容器 —— 玻璃拟态 + 顶部霓虹高光边
 * 网页端/视频/小程序 canvas 版共用同一套几何规格
 */
export const Panel: React.FC<{
  children: React.ReactNode
  style?: React.CSSProperties
  accent?: string
}> = ({children, style, accent = colors.brand}) => {
  return (
    <div
      style={{
        background: colors.panel,
        border: `1px solid ${colors.line}`,
        borderRadius: geo.radius,
        backdropFilter: 'blur(18px)',
        boxShadow: `0 0 0 1px ${colors.line}, 0 8px 28px rgba(2,8,20,0.4)`,
        position: 'relative',
        overflow: 'hidden',
        ...style
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`
        }}
      />
      {children}
    </div>
  )
}

/**
 * 面板标题
 */
export const PanelTitle: React.FC<{
  title: string
  sub?: string
  right?: React.ReactNode
  style?: React.CSSProperties
}> = ({title, sub, right, style}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '18px 22px 0',
        ...style
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
        <span
          style={{
            display: 'inline-block',
            width: 3,
            height: 13,
            background: `linear-gradient(180deg, ${colors.brand}, ${colors.accent})`,
            boxShadow: `0 0 10px ${colors.brand}`,
            borderRadius: 2
          }}
        />
        <span style={{color: colors.ink, fontSize: 16, letterSpacing: 1}}>{title}</span>
        {sub ? <span style={{color: colors.ink3, fontSize: 12}}>{sub}</span> : null}
      </div>
      {right}
    </div>
  )
}
