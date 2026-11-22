#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 webapp/assets/tech.css 的「冷蓝科技」色板整体换成「暖铜纸感」品牌色板。

唯一真源：本脚本 + tech.css。以后想微调暖色，改下面的 EXACT / 参数后重跑即可。
幂等：转换后暖色 r > b，不会被再次识别为冷色，重复执行结果不变。

用法：python tools/branding/warm-theme.py [--check]
"""
import colorsys
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSS = ROOT / 'webapp' / 'assets' / 'tech.css'

# 关键品牌色精确落位（其余冷色按 HSL 自动转暖）
EXACT = {
    '#0EA5E9': '#B5793D',  # 主色：天蓝 → 铜金
    '#0284C7': '#8E5527',
    '#0369A1': '#7A4A28',
    '#0E7490': '#8A6236',
    '#4F7DF3': '#C4874A',  # 渐变中段
    '#7C5CF0': '#A85A2D',  # 渐变尾段
    '#2B4BC4': '#9A5A2E',
    '#1E3A8A': '#5A3A22',
    '#6D28D9': '#8A4E2C',
    '#0B1F33': '#2A2018',  # 深色文字 → 墨棕
    '#0F172A': '#2C2622',
    '#475569': '#6B6058',
    '#94A3B8': '#9A8E85',
    '#233B5D': '#3A2A1C',
    '#F7F8FA': '#FAF5EC',  # 页面底 → 米纸
    '#EBEEF3': '#EADDC8',
    '#A8D6F6': '#D9B98A',
    '#E7F6FD': '#F6EAD9',
    '#F7FBFF': '#FBF6EC',
    '#F2F7FD': '#FBF3E6',
    '#D8EAFF': '#EFE0C8',
    '#E8F1FC': '#F3E7D5',
    '#EEF2F7': '#F5EDE1',
    '#DB2777': '#B5707A',  # 语义色保留但调暖
    '#FF4D6D': '#C56A72',
    '#DC2626': '#C0564A',
    '#22B8A6': '#8A9A6C',
    '#059669': '#6E7F5C',
    '#D97706': '#B5793D',
}


def cool(r, g, b):
    """冷色判定：蓝分量明显高于红分量（覆盖蓝/紫/青/蓝灰）。暖色 r >= b。"""
    return b > r + 5


def warm(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    # 色相随原冷色相轻微变化：青偏红铜、紫偏金黄
    th = 0.065 + max(-0.01, min(0.05, (h - 0.52) * 0.12))
    if s > 0.55:
        ts = 0.52
    elif s > 0.25:
        ts = 0.38
    else:
        ts = 0.26
    tl = max(0.085, min(0.975, l))
    rr, gg, bb = colorsys.hls_to_rgb(th, tl, ts)
    return (round(rr * 255), round(gg * 255), round(bb * 255))


def hex_of(t):
    return '#%02X%02X%02X' % t


def conv_hex(m):
    raw = m.group(0)
    if len(raw) == 4:  # #abc
        r, g, b = (int(c * 2, 16) for c in raw[1:])
    else:
        r, g, b = (int(raw[i:i + 2], 16) for i in (1, 3, 5))
    key = raw.upper()
    if key in EXACT:
        return EXACT[key]
    if not cool(r, g, b):
        return raw
    return hex_of(warm(r, g, b))


RGBA = re.compile(r'rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([^)]+)\)')


def conv_rgba(m):
    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    a = m.group(4).strip()
    if not cool(r, g, b):
        return m.group(0)
    nr, ng, nb = warm(r, g, b)
    return 'rgba(%d,%d,%d,%s)' % (nr, ng, nb, a)


def main():
    src = CSS.read_text(encoding='utf-8')
    out = RGBA.sub(conv_rgba, re.sub(r'#[0-9A-Fa-f]{3}\b|#[0-9A-Fa-f]{6}\b', conv_hex, src))
    changed_hex = len(re.findall(r'#[0-9A-Fa-f]{6}\b', src)) - len(
        [1 for a, b in zip(re.findall(r'#[0-9A-Fa-f]{6}\b', src),
                           re.findall(r'#[0-9A-Fa-f]{6}\b', out)) if a.upper() == b.upper()]
    )
    print('冷色 hex 转换：%d 处；rgba 转换：%d 处；文件 %d → %d 字符' % (
        changed_hex,
        sum(1 for a, b in zip(RGBA.findall(src), RGBA.findall(out)) if a != b),
        len(src), len(out)))
    if '--check' in sys.argv:
        return 0 if out == src else 1
    if out != src:
        CSS.write_text(out, encoding='utf-8')
        print('✓ 已写入 ' + str(CSS))
    else:
        print('✓ 已是暖色主题，无需改动（幂等）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
