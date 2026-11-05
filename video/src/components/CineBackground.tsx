import React, {useMemo} from 'react'
import {useCurrentFrame, useVideoConfig, interpolate, Easing} from 'remotion'
import {colors} from '../tokens'

/**
 * 电影感背景层
 *
 * 四层叠加，制造景深：
 *   1. 星云辉光（呼吸脉动）
 *   2. 透视网格（缓慢推进 + 呼吸）
 *   3. 纵向数据流（远处，模糊感）
 *   4. 浮尘粒子（近景，景深不同速度）
 *
 * 关键：所有随机量必须由 seed 决定，不能用 Math.random()，
 * 否则 Remotion 逐帧渲染时每帧结果不一致。
 */

/** 确定性伪随机：同一 seed 永远返回同一值 */
function seeded(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export const CineBackground: React.FC<{
  /** 镜头推进强度（0-1） */
  push?: number
  /** 粒子数量 */
  density?: number
}> = ({push = 1, density = 46}) => {
  const frame = useCurrentFrame()
  const {width, height} = useVideoConfig()

  // 镜头推进：整个背景层缓慢放大 + 上移
  const zoom = interpolate(frame, [0, 180], [1.12, 1.0], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1)
  })
  const panY = interpolate(frame, [0, 180], [30, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1)
  })

  // 网格推进（横纵反向，形成空间纵深）
  const gridX = (frame * 0.55) % 64
  const gridY = (frame * 0.22) % 64

  // 辉光呼吸
  const breathe = 0.85 + Math.sin(frame / 38) * 0.15

  // 粒子：三层不同速度制造景深
  const particles = useMemo(() => {
    const out: {
      x: number
      y: number
      r: number
      o: number
      hue: string
      layer: number
    }[] = []
    for (let i = 0; i < density; i++) {
      const layer = i % 3
      const speed = [0.18, 0.42, 0.9][layer]
      const size = [1.1, 1.9, 3.0][layer]
      const alpha = [0.22, 0.38, 0.62][layer]
      const x = seeded(i * 3.1) * width
      const baseY = seeded(i * 7.7) * height
      const y = (baseY + frame * speed) % (height + 60) - 30
      out.push({
        x,
        y,
        r: size * (0.6 + seeded(i * 5.3) * 0.8),
        o: alpha * (0.5 + seeded(i * 9.1) * 0.5) * breathe,
        hue: seeded(i * 13.3) > 0.72 ? colors.accent : colors.brand,
        layer
      })
    }
    return out
  }, [density, frame, height, width, breathe])

  // 数据流：远处的纵向光带
  const streams = useMemo(() => {
    const out: {x: number; w: number; speed: number; o: number}[] = []
    for (let i = 0; i < 9; i++) {
      out.push({
        x: seeded(i * 2.7) * width,
        w: 1 + seeded(i * 4.1) * 2.5,
        speed: 3 + seeded(i * 6.3) * 6,
        o: 0.10 + seeded(i * 8.9) * 0.12
      })
    }
    return out
  }, [width])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        transform: `scale(${zoom}) translateY(${panY * push}px)`,
        transformOrigin: '50% 42%'
      }}
    >
      {/* 1. 星云辉光（呼吸） */}
      <div
        style={{
          position: 'absolute',
          inset: '-10%',
          background: `
            radial-gradient(760px 520px at 14% ${8 + breathe * 2}%, ${colors.brand}40, transparent 62%),
            radial-gradient(700px 480px at 88% 6%, ${colors.accent}38, transparent 64%),
            radial-gradient(900px 620px at 50% 104%, ${colors.accent2}26, transparent 62%)
          `,
          filter: 'blur(10px)'
        }}
      />

      {/* 2. 透视网格 */}
      <div
        style={{
          position: 'absolute',
          inset: '-20%',
          backgroundImage: `
            linear-gradient(${colors.lineBright} 1px, transparent 1px),
            linear-gradient(90deg, ${colors.lineBright} 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          backgroundPosition: `${gridX}px ${gridY}px`,
          opacity: 0.30 * breathe,
          maskImage: 'radial-gradient(ellipse 85% 75% at 50% 45%, black 45%, transparent 92%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 75% at 50% 45%, black 45%, transparent 92%)'
        }}
      />
      {/* 2b. 粗网格（更稀，构成纵深参照） */}
      <div
        style={{
          position: 'absolute',
          inset: '-20%',
          backgroundImage: `
            linear-gradient(${colors.brand}44 1.5px, transparent 1.5px),
            linear-gradient(90deg, ${colors.brand}44 1.5px, transparent 1.5px)
          `,
          backgroundSize: '256px 256px',
          backgroundPosition: `${gridX * 4}px ${gridY * 4}px`,
          opacity: 0.24 * breathe,
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, black 35%, transparent 88%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, black 35%, transparent 88%)'
        }}
      />

      {/* 3. 数据流 */}
      {streams.map((s, i) => {
        const y = ((frame * s.speed + i * 220) % (height + 300)) - 150
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: s.x,
              top: y,
              width: s.w,
              height: 120 + i * 18,
              background: `linear-gradient(180deg, transparent, ${colors.brand}, transparent)`,
              opacity: s.o,
              filter: 'blur(1.5px)'
            }}
          />
        )
      })}

      {/* 4. 浮尘粒子 */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: '50%',
            background: p.hue,
            opacity: p.o,
            boxShadow: p.layer === 2 ? `0 0 ${p.r * 3}px ${p.hue}` : 'none',
            filter: p.layer === 0 ? 'blur(1px)' : 'none'
          }}
        />
      ))}

      {/* 5. 全屏扫描线 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: ((frame * 2.2) % (height + 400)) - 200,
          height: 180,
          background: `linear-gradient(180deg, transparent, ${colors.brand}12, transparent)`,
          pointerEvents: 'none'
        }}
      />

      {/* 6. 斜向光带：制造空间纵深 */}
      {[0, 1, 2].map((i) => {
        const drift = ((frame * (0.18 + i * 0.09)) % (width + 900)) - 450
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '-25%',
              left: drift + i * 320,
              width: 260 + i * 90,
              height: '150%',
              background: `linear-gradient(90deg, transparent, ${i === 1 ? colors.accent : colors.brand}0F, transparent)`,
              transform: 'rotate(22deg)',
              filter: 'blur(24px)',
              opacity: 0.9
            }}
          />
        )
      })}
    </div>
  )
}
