# -*- coding: utf-8 -*-
"""把清新暖色版 AI 插画（已去水印）压成小程序包内图。
用法：python tools/mp-media-fresh.py
来源：项目根目录 processed_image_*_1.png（由 tools/erase-watermarks.py 产出，源图在 assets/ai-covers-fresh）
输出：miniprogram/assets/covers/mp-cat-0N.jpg / mp-banner-1.jpg / mp-hero.jpg
按原文件名里的主题关键词匹配，不依赖 task id。
"""
import glob
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "miniprogram", "assets", "covers")
ARCHIVE = os.path.join(ROOT, "assets", "ai-covers-fresh", "noWM")

# 擦除任务 id 前缀 → 输出文件（暖色版这批的实际映射，见 erase-watermarks 的 DONE 输出）
JOBS = [
    ("5ca7546a", "mp-cat-02.jpg"),  # 婚礼微电影
    ("ac771c1f", "mp-cat-01.jpg"),  # 婚礼跟拍
    ("e3fdbeb1", "mp-cat-03.jpg"),  # 品牌宣传片
    ("0e4b7eb9", "mp-cat-04.jpg"),  # 短视频剪辑
    ("79f29872", "mp-cat-05.jpg"),  # 商业摄影
    ("99acf74f", "mp-cat-06.jpg"),  # AE 动效动画
    ("bc285667", "mp-cat-07.jpg"),  # AI 生成
    ("a0d25204", "mp-cat-08.jpg"),  # 漫剧制作
]
WIDE = ("7df5c5ef", [("mp-banner-1.jpg", (900, 600)), ("mp-hero.jpg", (900, 600))])


def find(keyword):
    for f in glob.glob(os.path.join(ROOT, "processed_image_*.png")):
        if keyword in os.path.basename(f):
            return f
    return None


def encode(src, name, size):
    dst = os.path.join(OUT, name)
    Image.open(src).convert("RGB").resize(size, Image.LANCZOS).save(
        dst, "JPEG", quality=80, optimize=True, progressive=True
    )
    return os.path.getsize(dst) / 1024


def main():
    os.makedirs(ARCHIVE, exist_ok=True)
    total, missing, used = 0.0, [], []
    for kw, name in JOBS:
        src = find(kw)
        if not src:
            missing.append(kw)
            continue
        kb = encode(src, name, (640, 427))
        total += kb
        used.append(src)
        print("OK %-14s %-16s %dKB" % (name, kw, kb))

    src = find(WIDE[0])
    if src:
        used.append(src)
        for name, size in WIDE[1]:
            kb = encode(src, name, size)
            total += kb
            print("OK %-14s %-16s %dKB" % (name, WIDE[0], kb))
    else:
        missing.append(WIDE[0])

    for src in used:
        shutil.move(src, os.path.join(ARCHIVE, os.path.basename(src)))
    print("ARCHIVED %d 张到 assets/ai-covers-fresh/noWM/" % len(used))
    print("TOTAL %.0fKB" % total)
    if missing:
        print("MISSING:", missing)
        sys.exit(1)


if __name__ == "__main__":
    main()
