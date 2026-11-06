# -*- coding: utf-8 -*-
"""
生成「蓝色科技 · 企业宣传片字幕背景」整幅底图（程序化，无外部素材）。

设计约束（舍先生）：
  - 浅蓝亮调，绝不黑底 / 暗沉 / 发灰发糊
  - 画面要有「面」：大面积极光带、体积光、斜切色块、透视地面，
    而不是只有细线轮廓 —— 解决「背景画面太单调」
  - 左半幅留白给标题，右半幅放视觉主体（全息数据球 / HUD 面板）
  - 输出 JPG，canvas 会在其上叠加实时动态层

输出：
  webapp/assets/covers/light/tech-stage.jpg      1920x1080 横版（电脑）
  webapp/assets/covers/light/tech-stage-m.jpg     900x1400 竖版（手机）

用法：PYTHONPATH=tools/_pylib python tools/make-tech-stage.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

random.seed(20261106)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'webapp', 'assets', 'covers', 'light')

BLUE = (79, 125, 243)
CYAN = (56, 189, 248)
VIOLET = (151, 121, 255)
DEEP = (58, 108, 214)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def font(size):
    for p in ('C:/Windows/Fonts/consola.ttf', 'C:/Windows/Fonts/arial.ttf'):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def base_gradient(W, H):
    """冷白 → 浅蓝多段渐变，底部略深做地面纵深。"""
    stops = [
        (0.00, (248, 252, 255)),
        (0.34, (230, 243, 255)),
        (0.62, (208, 229, 255)),
        (0.78, (190, 216, 252)),
        (1.00, (174, 205, 248)),
    ]
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / max(1, H - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                d.line([(0, y), (W, y)], fill=lerp(c0, c1, (t - p0) / (p1 - p0)))
                break
        else:
            d.line([(0, y), (W, y)], fill=stops[-1][1])
    return im


def soft_layer(W, H, scale=2):
    """低分辨率柔光层：极光带 / 体积光 / 大光晕，模糊后放大叠加。"""
    w, h = max(2, W // scale), max(2, H // scale)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    k = 1.0 / scale
    u = lambda v: int(v * k)

    # --- 大面积极光带：斜向正弦曲线，多条不同色 ---
    bands = [
        (CYAN, 0.42, 0.20, 0.55, 0.10, 175),
        (BLUE, 0.48, 0.44, 0.34, 0.13, 225),
        (VIOLET, 0.34, 0.66, 0.62, 0.09, 160),
        (CYAN, 0.30, 0.88, 0.24, 0.11, 140),
        (BLUE, 0.34, 0.08, 0.78, 0.08, 150),
        (VIOLET, 0.26, 0.30, 0.90, 0.07, 110),
    ]
    for color, alpha, yc, amp, freq, width in bands:
        pts = []
        for x in range(-40, w + 41, max(1, w // 48)):
            t = x / w
            y = h * (yc + amp * 0.24 * math.sin(t * math.pi * 2 * freq + 1.1)
                     + 0.06 * math.sin(t * math.pi * 5 * freq))
            pts.append((x, y))
        d.line(pts, fill=color + (int(255 * alpha),), width=max(2, u(width)), joint='curve')
        # 亮芯
        d.line(pts, fill=WHITE + (int(255 * alpha * 0.75),), width=max(1, u(width * 0.13)), joint='curve')

    # --- 右上体积光：从画外光源射出的楔形光束 ---
    sx, sy = w * 1.02, -h * 0.18
    for i, (tx, spread, a) in enumerate([(0.30, 0.20, 0.16), (0.58, 0.15, 0.12), (0.82, 0.11, 0.10)]):
        poly = [(sx, sy), (w * tx, h * 1.08), (w * (tx + spread), h * 1.08)]
        d.polygon(poly, fill=WHITE + (int(255 * a),))

    # --- 大光晕：右上青蓝 + 中部紫 + 左下青 ---
    glows = [
        (0.84, 0.22, 0.46, CYAN, 0.46),
        (0.62, 0.10, 0.38, BLUE, 0.34),
        (0.96, 0.78, 0.42, VIOLET, 0.34),
        (0.18, 0.92, 0.40, CYAN, 0.28),
        (0.44, 0.52, 0.30, VIOLET, 0.22),
        (0.30, 0.24, 0.34, CYAN, 0.20),
    ]
    for cx, cy, r, color, a in glows:
        R = max(w, h) * r
        d.ellipse([w * cx - R, h * cy - R, w * cx + R, h * cy + R],
                  fill=color + (int(255 * a),))

    im = im.filter(ImageFilter.GaussianBlur(radius=max(5, 30 * k)))
    return im.resize((W, H), Image.BICUBIC)


def draw_beam_ridge(D, W, H):
    """斜切色块：给画面加版式块面，带亮边。"""
    blocks = [
        ([(0.66, 0.00), (1.02, 0.00), (0.86, 0.42), (0.50, 0.42)], BLUE, 0.20),
        ([(0.00, 0.72), (0.30, 0.72), (0.16, 1.02), (0.00, 1.02)], VIOLET, 0.15),
        ([(0.88, 0.56), (1.02, 0.56), (1.02, 0.92), (0.74, 0.92)], CYAN, 0.17),
        ([(0.00, 0.00), (0.34, 0.00), (0.20, 0.16), (0.00, 0.16)], CYAN, 0.10),
        ([(0.38, 0.86), (0.72, 0.86), (0.62, 1.02), (0.28, 1.02)], BLUE, 0.12),
    ]
    for poly, color, a in blocks:
        pts = [(W * x, H * y) for x, y in poly]
        D.polygon(pts, fill=color + (int(255 * a),))
        D.line(pts + [pts[0]], fill=color + (110,), width=2)


def draw_trails(D, W, H, portrait):
    """斜向平行光轨：企业宣传片里最出效果的速度感线条。"""
    for i in range(22):
        off = i * (W * 0.075) - W * 0.55
        x0 = off + H * 0.72
        y0 = 0
        x1 = off
        y1 = H * 0.72
        a = int(255 * (0.05 + 0.13 * (1 - abs(i - 11) / 11)))
        col = CYAN if i % 5 == 0 else (VIOLET if i % 7 == 0 else BLUE)
        D.line([(x0, y0), (x1, y1)], fill=col + (a,), width=1 if i % 3 else 2)
    # 几根带亮芯的主光轨
    for i in (3, 9, 16):
        off = i * (W * 0.075) - W * 0.55
        D.line([(off + H * 0.72, 0), (off, H * 0.72)], fill=WHITE + (105,), width=2)


def draw_bottom_band(D, W, H):
    """底部中蓝数据带：给画面一块明确的「重量」，不黑但压得住。"""
    y0 = H * 0.885
    for y in range(int(y0), H):
        t = (y - y0) / (H - y0)
        D.line([(0, y), (W, y)], fill=DEEP + (int(255 * 0.14 * t),))
    D.line([(0, y0), (W, y0)], fill=CYAN + (105,), width=1)


def draw_floor(D, W, H, portrait):
    """地平线以下的透视网格地面 + 地平线亮带，制造空间纵深。"""
    hz = H * (0.70 if portrait else 0.66)
    vx = W * (0.52 if portrait else 0.70)
    # 放射线
    n = 30
    for i in range(n + 1):
        x = -W * 0.5 + (W * 2.0) * i / n
        a = int(255 * (0.10 + 0.13 * abs(i - n / 2) / (n / 2)))
        D.line([(vx, hz), (x, H + 10)], fill=BLUE + (a,), width=1)
    # 横线（近处更密更亮）
    for k in range(1, 22):
        p = k / 22
        y = hz + (p ** 2.15) * (H - hz + 20)
        if y > H + 2:
            continue
        D.line([(0, y), (W, y)], fill=BLUE + (int(255 * (0.07 + p * 0.24)),), width=1)
    # 地平线亮带
    for i in range(26):
        a = int(255 * 0.16 * (1 - i / 26))
        D.line([(0, hz - i), (W, hz - i)], fill=CYAN + (a,), width=1)
    D.line([(0, hz), (W, hz)], fill=CYAN + (135,), width=2)


def draw_globe(D, W, H, portrait):
    """视觉主体：全息数据球（经纬线 + 节点 + 轨道环 + 刻度）。"""
    R = min(W, H) * (0.30 if portrait else 0.255)
    cx, cy = (W * 0.56, H * 0.30) if portrait else (W * 0.81, H * 0.36)

    # 球面底色：明显的浅蓝实体，再逐层提亮中心，做出体积感
    D.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(150, 189, 250, 95))
    for i in range(1, 9):
        sr = R * (1 - i * 0.10)
        D.ellipse([cx - sr, cy - sr, cx + sr, cy + sr], fill=(226, 240, 255, 26))
    # 经线：不同宽度的同心椭圆模拟球面经圈
    for i in range(1, 9):
        k = i / 9
        rx = R * math.cos(k * math.pi / 2)
        D.ellipse([cx - rx, cy - R, cx + rx, cy + R],
                  outline=BLUE + (int(255 * (0.10 + 0.13 * (1 - k))),), width=1)
    # 纬线
    for i in range(1, 8):
        k = i / 8
        ry = R * math.sin(k * math.pi / 2)
        rx = R
        D.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=CYAN + (58,), width=1)
    # 主轮廓
    D.ellipse([cx - R, cy - R, cx + R, cy + R], outline=BLUE + (150,), width=2)
    # 外刻度环
    for i in range(72):
        a = i / 72 * math.pi * 2
        major = i % 6 == 0
        r0 = R * 1.10
        r1 = R * (1.16 if major else 1.13)
        D.line([(cx + math.cos(a) * r0, cy + math.sin(a) * r0),
                (cx + math.cos(a) * r1, cy + math.sin(a) * r1)],
               fill=BLUE + (125 if major else 60,), width=2 if major else 1)
    # 球面数据节点（前半球投影）+ 短连线
    nodes = []
    for _ in range(64):
        th = random.uniform(0, math.pi * 2)
        ph = random.uniform(-math.pi / 2, math.pi / 2)
        px = cx + R * math.cos(ph) * math.cos(th)
        py = cy + R * math.sin(ph)
        z = math.cos(ph) * math.sin(th)
        if z < 0.12:
            continue
        nodes.append((px, py, z))
    for i, (px, py, z) in enumerate(nodes):
        c = CYAN if i % 5 == 0 else (VIOLET if i % 7 == 0 else WHITE)
        r = 1.6 + z * 1.8
        D.ellipse([px - r, py - r, px + r, py + r], fill=c + (int(140 + z * 105),))
        if i > 0 and i % 3 == 0:
            qx, qy, _ = nodes[i - 1]
            if (px - qx) ** 2 + (py - qy) ** 2 < (R * 0.42) ** 2:
                D.line([(px, py), (qx, qy)], fill=CYAN + (60,), width=1)
    # 中心光核
    for i in range(5, 0, -1):
        r = R * 0.10 * i
        D.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CYAN + (16,))
    D.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=WHITE + (220,))


def draw_panels(D, W, H, portrait):
    """HUD 数据面板：实色浅蓝底 + 边框 + 迷你图表，填补空白增加信息密度。"""
    f_s = max(10, int(min(W, H) * 0.013))
    f_t = font(f_s)
    f_n = font(max(12, int(min(W, H) * 0.020)))
    specs = [
        (0.055, 0.79, 0.205, 0.145, 'NODE / 01', 0.72),
        (0.285, 0.83, 0.170, 0.115, 'FLOW / 02', 0.46),
    ] if not portrait else [
        (0.07, 0.60, 0.38, 0.105, 'NODE / 01', 0.72),
        (0.55, 0.665, 0.34, 0.090, 'FLOW / 02', 0.46),
        (0.07, 0.745, 0.32, 0.085, 'SYNC / 03', 0.61),
    ]
    for x, y, pw, ph, label, val in specs:
        x0, y0, x1, y1 = W * x, H * y, W * (x + pw), H * (y + ph)
        D.rounded_rectangle([x0, y0, x1, y1], radius=8,
                            fill=(238, 247, 255, 170), outline=BLUE + (78,), width=1)
        # 角标
        D.line([(x0 + 8, y0 + 8), (x0 + 24, y0 + 8)], fill=CYAN + (150,), width=2)
        D.line([(x0 + 8, y0 + 8), (x0 + 8, y0 + 22)], fill=CYAN + (150,), width=2)
        D.text((x1 - 8 - D.textlength(label, font=f_t), y0 + 7), label,
               font=f_t, fill=DEEP + (170,))
        # 迷你柱状图
        bw = max(2, int((x1 - x0 - 24) / 18))
        for i in range(16):
            v = 0.22 + 0.72 * abs(math.sin(i * 0.83 + val * 9))
            bh = (y1 - y0) * 0.36 * v
            col = CYAN if i % 4 == 0 else BLUE
            D.rectangle([x0 + 12 + i * (bw + 2), y1 - 11 - bh,
                         x0 + 12 + i * (bw + 2) + bw, y1 - 11],
                        fill=col + (135,))
        # 进度条
        D.rounded_rectangle([x0 + 12, y0 + 26, x1 - 12, y0 + 31], radius=2,
                            fill=BLUE + (38,))
        D.rounded_rectangle([x0 + 12, y0 + 26, x0 + 12 + (x1 - x0 - 24) * val, y0 + 31],
                            radius=2, fill=CYAN + (175,))
        D.text((x0 + 12, y1 - 30), ('%0.1f' % (val * 100)) + '%', font=f_n,
               fill=DEEP + (205,))


def draw_marks(D, W, H, portrait):
    """刻度尺、十字准星、坐标点阵、细纹理。"""
    # 右上刻度尺
    y0 = H * 0.055
    for i in range(15):
        x = W - 22 - i * max(6, W * 0.006)
        ln = 14 if i % 3 == 0 else 6
        D.line([(x, y0), (x, y0 + ln)], fill=BLUE + (95,), width=1)
    D.line([(W - 22 - 15 * max(6, W * 0.006), y0), (W - 22, y0)], fill=BLUE + (110,), width=1)
    # 左下竖向刻度
    x0 = W * 0.022
    for i in range(12):
        y = H * 0.90 - i * max(6, H * 0.011)
        ln = 12 if i % 3 == 0 else 5
        D.line([(x0, y), (x0 + ln, y)], fill=CYAN + (95,), width=1)
    # 十字准星
    for cx, cy in [(W * 0.47, H * 0.13), (W * 0.93, H * 0.52), (W * 0.34, H * 0.60)]:
        D.line([(cx - 9, cy), (cx + 9, cy)], fill=BLUE + (85,), width=1)
        D.line([(cx, cy - 9), (cx, cy + 9)], fill=BLUE + (85,), width=1)
        D.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], outline=BLUE + (90,), width=1)
    # 细密点阵（右下区域）
    step = max(16, int(min(W, H) * 0.026))
    for gx in range(int(W * 0.55), W, step):
        for gy in range(int(H * 0.76), H, step):
            D.ellipse([gx, gy, gx + 1.5, gy + 1.5], fill=BLUE + (52,))


def draw_stars(D, W, H, portrait):
    """发光星点：大部分细点，少量带光晕的亮点。"""
    n = 190 if not portrait else 150
    for i in range(n):
        x = random.uniform(0, W)
        y = random.uniform(0, H)
        c = WHITE if i % 6 else (CYAN if i % 3 else BLUE)
        r = random.uniform(0.8, 2.4)
        a = random.randint(70, 200)
        if i % 13 == 0:
            R = r * 5
            D.ellipse([x - R, y - R, x + R, y + R], fill=c + (26,))
        D.ellipse([x - r, y - r, x + r, y + r], fill=c + (a,))


def left_veil(W, H, portrait):
    """文字区做像素级柔化提亮，保证深色标题清晰（不是 CSS 半透明层）。
    横版只提亮左侧竖带；竖版标题在上，改为提亮顶部横带。"""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    if portrait:
        end = H * 0.40
        for y in range(int(end)):
            t = y / end
            a = int(255 * 0.52 * (1 - t) ** 1.6)
            d.line([(0, y), (W, y)], fill=WHITE + (a,))
    else:
        end = W * 0.42
        for x in range(int(end)):
            t = x / end
            a = int(255 * 0.40 * (1 - t) ** 1.7)
            d.line([(x, 0), (x, H)], fill=WHITE + (a,))
    return im


def build(W, H, portrait, outfile):
    base = base_gradient(W, H).convert('RGBA')
    base = Image.alpha_composite(base, soft_layer(W, H, scale=2))

    sharp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    D = ImageDraw.Draw(sharp, 'RGBA')
    draw_beam_ridge(D, W, H)
    draw_trails(D, W, H, portrait)
    draw_floor(D, W, H, portrait)
    draw_globe(D, W, H, portrait)
    draw_marks(D, W, H, portrait)
    draw_stars(D, W, H, portrait)
    draw_panels(D, W, H, portrait)
    draw_bottom_band(D, W, H)
    base = Image.alpha_composite(base, sharp)
    base = Image.alpha_composite(base, left_veil(W, H, portrait))

    im = base.convert('RGB')
    im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=65, threshold=3))
    os.makedirs(OUT, exist_ok=True)
    im.save(outfile, 'JPEG', quality=90, optimize=True, progressive=True)
    print('%s  %dx%d  %.0f KB' % (outfile, W, H, os.path.getsize(outfile) / 1024))


def build_page(src, outfile):
    """整页底纹：把主画面大幅提亮降对比，只留淡淡的光带与网格，不抢内容卡片。"""
    from PIL import ImageEnhance
    im = Image.open(src).convert('RGB')
    im = ImageEnhance.Color(im).enhance(0.74)
    im = ImageEnhance.Contrast(im).enhance(0.72)
    im = Image.blend(im, Image.new('RGB', im.size, (249, 252, 255)), 0.44)
    im.save(outfile, 'JPEG', quality=82, optimize=True, progressive=True)
    print('%s  page  %.0f KB' % (outfile, os.path.getsize(outfile) / 1024))


if __name__ == '__main__':
    wide = os.path.join(OUT, 'tech-stage.jpg')
    build(1920, 1080, False, wide)
    # Hero 是约 3:1 的超宽容器；所有元素按 H 比例定位，换尺寸即可自适应，不会被 cover 裁掉主体
    build(1920, 620, False, os.path.join(OUT, 'tech-stage-wide.jpg'))
    build(900, 1400, True, os.path.join(OUT, 'tech-stage-m.jpg'))
    build_page(wide, os.path.join(OUT, 'tech-stage-page.jpg'))
