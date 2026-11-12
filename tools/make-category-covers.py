#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""按分类内容生成封面插图（8 张，1600x1000，16:10）

背景：原 8 张分类封面是同一套赛博城市素材的不同裁切，与「婚礼跟拍 / AE 动画 /
AI 生成」等内容毫无关系，看起来单一、单调。此脚本按分类语义各画一张主题插画：

  01 婚礼跟拍   取景框 + 双人剪影 + 相机
  02 婚礼微电影 场记板 + 胶片带 + 交叠戒指
  03 品牌宣传片 摄影机 + 三脚架 + 打光
  04 短视频剪辑 竖屏手机 + 时间轴 + 音轨
  05 商业摄影   柔光箱 + 静物台 + 产品
  06 AE 动画    贝塞尔曲线 + 关键帧 + 图层堆叠
  07 AI 生成    节点网络 + 发光核 + 生成粒子
  08 漫剧制作   分格画框 + 对话气泡 + 速度线

统一设计语言：冷白渐变底 + 柔和色晕 + 细线几何 + 网格纹理 + 颗粒 + HUD 角标。
用法：python tools/make-category-covers.py [输出目录]
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 2                      # 超采样倍数
W, H = 1600, 1000           # 逻辑尺寸
CW, CH = W * SS, H * SS

FONT_DIR = 'C:/Windows/Fonts'
FONT_MONO = os.path.join(FONT_DIR, 'consola.ttf')

# 各分类配色：(主色, 辅色, 深色)
PALETTES = {
    1: ('#D89A8E', '#2F6BEA', '#3B4A63'),
    2: ('#8B7AB8', '#2F6BEA', '#3A3566'),
    3: ('#0E7C86', '#2F6BEA', '#0B3B49'),
    4: ('#35B29A', '#2F6BEA', '#0F4F52'),
    5: ('#D9A44E', '#5B7186', '#4A3F2E'),
    6: ('#6B6BE0', '#C86BC8', '#3A3A6E'),
    7: ('#2F6BEA', '#7C4DFF', '#1B2A5C'),
    8: ('#E0795F', '#5B4FBF', '#4A2B33'),
}

LABELS = {
    1: 'WEDDING SHOOT',
    2: 'WEDDING FILM',
    3: 'BRAND FILM',
    4: 'SHORT VIDEO',
    5: 'COMMERCIAL PHOTO',
    6: 'AE MOTION',
    7: 'AI GENERATIVE',
    8: 'COMIC DRAMA',
}


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def p(v):
    """逻辑坐标 -> 超采样坐标"""
    return v * SS


def base_canvas():
    """冷白斜向渐变底（左上偏青白，右下偏蓝白）"""
    y, x = np.mgrid[0:CH, 0:CW].astype(np.float32)
    t = (x / CW * 0.38 + y / CH * 0.62)
    t = np.clip(t, 0, 1)[..., None]
    c1 = np.array([250, 252, 255], np.float32)
    c2 = np.array([231, 240, 252], np.float32)
    arr = c1 * (1 - t) + c2 * t
    rgb = np.dstack([arr, np.full((CH, CW, 1), 255.0, np.float32)]).astype(np.uint8)
    return Image.fromarray(rgb, 'RGBA')


def glow(img, cx, cy, r, color, alpha=70, blur=None):
    """柔和光晕：实色椭圆 -> 高斯模糊 -> 叠加"""
    layer = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([p(cx - r), p(cy - r), p(cx + r), p(cy + r)], fill=hexrgb(color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur if blur is not None else p(r * 0.55)))
    img.alpha_composite(layer)


def soft_poly(img, pts, color, alpha=40, blur=60):
    """柔和渐隐色块（先实色再模糊）"""
    layer = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.polygon([(p(x), p(y)) for x, y in pts], fill=hexrgb(color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(p(blur)))
    img.alpha_composite(layer)


def grid(img, step=40, alpha=9, color='#5B7186', margin=0):
    layer = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    col = hexrgb(color, alpha)
    x = margin
    while x < W - margin + 1:
        d.line([p(x), p(margin), p(x), p(H - margin)], fill=col, width=SS)
        x += step
    y = margin
    while y < H - margin + 1:
        d.line([p(margin), p(y), p(W - margin), p(y)], fill=col, width=SS)
        y += step
    img.alpha_composite(layer)


def hud(img, label, color='#2F6BEA'):
    """右下角 HUD 角标：细线括号 + 等宽小字"""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 1402, 862, 1552, 942
    col = hexrgb(color, 150)
    w = p(1.6)
    seg = p(18)
    for (cx, cy, dx, dy) in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        d.line([p(cx), p(cy), p(cx + dx * seg), p(cy)], fill=col, width=int(w) or 1)
        d.line([p(cx), p(cy), p(cx), p(cy + dy * seg)], fill=col, width=int(w) or 1)
    try:
        font = ImageFont.truetype(FONT_MONO, p(11))
        d.text((p(x0 + 8), p(y0 + 62)), label, font=font, fill=hexrgb(color, 120))
    except Exception:
        pass


def grain(img, amp=5):
    """轻微颗粒（只在 RGB 上做，返回 RGB）"""
    if img.mode != 'RGB':
        img = img.convert('RGB')
    arr = np.array(img, dtype=np.int16)
    noise = np.random.normal(0, amp, arr.shape).astype(np.int16)
    arr = np.clip(arr + noise, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGB')


# ---------------------------------------------------------------- 01 婚礼跟拍
def cat_01(img):
    main, accent, deep = PALETTES[1]
    glow(img, 1230, 250, 330, main, 82)
    glow(img, 330, 780, 300, accent, 46)
    soft_poly(img, [(980, 120), (1600, 0), (1600, 520), (1080, 620)], main, 30, 90)

    d = ImageDraw.Draw(img)
    # 取景框四角
    x0, y0, x1, y1 = 360, 170, 1260, 830
    col = hexrgb(main, 210)
    seg, wid = 96, p(3.4)
    for (cx, cy, dx, dy) in [(x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)]:
        d.line([p(cx), p(cy), p(cx + dx * seg), p(cy)], fill=col, width=int(wid))
        d.line([p(cx), p(cy), p(cx), p(cy + dy * seg)], fill=col, width=int(wid))
    d.line([p(x0), p(500), p(x1), p(500)], fill=hexrgb(main, 40), width=SS)
    d.line([p(810), p(y0), p(810), p(y1)], fill=hexrgb(main, 40), width=SS)

    # 双人剪影：头 + 脖 + 肩一体（同一实色直写像素，无缝）
    def figure(cx, head_r, sw, top, fill):
        hy = top + head_r
        d.ellipse([p(cx - head_r), p(hy - head_r), p(cx + head_r), p(hy + head_r)], fill=fill)
        d.rectangle([p(cx - head_r * 0.36), p(hy + head_r * 0.5),
                     p(cx + head_r * 0.36), p(top + head_r * 2.05)], fill=fill)
        sh_top = top + head_r * 1.95
        d.rounded_rectangle([p(cx - sw), p(sh_top), p(cx + sw), p(sh_top + sw * 1.3)],
                            radius=p(sw * 0.55), fill=fill)

    figure(650, 42, 76, 392, hexrgb(deep, 205))
    figure(856, 37, 66, 428, hexrgb(deep, 148))
    # 头纱（新娘侧两层细弧）
    d.arc([p(886), p(470), p(1064), p(706)], 270, 90, fill=hexrgb('#FFFFFF', 175), width=int(p(3)))
    d.arc([p(908), p(492), p(1092), p(726)], 270, 90, fill=hexrgb('#FFFFFF', 120), width=int(p(2.4)))

    # 对焦框（贴住两人）
    fx0, fy0, fx1, fy1 = 552, 352, 972, 772
    fcol = hexrgb(accent, 165)
    fseg = 42
    fwid = int(p(2.4))
    for (cx, cy, dx, dy) in [(fx0, fy0, 1, 1), (fx1, fy0, -1, 1), (fx0, fy1, 1, -1), (fx1, fy1, -1, -1)]:
        d.line([p(cx), p(cy), p(cx + dx * fseg), p(cy)], fill=fcol, width=fwid)
        d.line([p(cx), p(cy), p(cx), p(cy + dy * fseg)], fill=fcol, width=fwid)

    # 相机（右下，放大）
    cx, cy = 1080, 752
    d.rounded_rectangle([p(cx - 128), p(cy - 52), p(cx + 128), p(cy + 52)], radius=p(14),
                        outline=hexrgb(deep, 195), width=int(p(3)))
    d.ellipse([p(cx - 52), p(cy - 52), p(cx + 52), p(cy + 52)], outline=hexrgb(deep, 195), width=int(p(3)))
    d.ellipse([p(cx - 30), p(cy - 30), p(cx + 30), p(cy + 30)], outline=hexrgb(deep, 170), width=int(p(2.4)))
    d.ellipse([p(cx - 12), p(cy - 12), p(cx + 12), p(cy + 12)], fill=hexrgb(accent, 125))
    d.rounded_rectangle([p(cx + 52), p(cy - 86), p(cx + 96), p(cy - 50)], radius=p(6),
                        outline=hexrgb(deep, 150), width=int(p(2.4)))
    d.rounded_rectangle([p(cx - 128), p(cy - 82), p(cx - 76), p(cy - 50)], radius=p(6),
                        fill=hexrgb(main, 120))
    # 录制红点 + 弧
    d.ellipse([p(438), p(240), p(462), p(264)], fill=hexrgb('#E05656', 210))
    d.arc([p(408), p(212), p(492), p(296)], 110, 340, fill=hexrgb(deep, 110), width=int(p(2)))
    # 光斑
    for (bx, by, br, a) in [(1150, 540, 26, 90), (1240, 630, 16, 70), (1070, 690, 10, 60)]:
        d.ellipse([p(bx - br), p(by - br), p(bx + br), p(by + br)], fill=hexrgb('#FFFFFF', a))


# ---------------------------------------------------------------- 02 婚礼微电影
def cat_02(img):
    main, accent, deep = PALETTES[2]
    glow(img, 1180, 300, 340, main, 78)
    glow(img, 320, 760, 280, accent, 44)
    soft_poly(img, [(0, 560), (520, 420), (700, 1000), (0, 1000)], main, 26, 100)

    d = ImageDraw.Draw(img)
    # 胶片带（斜穿右下）
    film = [(1120, 640), (1600, 470), (1600, 690), (1120, 860)]
    d.polygon([(p(x), p(y)) for x, y in film], fill=hexrgb('#FFFFFF', 200))
    d.line([(p(1120), p(640)), (p(1600), p(470))], fill=hexrgb(main, 150), width=int(p(2)))
    d.line([(p(1120), p(860)), (p(1600), p(690))], fill=hexrgb(main, 150), width=int(p(2)))
    for i in range(9):
        t = i / 8.0
        hx = 1120 + t * 470
        hy = 640 + t * (470 - 640)
        d.rectangle([p(hx - 9), p(hy + 8), p(hx + 9), p(hy + 24)], fill=hexrgb(deep, 120))
        d.rectangle([p(hx - 9), p(hy + 178), p(hx + 9), p(hy + 194)], fill=hexrgb(deep, 120))

    # 场记板（倾斜）
    board = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    bd = ImageDraw.Draw(board)
    bx0, by0, bx1, by1 = 360, 300, 1000, 560
    bd.rounded_rectangle([p(bx0), p(by0), p(bx1), p(by1)], radius=p(8),
                         fill=hexrgb('#FFFFFF', 232), outline=hexrgb(deep, 200), width=int(p(3)))
    # 顶部斜条纹带
    bd.rectangle([p(bx0), p(by0), p(bx1), p(by0 + 84)], fill=hexrgb(deep, 235))
    stripe_w = 40
    x = bx0 - 40
    while x < bx1 + 40:
        bd.polygon([(p(x), p(by0)), (p(x + stripe_w), p(by0)),
                    (p(x + stripe_w - 34), p(by0 + 84)), (p(x - 34), p(by0 + 84))],
                   fill=hexrgb('#F5F7FB', 240))
        x += stripe_w * 2
    # 板面内文字线（不写具体文字，避免字体问题）
    for i, (ly, lw) in enumerate([(by0 + 140, 300), (by0 + 186, 380), (by0 + 232, 240)]):
        bd.rounded_rectangle([p(bx0 + 40), p(ly), p(bx0 + 40 + lw), p(ly + 12)], radius=p(6),
                             fill=hexrgb(main, 90 - i * 18))
    board = board.rotate(-7, resample=Image.BICUBIC, center=(p(680), p(430)))
    img.alpha_composite(board)

    # 交叠戒指 + 钻石
    d = ImageDraw.Draw(img)
    rc = hexrgb(main, 225)
    d.ellipse([p(1060), p(290), p(1190), p(420)], outline=rc, width=int(p(6)))
    d.ellipse([p(1150), p(290), p(1280), p(420)], outline=rc, width=int(p(6)))
    dxc, dyc = 1185, 264
    d.polygon([(p(dxc - 22), p(dyc - 8)), (p(dxc + 22), p(dyc - 8)), (p(dxc), p(dyc + 30))],
              fill=hexrgb('#FFFFFF', 240), outline=hexrgb(accent, 200))
    d.line([p(dxc - 22), p(dyc - 8), p(dxc + 22), p(dyc - 8)], fill=hexrgb(accent, 170), width=int(p(2)))


# ---------------------------------------------------------------- 03 品牌宣传片
def cat_03(img):
    main, accent, deep = PALETTES[3]
    glow(img, 1240, 620, 330, main, 74)
    glow(img, 300, 260, 300, accent, 42)
    # 打光锥（从灯罩射向摄影机）
    beam = [(392, 250), (1000, 420), (1000, 640), (392, 290)]
    soft_poly(img, beam, '#FFFFFF', 52, 64)

    d = ImageDraw.Draw(img)
    # 影视灯（左：灯罩 + 灯杆 + 底脚）
    d.polygon([(p(298), p(206)), (p(374), p(206)), (p(394), p(282)), (p(278), p(282))],
              fill=hexrgb('#FFFFFF', 225), outline=hexrgb(main, 215), width=int(p(2.6)))
    d.line([(p(336), p(282)), (p(336), p(862))], fill=hexrgb(main, 195), width=int(p(3.4)))
    d.line([(p(292), p(902)), (p(336), p(858))], fill=hexrgb(main, 175), width=int(p(2.6)))
    d.line([(p(380), p(902)), (p(336), p(858))], fill=hexrgb(main, 175), width=int(p(2.6)))

    # 摄影机
    bx0, by0, bx1, by1 = 480, 400, 900, 620
    # 提手（弧形，两端落在机身上沿）
    d.arc([p(bx0 + 70), p(by0 - 92), p(bx1 - 70), p(by0 + 70)], 180, 360,
          fill=hexrgb(deep, 215), width=int(p(6)))
    # 机身
    d.rounded_rectangle([p(bx0), p(by0), p(bx1), p(by1)], radius=p(16),
                        fill=hexrgb('#FFFFFF', 228), outline=hexrgb(deep, 218), width=int(p(3.2)))
    # 侧屏 + 旋钮 + REC
    d.rounded_rectangle([p(bx0 + 26), p(by0 + 30), p(bx0 + 152), p(by1 - 30)], radius=p(8),
                        fill=hexrgb(main, 55), outline=hexrgb(deep, 150), width=int(p(2)))
    d.ellipse([p(bx0 + 192), p(by0 + 24), p(bx0 + 220), p(by0 + 52)], outline=hexrgb(deep, 170), width=int(p(2.2)))
    d.ellipse([p(bx0 + 238), p(by0 + 24), p(bx0 + 266), p(by0 + 52)], outline=hexrgb(deep, 170), width=int(p(2.2)))
    d.ellipse([p(bx0 + 196), p(by1 - 54), p(bx0 + 218), p(by1 - 32)], fill=hexrgb('#E05656', 220))
    d.rounded_rectangle([p(bx0 + 230), p(by1 - 49), p(bx0 + 298), p(by1 - 37)], radius=p(5), fill=hexrgb(deep, 85))
    # 镜头筒（两段收窄）+ 前端镜环
    t1 = bx1 + 64
    t2 = t1 + 56
    lcy = (by0 + by1) / 2
    d.rounded_rectangle([p(bx1), p(by0 + 58), p(t1), p(by1 - 26)], radius=p(6),
                        fill=hexrgb('#FFFFFF', 205), outline=hexrgb(deep, 212), width=int(p(2.8)))
    d.rounded_rectangle([p(t1), p(by0 + 80), p(t2), p(by1 - 48)], radius=p(6),
                        fill=hexrgb('#FFFFFF', 190), outline=hexrgb(deep, 212), width=int(p(2.8)))
    d.ellipse([p(t2 - 8), p(lcy - 68), p(t2 + 72), p(lcy + 68)], fill=hexrgb('#FFFFFF', 215),
              outline=hexrgb(deep, 218), width=int(p(3.2)))
    d.ellipse([p(t2 + 10), p(lcy - 46), p(t2 + 54), p(lcy + 46)], outline=hexrgb(deep, 195), width=int(p(2.6)))
    d.ellipse([p(t2 + 22), p(lcy - 22), p(t2 + 42), p(lcy + 22)], fill=hexrgb(accent, 135))
    # 取景器（机身后侧）
    d.rounded_rectangle([p(bx0 - 58), p(by0 + 42), p(bx0 - 6), p(by0 + 116)], radius=p(6),
                        outline=hexrgb(deep, 195), width=int(p(2.4)))
    # 三脚架 + 云台
    d.polygon([(p(658), p(620)), (p(692), p(620)), (p(686), p(650)), (p(664), p(650))],
              fill=hexrgb(deep, 185))
    d.line([(p(675), p(650)), (p(583), p(902))], fill=hexrgb(deep, 190), width=int(p(4)))
    d.line([(p(675), p(650)), (p(777), p(902))], fill=hexrgb(deep, 190), width=int(p(4)))
    d.line([(p(676), p(650)), (p(678), p(914))], fill=hexrgb(deep, 125), width=int(p(2)))
    # 片场地面
    d.line([p(200), p(908), p(1400), p(908)], fill=hexrgb(deep, 60), width=int(p(2)))


# ---------------------------------------------------------------- 04 短视频剪辑
def cat_04(img):
    main, accent, deep = PALETTES[4]
    glow(img, 1180, 700, 320, main, 78)
    glow(img, 360, 280, 260, accent, 44)

    d = ImageDraw.Draw(img)
    # 竖屏手机
    mx0, my0, mx1, my1 = 660, 150, 1000, 742
    d.rounded_rectangle([p(mx0), p(my0), p(mx1), p(my1)], radius=p(34),
                        fill=hexrgb('#FFFFFF', 215), outline=hexrgb(deep, 210), width=int(p(3.4)))
    d.rounded_rectangle([p(mx0 + 22), p(my0 + 40), p(mx1 - 22), p(my1 - 40)], radius=p(20),
                        fill=hexrgb(main, 40))
    # 播放三角
    cxp, cyp = 830, 400
    d.polygon([(p(cxp - 26), p(cyp - 44)), (p(cxp - 26), p(cyp + 44)), (p(cxp + 48), p(cyp))],
              fill=hexrgb(deep, 200))
    # 进度条
    d.rounded_rectangle([p(mx0 + 44), p(my1 - 82), p(mx1 - 44), p(my1 - 72)], radius=p(5),
                        fill=hexrgb(deep, 40))
    d.rounded_rectangle([p(mx0 + 44), p(my1 - 82), p(mx0 + 160), p(my1 - 72)], radius=p(5),
                        fill=hexrgb(main, 220))
    # 时间轴三条轨道
    tracks = [(800, main, 90), (836, accent, 70), (872, deep, 55)]
    for ly, col, a in tracks:
        d.line([p(300), p(ly), p(1340), p(ly)], fill=hexrgb(deep, 28), width=int(p(2)))
        d.rounded_rectangle([p(300), p(ly - 9), p(640), p(ly + 9)], radius=p(5), fill=hexrgb(col, a))
        d.rounded_rectangle([p(700), p(ly - 9), p(980), p(ly + 9)], radius=p(5), fill=hexrgb(col, a - 18))
        d.rounded_rectangle([p(1040), p(ly - 9), p(1240), p(ly + 9)], radius=p(5), fill=hexrgb(col, a - 30))
    # 播放头
    d.line([p(1010), p(760), p(1010), p(896)], fill=hexrgb(main, 220), width=int(p(2.6)))
    d.polygon([(p(994), p(752)), (p(1026), p(752)), (p(1010), p(772))], fill=hexrgb(main, 220))
    # 音轨波形
    pts = []
    for i in range(0, 61):
        x = 300 + i * 17.3
        amp = (math.sin(i * 0.9) * 0.5 + math.sin(i * 2.3) * 0.3) * 16
        pts.append((p(x), p(944 + amp)))
    d.line(pts, fill=hexrgb(accent, 130), width=int(p(2)), joint='curve')


# ---------------------------------------------------------------- 05 商业摄影
def cat_05(img):
    main, accent, deep = PALETTES[5]
    glow(img, 400, 300, 320, main, 72)
    glow(img, 1200, 760, 300, accent, 40)

    d = ImageDraw.Draw(img)
    # 柔光箱
    sx0, sy0, sx1, sy1 = 340, 200, 740, 604
    d.rounded_rectangle([p(sx0), p(sy0), p(sx1), p(sy1)], radius=p(12),
                        fill=hexrgb('#FFFFFF', 225), outline=hexrgb(deep, 195), width=int(p(3)))
    for i in range(1, 4):
        d.line([p(sx0 + i * 100), p(sy0), p(sx0 + i * 100), p(sy1)], fill=hexrgb(main, 60), width=int(p(1.6)))
        d.line([p(sx0), p(sy0 + i * 101), p(sx1), p(sy0 + i * 101)], fill=hexrgb(main, 60), width=int(p(1.6)))
    # 面板中心打亮（发光感）
    glow(img, (sx0 + sx1) // 2, (sy0 + sy1) // 2, 110, '#FFFFFF', 135, blur=46)
    # 支架 + 斜撑
    d.line([(p(540), p(sy1)), (p(540), p(880))], fill=hexrgb(deep, 170), width=int(p(3)))
    d.line([(p(540), p(720)), (p(468), p(880))], fill=hexrgb(deep, 110), width=int(p(2.2)))
    d.line([(p(540), p(720)), (p(612), p(880))], fill=hexrgb(deep, 110), width=int(p(2.2)))
    d.line([(p(452), p(884)), (p(628), p(884))], fill=hexrgb(deep, 170), width=int(p(3)))
    # 柔光锥
    soft_poly(img, [(sx1, 300), (1150, 470), (1150, 760), (sx1, 560)], '#FFFFFF', 52, 64)

    # 静物台
    d = ImageDraw.Draw(img)
    d.polygon([(p(820), p(700)), (p(1300), p(700)), (p(1380), p(790)), (p(740), p(790))],
              fill=hexrgb('#FFFFFF', 210), outline=hexrgb(deep, 150))
    # 产品：圆柱
    d.ellipse([p(880), p(586), p(1010), p(640)], fill=hexrgb(main, 120), outline=hexrgb(deep, 190), width=int(p(2.4)))
    d.rectangle([p(880), p(613), p(1010), p(700)], fill=hexrgb(main, 70))
    d.arc([p(880), p(586), p(1010), p(640)], 0, 180, fill=hexrgb(deep, 190), width=int(p(2.4)))
    # 产品：立方体
    d.polygon([(p(1070), p(660)), (p(1170), p(620)), (p(1264), p(660)), (p(1164), p(702))],
              fill=hexrgb('#FFFFFF', 200), outline=hexrgb(deep, 180))
    d.polygon([(p(1070), p(660)), (p(1164), p(702)), (p(1164), p(790)), (p(1070), p(748))],
              fill=hexrgb(accent, 40), outline=hexrgb(deep, 150))
    d.polygon([(p(1264), p(660)), (p(1164), p(702)), (p(1164), p(790)), (p(1264), p(748))],
              fill=hexrgb(main, 55), outline=hexrgb(deep, 150))
    # 相机侧影
    d.rounded_rectangle([p(1210), p(384), p(1430), p(514)], radius=p(12),
                        outline=hexrgb(deep, 180), width=int(p(2.8)))
    d.ellipse([p(1252), p(402), p(1348), p(498)], outline=hexrgb(deep, 180), width=int(p(2.8)))
    d.ellipse([p(1276), p(426), p(1324), p(474)], fill=hexrgb(main, 110))
    # 反光板（柔光箱与静物台之间，带支架）
    d.ellipse([p(830), p(396), p(980), p(546)], outline=hexrgb(main, 120), width=int(p(2.6)))
    d.ellipse([p(868), p(434), p(942), p(508)], fill=hexrgb('#FFFFFF', 130))
    d.line([(p(905), p(546)), (p(905), p(692))], fill=hexrgb(deep, 115), width=int(p(2)))
    # 相机侧影（放大）
    d.rounded_rectangle([p(1210), p(384), p(1430), p(514)], radius=p(12),
                        outline=hexrgb(deep, 180), width=int(p(2.8)))
    d.ellipse([p(1252), p(402), p(1348), p(498)], outline=hexrgb(deep, 180), width=int(p(2.8)))
    d.ellipse([p(1276), p(426), p(1324), p(474)], fill=hexrgb(main, 110))


# ---------------------------------------------------------------- 06 AE 动画
def cat_06(img):
    main, accent, deep = PALETTES[6]
    glow(img, 1150, 260, 320, main, 76)
    glow(img, 1200, 780, 300, accent, 62)

    d = ImageDraw.Draw(img)
    # 图层堆叠（右上，三张错位）
    for i in range(3):
        ox, oy = 1010 + i * 34, 150 + i * 36
        d.rounded_rectangle([p(ox), p(oy), p(ox + 300), p(oy + 180)], radius=p(8),
                            fill=hexrgb('#FFFFFF', 150 - i * 20),
                            outline=hexrgb(main, 150 - i * 25), width=int(p(2)))
        d.line([p(ox + 18), p(oy + 30), p(ox + 120), p(oy + 30)], fill=hexrgb(main, 90), width=int(p(2)))
        d.line([p(ox + 18), p(oy + 56), p(ox + 200), p(oy + 56)], fill=hexrgb(main, 55), width=int(p(2)))

    # 贝塞尔曲线（三次 S 形）+ 端点控制手柄
    bp0 = (320, 730)
    bp1 = (600, 260)
    bp2 = (1020, 830)
    bp3 = (1300, 470)

    def bez(t):
        mt = 1 - t
        x = mt ** 3 * bp0[0] + 3 * mt * mt * t * bp1[0] + 3 * mt * t * t * bp2[0] + t ** 3 * bp3[0]
        y = mt ** 3 * bp0[1] + 3 * mt * mt * t * bp1[1] + 3 * mt * t * t * bp2[1] + t ** 3 * bp3[1]
        return x, y

    d.line([p(bp0[0]), p(bp0[1]), p(bp1[0]), p(bp1[1])], fill=hexrgb(accent, 115), width=int(p(1.6)))
    d.line([p(bp3[0]), p(bp3[1]), p(bp2[0]), p(bp2[1])], fill=hexrgb(accent, 115), width=int(p(1.6)))
    for (hx, hy) in (bp1, bp2):
        d.ellipse([p(hx - 9), p(hy - 9), p(hx + 9), p(hy + 9)], fill=hexrgb('#FFFFFF', 235),
                  outline=hexrgb(accent, 195), width=int(p(2)))
    pts = [(p(bez(i / 100.0)[0]), p(bez(i / 100.0)[1])) for i in range(101)]
    d.line(pts, fill=hexrgb(main, 225), width=int(p(3)))

    # 关键帧菱形
    def diamond(cx, cy, r, fill, outline):
        d.polygon([(p(cx), p(cy - r)), (p(cx + r), p(cy)), (p(cx), p(cy + r)), (p(cx - r), p(cy))],
                  fill=fill, outline=outline)

    for t in (0.0, 0.5, 1.0):
        x, y = bez(t)
        diamond(x, y, 15, hexrgb('#FFFFFF', 240), hexrgb(main, 235))

    # 播放头 + 时间刻度
    d.line([p(700), p(160), p(700), p(912)], fill=hexrgb(accent, 175), width=int(p(2)))
    d.polygon([(p(686), p(150)), (p(714), p(150)), (p(700), p(170))], fill=hexrgb(accent, 215))
    for i in range(0, 13):
        x = 300 + i * 83.3
        long = i % 3 == 0
        d.line([p(x), p(912), p(x), p(912 - (18 if long else 9))], fill=hexrgb(deep, 90), width=int(p(1.8)))


# ---------------------------------------------------------------- 07 AI 生成
def cat_07(img):
    main, accent, deep = PALETTES[7]
    glow(img, 780, 470, 300, main, 88)
    glow(img, 1240, 740, 320, accent, 70)
    glow(img, 300, 260, 240, accent, 40)

    d = ImageDraw.Draw(img)
    # 节点网络（左侧密）
    nodes = [(220, 300), (300, 460), (240, 620), (380, 240), (400, 700),
             (520, 380), (500, 560), (620, 240), (640, 720), (700, 430), (700, 600)]
    for i, (nx, ny) in enumerate(nodes):
        for (mx, my) in nodes[i + 1:]:
            dist = math.hypot(mx - nx, my - ny)
            if dist < 230:
                d.line([p(nx), p(ny), p(mx), p(my)], fill=hexrgb(main, int(60 - dist / 8)), width=int(p(1.4)))
    for (nx, ny) in nodes:
        d.ellipse([p(nx - 6), p(ny - 6), p(nx + 6), p(ny + 6)], fill=hexrgb(main, 190))

    # 中心发光核
    cx, cy = 820, 470
    for r, a in [(120, 26), (84, 40), (52, 70)]:
        d.ellipse([p(cx - r), p(cy - r), p(cx + r), p(cy + r)], fill=hexrgb(accent, a))
    d.ellipse([p(cx - 34), p(cy - 34), p(cx + 34), p(cy + 34)], outline=hexrgb('#FFFFFF', 220), width=int(p(3)))
    d.ellipse([p(cx - 12), p(cy - 12), p(cx + 12), p(cy + 12)], fill=hexrgb('#FFFFFF', 240))

    # 生成粒子（向右溢出的小方块，渐隐渐小）
    rng = np.random.default_rng(7)
    for i in range(26):
        t = i / 25.0
        px = cx + 60 + t * 470 + rng.normal(0, 18)
        py = cy + rng.normal(0, 90 * (1 - t) + 20)
        size = 14 * (1 - t) + 3
        alpha = int(190 * (1 - t) + 25)
        d.rounded_rectangle([p(px), p(py), p(px + size), p(py + size)], radius=p(2),
                            fill=hexrgb(main, alpha))

    # 提示词框
    d.rounded_rectangle([p(1020), p(300), p(1420), p(430)], radius=p(10),
                        outline=hexrgb(deep, 110), width=int(p(2)))
    for i, lw in enumerate([300, 250, 170]):
        d.rounded_rectangle([p(1044), p(330 + i * 32), p(1044 + lw), p(330 + i * 32 + 9)],
                            radius=p(5), fill=hexrgb(main, 80 - i * 20))


# ---------------------------------------------------------------- 08 漫剧制作
def cat_08(img):
    main, accent, deep = PALETTES[8]
    glow(img, 320, 280, 300, main, 74)
    glow(img, 1260, 760, 300, accent, 66)

    d = ImageDraw.Draw(img)
    # 分格外框 + 十字
    x0, y0, x1, y1 = 380, 210, 1240, 810
    mx, my = (x0 + x1) // 2, (y0 + y1) // 2
    d.rounded_rectangle([p(x0), p(y0), p(x1), p(y1)], radius=p(10),
                        outline=hexrgb(deep, 225), width=int(p(8)))
    d.line([p(mx), p(y0), p(mx), p(y1)], fill=hexrgb(deep, 225), width=int(p(8)))
    d.line([p(x0), p(my), p(x1), p(my)], fill=hexrgb(deep, 225), width=int(p(8)))

    # 左上：速度线 + 角色剪影（头 + 肩一体）
    hcx, hcy = mx - 108, my - 96
    for i in range(9):
        oy = y0 + 30 + i * 27
        d.line([p(x0 + 26), p(oy), p(hcx - 120 + i * 9), p(oy - 40)],
               fill=hexrgb(main, 95), width=int(p(2)))
    d.ellipse([p(hcx - 44), p(hcy - 44), p(hcx + 44), p(hcy + 44)], fill=hexrgb(deep, 190))
    d.rounded_rectangle([p(hcx - 62), p(hcy + 8), p(hcx + 62), p(my - 14)], radius=p(28),
                        fill=hexrgb(deep, 190))

    # 右上：对话气泡
    bxx0, byy0 = mx + 60, y0 + 52
    d.rounded_rectangle([p(bxx0), p(byy0), p(x1 - 40), p(byy0 + 120)], radius=p(26),
                        fill=hexrgb('#FFFFFF', 225), outline=hexrgb(accent, 200), width=int(p(3)))
    d.polygon([(p(bxx0 + 40), p(byy0 + 116)), (p(bxx0 + 96), p(byy0 + 116)), (p(bxx0 + 52), p(byy0 + 162))],
              fill=hexrgb('#FFFFFF', 225))
    for i, lw in enumerate([240, 300, 180]):
        d.rounded_rectangle([p(bxx0 + 30), p(byy0 + 26 + i * 30), p(bxx0 + 30 + lw), p(byy0 + 26 + i * 30 + 10)],
                            radius=p(5), fill=hexrgb(accent, 85 - i * 18))

    # 左下：爆炸星形
    sx, sy = (x0 + mx) // 2, (my + y1) // 2
    star = []
    for i in range(16):
        ang = math.pi * 2 * i / 16
        r = 118 if i % 2 == 0 else 54
        star.append((p(sx + math.cos(ang) * r), p(sy + math.sin(ang) * r)))
    d.polygon(star, fill=hexrgb(main, 55), outline=hexrgb(main, 210))

    # 右下：网点
    for gy in range(4):
        for gx in range(7):
            px = mx + 70 + gx * 40
            py = my + 58 + gy * 40
            r = 8 - gy * 0.9
            d.ellipse([p(px - r), p(py - r), p(px + r), p(py + r)], fill=hexrgb(accent, 110))


DRAWERS = {1: cat_01, 2: cat_02, 3: cat_03, 4: cat_04, 5: cat_05, 6: cat_06, 7: cat_07, 8: cat_08}


def render(idx, outdir):
    img = base_canvas()
    grid(img, 40, 8, '#5B7186')
    DRAWERS[idx](img)
    # 顶部极淡高光，避免整体发闷
    hl = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([p(-300), p(-460), p(1100), p(320)], fill=(255, 255, 255, 46))
    hl = hl.filter(ImageFilter.GaussianBlur(p(90)))
    img.alpha_composite(hl)
    hud(img, LABELS[idx], PALETTES[idx][1])
    out = grain(img.convert('RGB'), 4).resize((W, H), Image.LANCZOS)
    path = os.path.join(outdir, 'l-cat-%02d.jpg' % idx)
    out.save(path, 'JPEG', quality=90, optimize=True, progressive=True)
    return path


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join('webapp', 'assets', 'covers', 'light')
    os.makedirs(outdir, exist_ok=True)
    for i in range(1, 9):
        path = render(i, outdir)
        size = os.path.getsize(path) // 1024
        print('%02d  %-20s %4d KB' % (i, LABELS[i], size))


if __name__ == '__main__':
    main()
