#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把网页端「按内容匹配」的插画同步进微信小程序包内。

网页端 tools/make-category-covers.py 生成的 8 张分类主题插画（婚礼跟拍 /
婚礼微电影 / 品牌宣传片 / 短视频剪辑 / 商业摄影 / AE 动画 / AI 生成 /
漫剧制作）只存在于 webapp/assets/covers/light/，小程序的分类图、服务封面
却完全依赖数据库里的外链 image_url —— 测试号或未配置 downloadFile 合法域名
时一律裂图，只剩 emoji / 「MG」占位。

本脚本把同一套插画按小程序卡片比例重新输出为包内本地图：
  mp-cat-0N.jpg    640x400  分类卡（2 列，约 335x210rpx，正好 16:10）
  mp-sq-0N.jpg     400x400  服务方图（列表 / 订单 / 工作室）
  mp-banner-N.jpg  900x432  首页轮播（750x360rpx，约 2.08:1）
  mp-hero.jpg      900x560  服务详情大图

轮播图一律取自同一套冷白实色主题插画，不用 l-mini-1/2 那两张霓虹城市
照片（偏暗、与浅色商业科技感冲突）。

用法：python tools/sync-miniprogram-media.py
"""
import os

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'webapp', 'assets', 'covers', 'light')
DST = os.path.join(ROOT, 'miniprogram', 'assets', 'covers')

# (输出名, 源文件名, 目标尺寸, 裁切焦点)
JOBS = []
for i in range(1, 9):
    JOBS.append(('mp-cat-%02d.jpg' % i, 'l-cat-%02d.jpg' % i, (640, 400), (0.5, 0.5)))
    JOBS.append(('mp-sq-%02d.jpg' % i, 'l-cat-%02d.jpg' % i, (400, 400), (0.5, 0.5)))

JOBS += [
    ('mp-banner-1.jpg', 'l-hero.jpg',   (900, 432), (0.5, 0.45)),
    ('mp-banner-2.jpg', 'l-cat-04.jpg', (900, 432), (0.5, 0.50)),
    ('mp-banner-3.jpg', 'l-cat-07.jpg', (900, 432), (0.5, 0.50)),
    ('mp-banner-4.jpg', 'l-cat-08.jpg', (900, 432), (0.5, 0.50)),
    ('mp-hero.jpg',     'l-hero.jpg',   (900, 560), (0.5, 0.42)),
]


def main():
    if not os.path.isdir(SRC):
        raise SystemExit('找不到源目录：%s' % SRC)
    os.makedirs(DST, exist_ok=True)
    total = 0
    for out, src_name, size, focus in JOBS:
        src = os.path.join(SRC, src_name)
        if not os.path.exists(src):
            raise SystemExit('缺源图：%s' % src)
        im = Image.open(src).convert('RGB')
        fitted = ImageOps.fit(im, size, method=Image.LANCZOS, centering=focus)
        path = os.path.join(DST, out)
        fitted.save(path, 'JPEG', quality=84, optimize=True, progressive=True)
        kb = os.path.getsize(path) / 1024
        total += kb
        print('  %-20s %-11s %6.1f KB' % (out, '%dx%d' % size, kb))
    print('共 %d 张，合计 %.1f KB' % (len(JOBS), total))


if __name__ == '__main__':
    main()
