#!/usr/bin/env python3
"""
把参考图（未来都市霓虹）加工成网页端首页的背景 / 底图 / 插图资源。

设计取舍（2026-11-05 舍先生要求「插图也做成和底图一样风格」）：
- 原图整体偏暗偏浓，站点定调是「浅色商业科技感 / 背景不要黑色」。
- 所有输出（底图、Hero 底、Hero 大图、分类卡、服务封面、mini 插图）
  统一走同一个 soften() 配方：提亮 + 降饱和 + 降对比 + 柔化 + 叠冷白。
  只靠 alpha（冷白占比）区分层次，靠裁切区域与极轻微色调偏移区分卡片，
  不再出现「底图淡、插图浓艳写实」的割裂。
- alpha 越大越淡：底图 0.72（最淡）→ 卡片 0.60 → Hero 底 0.55 → Hero 大图 0.48（最浓但仍柔和）。

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
COLD_WHITE = (247, 248, 250)


def soften(img, alpha, color=0.70, brightness=1.28, contrast=0.92, blur=0.6):
    """底图与插图共用的唯一风格配方：浅、柔、低饱和、冷白、霓虹色斑隐约。"""
    x = ImageEnhance.Brightness(img).enhance(brightness)
    x = ImageEnhance.Color(x).enhance(color)
    x = ImageEnhance.Contrast(x).enhance(contrast)
    if blur:
        x = x.filter(ImageFilter.GaussianBlur(blur))
    white = Image.new('RGB', x.size, COLD_WHITE)
    return Image.blend(x, white, alpha)


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


# 1) 全页底图：最淡，只留都市轮廓和色斑，深色文字压得住
print('底图：')
save(soften(src, 0.72, color=0.55, brightness=1.40, contrast=0.86, blur=1.1),
     'cyber-bg.jpg', 1920, 78)

# 2) Hero 整块底：比底图略浓，透出城市结构
print('Hero 底：')
save(soften(src, 0.55, color=0.68, brightness=1.32, contrast=0.90, blur=0.8),
     'cyber-hero.jpg', 1600, 82)

# 3) Hero 右栏大图：全套里最浓的一张，但仍是冷白柔和调，不再暗沉写实
print('Hero 大图：')
save(soften(src, 0.48, color=0.78, brightness=1.26, contrast=0.94, blur=0.5),
     'l-hero.jpg', 1600, 86)

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
    c = soften(c, 0.60, color=0.72, brightness=1.28, contrast=0.92, blur=0.55)
    c = tint(c, k).resize((800, 500), Image.LANCZOS)
    save(c, f'l-cat-{i:02d}.jpg', None, 82)

# 5) 两张 mini 插图：原来是抽象线条/方块插画，与赛博都市底图完全不是一套语言，
#    现在一并换成同配方的都市裁切（当前首页只用作文字胶囊，留作备用不裂图）
print('mini 插图（替换旧抽象插画）：')
mini_spots = [(0.10, 0.18, 0.62, 0.88), (0.45, 0.30, 0.97, 1.00)]
for i, (box, k) in enumerate(zip(mini_spots, [(1.00, 1.02, 1.03), (1.03, 1.00, 1.02)]), 1):
    c = crop(box)
    c = soften(c, 0.60, color=0.72, brightness=1.28, contrast=0.92, blur=0.55)
    c = tint(c, k).resize((900, 620), Image.LANCZOS)
    save(c, f'l-mini-{i}.jpg', None, 82)

print('done ->', OUT)
