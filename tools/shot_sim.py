# -*- coding: utf-8 -*-
"""按开发者工具窗口的实时矩形，自动截取模拟器手机区域。
用法：python tools/shot_sim.py <输出名> [hwnd]
原理：窗口几何每次都在变，先 GetWindowRect，再按窗口内手机区的固定比例裁剪。
"""
import ctypes
import ctypes.wintypes as wt
import os
import sys
import time

from PIL import ImageGrab

HWND = int(sys.argv[2]) if len(sys.argv) > 2 else 393704
OUT = sys.argv[1] if len(sys.argv) > 1 else "shots/sim.png"

u = ctypes.windll.user32
u.ShowWindow(HWND, 9)
u.SetForegroundWindow(HWND)
time.sleep(1.2)

rc = wt.RECT()
u.GetWindowRect(HWND, ctypes.byref(rc))
w, h = rc.right - rc.left, rc.bottom - rc.top
# 模拟器手机在窗口内的相对位置（1600x1200 实测：x 762..1012, y 47..672）
lx = rc.left + int(w * 0.4763)
rx = rc.left + int(w * 0.6325)
ty = rc.top + int(h * 0.0392)
by = rc.top + int(h * 0.5600)

os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
img = ImageGrab.grab(bbox=(lx, ty, rx, by))
img.save(OUT)
print("window", rc.left, rc.top, w, h, "-> crop", lx, ty, rx, by, img.size)
