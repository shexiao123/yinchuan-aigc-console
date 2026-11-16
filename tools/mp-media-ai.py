# -*- coding: utf-8 -*-
"""把 AI 生成（已去水印）的插画转换成小程序包内图。
用法：python tools/mp-media-ai.py
来源：项目根目录 processed_image_*_<taskid前8位>_1.png
输出：miniprogram/assets/covers/mp-cat-0N.jpg / mp-banner-1.jpg / mp-hero.jpg
同时删除不再使用的 mp-sq-*.jpg、mp-banner-2..4.jpg。
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = ROOT
OUT = os.path.join(ROOT, "miniprogram", "assets", "covers")

# task id 前 8 位 → 输出文件（16:10 卡片用 3:2 源，aspectFill 自动裁切）
JOBS = {
    "2e8a93e6": [("mp-cat-01.jpg", (640, 427))],
    "37d4affe": [("mp-cat-02.jpg", (640, 427))],
    "7d2c7166": [("mp-cat-03.jpg", (640, 427))],
    "fd0ce838": [("mp-cat-04.jpg", (640, 427))],
    "8ab6d3cf": [("mp-cat-05.jpg", (640, 427))],
    "1f676fab": [("mp-cat-06.jpg", (640, 427))],
    "c8f16485": [("mp-cat-07.jpg", (640, 427))],
    "5f17fd28": [("mp-cat-08.jpg", (640, 427))],
    "6724dac9": [("mp-banner-1.jpg", (900, 600)), ("mp-hero.jpg", (900, 600))],
}

DELETE = (["mp-sq-%02d.jpg" % n for n in range(1, 9)]
          + ["mp-banner-%d.jpg" % n for n in (2, 3, 4)])


def find_src(prefix):
    for f in glob.glob(os.path.join(SRC, "processed_image_*%s*_1.png" % prefix)):
        return f
    return None


def main():
    total = 0
    missing = []
    for prefix, outs in JOBS.items():
        src = find_src(prefix)
        if not src:
            missing.append(prefix)
            continue
        im = Image.open(src).convert("RGB")
        for name, size in outs:
            dst = os.path.join(OUT, name)
            im.resize(size, Image.LANCZOS).save(dst, "JPEG", quality=80, optimize=True, progressive=True)
            kb = os.path.getsize(dst) / 1024
            total += kb
            print("OK", name, size, "%dKB" % kb)
    for name in DELETE:
        p = os.path.join(OUT, name)
        if os.path.exists(p):
            os.remove(p)
            print("DEL", name)
    print("TOTAL %.0fKB" % total)
    if missing:
        print("MISSING source for:", missing)
        sys.exit(1)


if __name__ == "__main__":
    main()
