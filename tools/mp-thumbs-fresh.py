# -*- coding: utf-8 -*-
"""清新版插画 → 方形缩略图（自动定位主体，避免留白被裁掉后只剩底色）
用法：python tools/mp-thumbs-fresh.py
来源：assets/ai-covers-fresh/noWM（若为空则用 assets/ai-covers-warm/noWM 里那批）
输出：miniprogram/assets/covers/mp-cat-01..08.jpg（480x480，奶油底补边）
"""
import glob
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "miniprogram", "assets", "covers")
SRC_DIRS = [
    os.path.join(ROOT, "assets", "ai-covers-fresh", "noWM"),
    os.path.join(ROOT, "assets", "ai-covers-warm", "noWM"),
]
BG = (253, 248, 242)  # 与插画底色一致的奶油白

MAP = [
    ("52284ca4", "mp-cat-01.jpg"),  # 婚礼跟拍
    ("4dbcda01", "mp-cat-02.jpg"),  # 婚礼微电影
    ("33412eef", "mp-cat-03.jpg"),  # 品牌宣传片
    ("39a1ae74", "mp-cat-04.jpg"),  # 短视频剪辑
    ("70a4a3cb", "mp-cat-05.jpg"),  # 商业摄影
    ("c821c9f6", "mp-cat-06.jpg"),  # AE 动画
    ("7e17db1a", "mp-cat-07.jpg"),  # AI 生成
    ("c83eac5f", "mp-cat-08.jpg"),  # 漫剧制作
]


def find(pid):
    for d in SRC_DIRS:
        g = glob.glob(os.path.join(d, "*%s*" % pid))
        if g:
            return g[0]
    return None


def content_box(im, thresh=30):
    """按与四角底色的色差找出主体外接矩形（缩到 300 宽检测；阈值 30 能滤掉背景渐变）"""
    small = im.convert("RGB").resize((300, int(300 * im.size[1] / im.size[0])), Image.BILINEAR)
    a = np.asarray(small).astype(np.int16)
    corner = np.mean([
        a[0:6, 0:6].reshape(-1, 3).mean(axis=0),
        a[-6:, -6:].reshape(-1, 3).mean(axis=0),
    ], axis=0)
    diff = np.abs(a - corner).max(axis=2)
    mask = diff > thresh
    if mask.sum() < 200:  # 几乎全是底色，退回整幅
        return (0, 0) + im.size
    ys, xs = np.where(mask)
    sx = im.size[0] / small.size[0]
    sy = im.size[1] / small.size[1]
    pad = 0.06 * max(xs.max() - xs.min(), ys.max() - ys.min())
    x0 = max(0, int((xs.min() - pad) * sx))
    y0 = max(0, int((ys.min() - pad) * sy))
    x1 = min(im.size[0], int((xs.max() + pad) * sx))
    y1 = min(im.size[1], int((ys.max() + pad) * sy))
    return x0, y0, x1, y1


def square(im, box, size=480, air=1.14):
    """在画面内取正方形（不补边，避免和原图渐变出现色带），中心对齐主体"""
    W, H = im.size
    x0, y0, x1, y1 = box
    side = int(max(x1 - x0, y1 - y0) * air)
    side = min(side, W, H)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = int(round(cx - side / 2))
    top = int(round(cy - side / 2))
    left = max(0, min(left, W - side))
    top = max(0, min(top, H - side))
    return im.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)


def main():
    ok, missing = 0, []
    for pid, name in MAP:
        src = find(pid)
        if not src:
            missing.append(name)
            continue
        im = Image.open(src).convert("RGB")
        box = content_box(im)
        square(im, box).save(os.path.join(OUT, name), "JPEG", quality=84, optimize=True, progressive=True)
        kb = os.path.getsize(os.path.join(OUT, name)) / 1024
        print("OK %-14s <- %s  box=%s  %dKB" % (name, pid, box, kb))
        ok += 1
    print("完成 %d 张" % ok)
    if missing:
        print("缺失:", missing)


if __name__ == "__main__":
    main()
