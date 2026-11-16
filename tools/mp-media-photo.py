# -*- coding: utf-8 -*-
"""真实摄影版插图 → 小程序包内图（照片已是满幅方图，不需要裁主体）
用法：python tools/mp-media-photo.py
来源：assets/ai-covers-photo/noWM（去水印结果）
输出：miniprogram/assets/covers/mp-cat-01..08.jpg（480x480）+ mp-banner-1/hero（900x600）
"""
import glob
import os
import shutil

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "miniprogram", "assets", "covers")
SRC = os.path.join(ROOT, "assets", "ai-covers-photo", "noWM")

MAP = [
    ("2fff6a3f", "mp-cat-01.jpg", (480, 480)),  # 婚礼跟拍
    ("d8d23d7f", "mp-cat-02.jpg", (480, 480)),  # 婚礼微电影
    ("2820392c", "mp-cat-03.jpg", (480, 480)),  # 品牌宣传片
    ("4f74943a", "mp-cat-04.jpg", (480, 480)),  # 短视频剪辑
    ("7507cf1b", "mp-cat-05.jpg", (480, 480)),  # 商业摄影
    ("72b0f6dc", "mp-cat-06.jpg", (480, 480)),  # AE 动画
    ("76bb921c", "mp-cat-07.jpg", (480, 480)),  # AI 生成
    ("e40d6be0", "mp-cat-08.jpg", (480, 480)),  # 漫剧制作
    ("2212fd08", "mp-banner-1.jpg", (900, 600)),  # 工作台宽幅
    ("2212fd08", "mp-hero.jpg", (900, 600)),
]


def find(pid):
    g = glob.glob(os.path.join(SRC, "*%s*" % pid))
    return g[0] if g else None


def main():
    total, missing, used = 0.0, [], set()
    for pid, name, size in MAP:
        src = find(pid)
        if not src:
            missing.append(name)
            continue
        used.add(src)
        img = Image.open(src).convert("RGB")
        # 目标比例与照片比例不同时做居中裁切，避免拉伸变形
        tw, th = size
        ratio = tw / th
        w, h = img.size
        if abs(w / h - ratio) > 0.01:
            if w / h > ratio:
                nw = int(h * ratio)
                img = img.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
            else:
                nh = int(w / ratio)
                img = img.crop((0, (h - nh) // 2, w, (h + nh) // 2))
        img.resize(size, Image.LANCZOS).save(
            os.path.join(OUT, name), "JPEG", quality=84, optimize=True, progressive=True
        )
        kb = os.path.getsize(os.path.join(OUT, name)) / 1024
        total += kb
        print("OK %-15s <- %s  %dKB" % (name, pid, kb))
    print("TOTAL %.0fKB" % total)
    if missing:
        print("MISSING", missing)


if __name__ == "__main__":
    main()
