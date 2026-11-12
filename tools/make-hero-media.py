# -*- coding: utf-8 -*-
"""
首页 Hero 右侧插图：影视制作工作台主题（程序化，无外部素材）。

背景（舍先生 2026-11-12）：原 cyber-hero.jpg 是一张橙红赛博朋克 AI 图，
与全站冷白蓝调严重冲突，观感违和。本脚本生成冷蓝青调的
「剪辑监视器 + 时间轴 + 取景框」场景图，与分类封面同一设计语言。

输出：webapp/assets/covers/light/hero-stage.jpg  1600x1000（16:10，与容器比例一致）
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

random.seed(20261112)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'webapp', 'assets', 'covers', 'light')

BLUE = (79, 125, 243)
CYAN = (56, 189, 248)
DEEP = (58, 108, 214)
INK = (11, 31, 51)
WHITE = (255, 255, 255)

W, H = 1600, 1000


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def base():
    """冷白 → 浅蓝竖向渐变。"""
    stops = [(0.00, (246, 251, 255)), (0.45, (228, 242, 255)),
             (0.75, (206, 228, 254)), (1.00, (186, 214, 250))]
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (t - p0) / (p1 - p0)))
                break
    return im.convert('RGBA')


def glow_layer():
    """柔光晕：蓝青两色，模糊后叠底。"""
    s = 4
    w, h = W // s, H // s
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    for cx, cy, r, c, a in [
        (0.88, 0.18, 0.40, CYAN, 0.40),
        (0.16, 0.82, 0.38, BLUE, 0.32),
        (0.55, 0.40, 0.30, BLUE, 0.22),
    ]:
        R = max(w, h) * r
        d.ellipse([w * cx - R, h * cy - R, w * cx + R, h * cy + R], fill=c + (int(255 * a),))
    im = im.filter(ImageFilter.GaussianBlur(max(6, w // 6)))
    return im.resize((W, H), Image.BICUBIC)


def monitor(d):
    """主监视器：屏幕内放节目画面（山形测试图 + 安全框 + 录制点）。"""
    x0, y0, x1, y1 = 120, 96, 900, 560
    # 支架
    d.line([(510, 560), (510, 700)], fill=INK + (150,), width=10)
    d.line([(380, 700), (640, 700)], fill=INK + (170,), width=10)
    # 外壳
    d.rounded_rectangle([x0, y0, x1, y1], radius=18,
                        fill=WHITE + (238,), outline=DEEP + (200,), width=4)
    # 屏幕
    sx0, sy0, sx1, sy1 = x0 + 26, y0 + 26, x1 - 26, y1 - 62
    d.rounded_rectangle([sx0, sy0, sx1, sy1], radius=10,
                        fill=(222, 237, 253, 255), outline=BLUE + (120,), width=2)
    cx, cy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
    sw, sh = sx1 - sx0, sy1 - sy0
    # 屏内山形测试图
    d.polygon([(sx0 + 30, sy1 - 24), (cx - 40, cy - 30), (cx + 130, sy1 - 24)],
              fill=DEEP + (110,))
    d.polygon([(cx - 90, sy1 - 24), (cx + 40, cy + 6), (sx1 - 30, sy1 - 24)],
              fill=BLUE + (150,))
    d.ellipse([cx + 120, sy0 + 42, cx + 190, sy0 + 112], fill=CYAN + (170,))
    # 安全框角
    seg = 34
    for (ax, ay, dx, dy) in [(sx0 + 14, sy0 + 14, 1, 1), (sx1 - 14, sy0 + 14, -1, 1),
                             (sx0 + 14, sy1 - 14, 1, -1), (sx1 - 14, sy1 - 14, -1, -1)]:
        d.line([(ax, ay), (ax + dx * seg, ay)], fill=DEEP + (170,), width=3)
        d.line([(ax, ay), (ax, ay + dy * seg)], fill=DEEP + (170,), width=3)
    # REC 红点 + 状态条
    d.ellipse([sx0 + 18, sy0 + 16, sx0 + 36, sy0 + 34], fill=(226, 62, 84, 230))
    d.rounded_rectangle([sx1 - 150, sy0 + 16, sx1 - 20, sy0 + 34], radius=4,
                        fill=WHITE + (180,))
    # 屏幕下方控制条
    d.rounded_rectangle([x0 + 26, y1 - 48, x1 - 26, y1 - 20], radius=6,
                        fill=(238, 247, 255, 220), outline=BLUE + (80,), width=1)
    d.polygon([(x0 + 44, y1 - 42), (x0 + 44, y1 - 26), (x0 + 60, y1 - 34)], fill=DEEP + (220,))
    d.line([(x0 + 78, y1 - 34), (x1 - 120, y1 - 34)], fill=BLUE + (70,), width=2)
    d.line([(x0 + 78, y1 - 34), (x0 + 340, y1 - 34)], fill=CYAN + (190,), width=3)


def film_strip(d):
    """右侧竖向胶片带。"""
    x0, y0, x1, y1 = 1400, 60, 1560, 950
    d.rounded_rectangle([x0, y0, x1, y1], radius=12,
                        fill=WHITE + (215,), outline=DEEP + (150,), width=3)
    # 两侧齿孔
    for y in range(y0 + 18, y1 - 10, 34):
        d.rounded_rectangle([x0 + 10, y, x0 + 30, y + 18], radius=3, fill=BLUE + (110,))
        d.rounded_rectangle([x1 - 30, y, x1 - 10, y + 18], radius=3, fill=BLUE + (110,))
    # 片格
    for i, y in enumerate(range(y0 + 22, y1 - 90, 92)):
        f = (225, 240, 255, 235) if i % 2 else (208, 230, 252, 235)
        d.rounded_rectangle([x0 + 40, y, x1 - 40, y + 66], radius=6,
                            fill=f, outline=BLUE + (110,), width=1)
        # 格内简笔山形/波形
        d.polygon([(x0 + 50, y + 58), (x0 + 110, y + 20), (x0 + 170, y + 58)],
                  fill=DEEP + (90,))


def timeline(d):
    """底部剪辑时间轴：四条轨道 + 素材块 + 播放头。"""
    x0, y0, x1 = 120, 760, 1480
    d.rounded_rectangle([x0, y0 - 26, x1, y0 + 180], radius=14,
                        fill=WHITE + (225,), outline=DEEP + (150,), width=3)
    # 轨道
    lanes = [
        (y0 + 4, 40, [(.03, .30, DEEP), (.42, .22, CYAN), (.70, .26, BLUE)]),
        (y0 + 52, 40, [(.10, .24, BLUE), (.40, .34, DEEP), (.80, .16, CYAN)]),
        (y0 + 100, 40, [(.05, .18, CYAN), (.30, .42, BLUE), (.78, .20, DEEP)]),
        (y0 + 148, 24, None),  # 音频轨
    ]
    for ly, lh, blocks in lanes:
        d.rounded_rectangle([x0 + 16, ly, x1 - 16, ly + lh], radius=6,
                            fill=(232, 243, 255, 200))
        if blocks:
            for t0, tw, c in blocks:
                bx0 = x0 + 16 + (x1 - x0 - 32) * t0
                bw = (x1 - x0 - 32) * tw
                d.rounded_rectangle([bx0, ly + 4, bx0 + bw, ly + lh - 4], radius=4,
                                    fill=c + (185,))
        else:
            # 音频波形
            mid = ly + lh / 2
            x = x0 + 24
            while x < x1 - 24:
                bh = 6 + abs(math.sin(x * 0.055) * 14) + random.uniform(0, 5)
                d.line([(x, mid - bh), (x, mid + bh)], fill=CYAN + (170,), width=3)
                x += 7
    # 播放头
    px = x0 + 16 + (x1 - x0 - 32) * 0.52
    d.line([(px, y0 - 40), (px, y0 + 172)], fill=(233, 88, 106, 230), width=4)
    d.polygon([(px - 12, y0 - 40), (px + 12, y0 - 40), (px, y0 - 22)],
              fill=(233, 88, 106, 240))


def accents(d):
    """取景框角 + 数据点 + HUD 读数。"""
    seg = 60
    for (ax, ay, dx, dy) in [(44, 44, 1, 1), (W - 44, 44, -1, 1),
                             (44, H - 44, 1, -1), (W - 44, H - 44, -1, -1)]:
        d.line([(ax, ay), (ax + dx * seg, ay)], fill=DEEP + (150,), width=5)
        d.line([(ax, ay), (ax, ay + dy * seg)], fill=DEEP + (150,), width=5)
    # 数据点连线（右下区域）
    pts = [(1180, 300), (1290, 380), (1360, 260), (1440, 420), (1250, 470)]
    for i, (px, py) in enumerate(pts):
        r = 5 + (i % 3) * 2
        d.ellipse([px - r, py - r, px + r, py + r],
                  fill=(CYAN if i % 2 else BLUE) + (190,))
    for i in range(1, len(pts)):
        d.line([pts[i - 1], pts[i]], fill=BLUE + (90,), width=2)
    # HUD 读数
    f = None
    try:
        from PIL import ImageFont
        f = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 26)
    except Exception:
        pass
    d.text((56, H - 92), 'EDIT TIMELINE // 4K · 25FPS', fill=DEEP + (185,), font=f)
    d.text((W - 330, 60), 'REC · SCENE 04', fill=DEEP + (185,), font=f)


def main():
    im = base()
    im = Image.alpha_composite(im, glow_layer())
    sharp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(sharp, 'RGBA')
    monitor(d)
    film_strip(d)
    timeline(d)
    accents(d)
    im = Image.alpha_composite(im, sharp)
    out = os.path.join(OUT, 'hero-stage.jpg')
    im.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=3)) \
      .save(out, 'JPEG', quality=90, optimize=True, progressive=True)
    print('%s  %dx%d  %.0f KB' % (out, W, H, os.path.getsize(out) / 1024))


if __name__ == '__main__':
    main()
