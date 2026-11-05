#!/usr/bin/env python3
"""
把参考图（未来都市霓虹）加工成网页端首页的背景 / 底图 / 插图资源。

2026-11-05 舍先生：「插图不透明度太高了，不要不透明度」。
旧配方用 Image.blend(x, 冷白, alpha=0.48~0.72) 在画面上叠了一层
高不透明度的冷白雾，又叠高斯模糊 —— 城市线条、霓虹色斑全被糊成灰白，
这就是「不透明度太高」的根因。CSS 里那几层纯白遮罩则又白上加白。

新配方（零叠罩）：
- 不再叠任何白 / 浅色不透明层，也不做高斯模糊（不发灰、不发糊）。
- 用 gamma 曲线单独抬暗部：暗处变亮、亮处不炸，层次与细节完整保留。
- 轻微青蓝冷调 + 轻微提对比：明亮通透的商业科技感，底色仍不是黑色。
- 层次区分改用 gamma / 饱和度 / 冷调强度，不再靠白色占比。

用法：
  PYTHONPATH=tools/_pylib python3 tools/make-cyber-bg.py <参考图路径>
"""
import os
import sys
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'webapp', 'assets', 'covers', 'light')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.expanduser('~'), '.workbuddy', 'clipboard-images',
    'clipboard-2026-11-05T03-30-36-138Z-ca1c6d23.jpg')

os.makedirs(OUT, exist_ok=True)
src = Image.open(SRC).convert('RGB')
W, H = src.size


def soften(img, gamma=0.70, color=1.0, contrast=1.05,
           cool=(0.97, 1.00, 1.05), blur=0):
    """底图与插图共用的唯一风格配方：亮、透、清晰、青蓝冷调，零白色叠罩。

    gamma < 1 提亮暗部且不洗白高光；cool 给 R 微降、B 微升，偏青靛科技感。
    """
    lut = [min(255, round(255 * (v / 255.0) ** gamma)) for v in range(256)]
    x = img.point(lut * 3)
    x = ImageEnhance.Color(x).enhance(color)
    x = ImageEnhance.Contrast(x).enhance(contrast)
    r, g, b = x.split()
    r = r.point(lambda v, f=cool[0]: min(255, int(v * f)))
    g = g.point(lambda v, f=cool[1]: min(255, int(v * f)))
    b = b.point(lambda v, f=cool[2]: min(255, int(v * f)))
    x = Image.merge('RGB', (r, g, b))
    if blur:
        x = x.filter(ImageFilter.GaussianBlur(blur))
    return x


def save(img, name, width=None, quality=84):
    if width and img.width != width:
        img = img.resize((width, round(width * img.height / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, 'JPEG', quality=quality, optimize=True, progressive=True)
    print(f'  {name:22s} {img.width}x{img.height}  {os.path.getsize(path) // 1024} KB')


def crop(box):
    return src.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)))


# 轻微色调偏移（幅度仅 ±4%，避免浓艳偏色破坏「同底图」的统一感）
def tint(img, k):
    r, g, b = img.split()
    r = r.point(lambda v, f=k[0]: min(255, int(v * f)))
    g = g.point(lambda v, f=k[1]: min(255, int(v * f)))
    b = b.point(lambda v, f=k[2]: min(255, int(v * f)))
    return Image.merge('RGB', (r, g, b))


# 1) 全页底图：最亮最淡（靠低饱和，不靠白雾）
print('底图：')
save(soften(src, gamma=0.58, color=0.70, contrast=0.96),
     'cyber-bg.jpg', 1920, 88)

# 2) Hero 整块底：城市结构清楚、色调柔和
print('Hero 底：')
save(soften(src, gamma=0.66, color=0.90, contrast=1.02),
     'cyber-hero.jpg', 1600, 90)

# 3) Hero 右栏大图：全套里对比最足、细节最清晰的一张
print('Hero 大图：')
save(soften(src, gamma=0.72, color=1.04, contrast=1.07),
     'l-hero.jpg', 1600, 92)

# 4) 8 张分类卡 / 服务封面：同配方、不同区域裁切，风格统一但不雷同
spots = [
    (0.02, 0.05, 0.40, 0.62), (0.30, 0.02, 0.68, 0.60),
    (0.60, 0.04, 0.98, 0.62), (0.05, 0.36, 0.43, 0.94),
    (0.34, 0.34, 0.72, 0.92), (0.62, 0.34, 1.00, 0.92),
    (0.26, 0.52, 0.74, 1.00),
    # 08 漫剧制作：中景塔楼 + 密集霓虹，偏紫粉的「剧集感」
    (0.40, 0.18, 0.88, 0.86),
]
tints = [
    (1.00, 1.02, 1.04), (0.99, 1.01, 1.04), (1.04, 0.99, 1.02),
    (1.04, 1.01, 0.98), (1.03, 0.99, 1.02), (0.98, 1.03, 1.01),
    (1.03, 1.02, 0.98), (1.04, 0.98, 1.04),
]
print('分类卡 / 服务封面（同底图风格）：')
for i, (box, k) in enumerate(zip(spots, tints), 1):
    c = crop(box)
    c = soften(c, gamma=0.70, color=1.02, contrast=1.05)
    c = tint(c, k).resize((800, 500), Image.LANCZOS)
    save(c, f'l-cat-{i:02d}.jpg', None, 90)

# 5) 两张 mini 插图：同配方的都市裁切
print('mini 插图：')
mini_spots = [(0.10, 0.18, 0.62, 0.88), (0.45, 0.30, 0.97, 1.00)]
for i, (box, k) in enumerate(zip(mini_spots, [(1.00, 1.02, 1.03), (1.03, 1.00, 1.02)]), 1):
    c = crop(box)
    c = soften(c, gamma=0.70, color=1.02, contrast=1.05)
    c = tint(c, k).resize((900, 620), Image.LANCZOS)
    save(c, f'l-mini-{i}.jpg', None, 90)

print('done ->', OUT)
