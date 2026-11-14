"""Windows 桌面控制助手（仅用 Python 标准库 ctypes + Pillow）。
用于把微信小程序项目导入微信开发者工具：置前窗口、鼠标点击、键盘输入、剪贴板粘贴、截屏。
用法: python tools/gui_ctl.py <command> [args...]
  windows                       列出可见窗口标题与坐标
  shot <path> [x1 y1 x2 y2]     截屏（可裁剪）
  focus <hwnd>                  把窗口置前
  click <x> <y>                 左键单击
  dblclick <x> <y>              左键双击
  paste <text>                  设置剪贴板并 Ctrl+V
  type <text>                   用 SendInput Unicode 逐字输入
  key <KEY>                     按键（ENTER/TAB/ESC/CTRL_A/CTRL_B/F5/...）
  sleep <seconds>
"""
import ctypes
import sys
import time
from ctypes import wintypes

u = ctypes.windll.user32
k = ctypes.windll.kernel32
u.SetProcessDPIAware()

# ---------- 结构体 ----------
PUL = ctypes.POINTER(ctypes.c_ulong)


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", ctypes.c_long), ("dy", ctypes.c_long),
                ("mouseData", ctypes.c_ulong), ("dwFlags", ctypes.c_ulong),
                ("time", ctypes.c_ulong), ("dwExtraInfo", PUL)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", ctypes.c_ushort), ("wScan", ctypes.c_ushort),
                ("dwFlags", ctypes.c_ulong), ("time", ctypes.c_ulong),
                ("dwExtraInfo", PUL)]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", ctypes.c_ulong), ("wParamL", ctypes.c_ushort),
                ("wParamH", ctypes.c_ushort)]


class _IU(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", ctypes.c_ulong), ("u", _IU)]


u.SendInput.argtypes = [ctypes.c_uint, ctypes.POINTER(INPUT), ctypes.c_int]
u.SendInput.restype = ctypes.c_uint
k.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
k.GlobalAlloc.restype = ctypes.c_void_p
k.GlobalLock.argtypes = [ctypes.c_void_p]
k.GlobalLock.restype = ctypes.c_void_p
k.GlobalUnlock.argtypes = [ctypes.c_void_p]
u.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
u.SetClipboardData.restype = ctypes.c_void_p

INPUT_MOUSE, INPUT_KEYBOARD = 0, 1
KEYEVENTF_UNICODE, KEYEVENTF_KEYUP = 0x0004, 0x0002
MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP = 0x0002, 0x0004


def send(inp):
    arr = (INPUT * 1)(inp)
    u.SendInput(1, arr, ctypes.sizeof(INPUT))


def key_down(vk):
    send(INPUT(type=INPUT_KEYBOARD, u=_IU(ki=KEYBDINPUT(vk, 0, 0, 0, None))))


def key_up(vk):
    send(INPUT(type=INPUT_KEYBOARD, u=_IU(ki=KEYBDINPUT(vk, 0, KEYEVENTF_KEYUP, 0, None))))


def unicode_char(ch):
    down = INPUT(type=INPUT_KEYBOARD,
                 u=_IU(ki=KEYBDINPUT(0, ord(ch), KEYEVENTF_UNICODE, 0, None)))
    up = INPUT(type=INPUT_KEYBOARD,
               u=_IU(ki=KEYBDINPUT(0, ord(ch), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, None)))
    send(down)
    send(up)


class RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


def windows():
    rows = []
    proc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

    def cb(hwnd, lp):
        if u.IsWindowVisible(hwnd):
            n = u.GetWindowTextLengthW(hwnd)
            if n:
                b = ctypes.create_unicode_buffer(n + 1)
                u.GetWindowTextW(hwnd, b, n + 1)
                t = b.value.strip()
                if t:
                    r = RECT()
                    u.GetWindowRect(hwnd, ctypes.byref(r))
                    rows.append((hwnd, t, (r.left, r.top, r.right, r.bottom)))
        return True

    u.EnumWindows(proc(cb), 0)
    for h, t, r in rows:
        print(f"{h:>8}  {r}  {t[:70]}")
    return rows


def shot(path, box=None):
    from PIL import ImageGrab
    im = ImageGrab.grab()
    if box:
        im = im.crop(tuple(int(v) for v in box))
    im.save(path)
    print("shot:", path, im.size)


def focus(hwnd):
    hwnd = int(hwnd)
    u.ShowWindow(hwnd, 9)  # SW_RESTORE
    # ALT 按键技巧：解除 Windows 的前台窗口切换限制
    key_down(0x12)
    key_up(0x12)
    u.SwitchToThisWindow(hwnd, True)
    u.BringWindowToTop(hwnd)
    u.SetForegroundWindow(hwnd)
    time.sleep(0.5)
    fg = u.GetForegroundWindow()
    if fg != hwnd:
        # 兜底：临时置顶再撤销，确保点击落在目标窗口上
        u.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002)  # HWND_TOPMOST
        time.sleep(0.3)
        u.SetWindowPos(hwnd, -2, 0, 0, 0, 0, 0x0001 | 0x0002)  # HWND_NOTOPMOST
        u.SetForegroundWindow(hwnd)
        time.sleep(0.3)
        fg = u.GetForegroundWindow()
    print("focus:", hwnd, "-> foreground =", fg)


def click(x, y, times=1):
    x, y = int(x), int(y)
    u.SetCursorPos(x, y)
    time.sleep(0.12)
    for _ in range(times):
        send(INPUT(type=INPUT_MOUSE,
                   u=_IU(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTDOWN, 0, None))))
        send(INPUT(type=INPUT_MOUSE,
                   u=_IU(mi=MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTUP, 0, None))))
        time.sleep(0.08)
    print("click:", x, y, "x", times)


def set_clipboard(text):
    data = text.encode("utf-16-le") + b"\x00\x00"
    GMEM_MOVEABLE = 0x0002
    u.OpenClipboard(0)
    u.EmptyClipboard()
    h = k.GlobalAlloc(GMEM_MOVEABLE, len(data))
    p = k.GlobalLock(h)
    ctypes.memmove(p, data, len(data))
    k.GlobalUnlock(h)
    u.SetClipboardData(13, h)  # CF_UNICODETEXT
    u.CloseClipboard()
    return h


VK = {
    "ENTER": 0x0D, "TAB": 0x09, "ESC": 0x1B, "BACKSPACE": 0x08,
    "CTRL": 0x11, "SHIFT": 0x10, "ALT": 0x12, "DELETE": 0x2E,
    "F5": 0x74, "HOME": 0x24, "END": 0x23, "UP": 0x26, "DOWN": 0x28,
    "LEFT": 0x25, "RIGHT": 0x27, "A": 0x41, "B": 0x42, "V": 0x56,
    "C": 0x43, "S": 0x53, "R": 0x52,
}


def key(name):
    name = name.upper()
    if name.startswith("CTRL_"):
        base = VK[name[5:]]
        key_down(0x11)
        key_down(base)
        key_up(base)
        key_up(0x11)
    elif name in VK:
        key_down(VK[name])
        key_up(VK[name])
    else:
        raise ValueError("unknown key: " + name)
    print("key:", name)


def paste(text):
    set_clipboard(text)
    time.sleep(0.15)
    key("CTRL_V")


def type_text(text):
    for ch in text:
        unicode_char(ch)
        time.sleep(0.012)
    print("typed:", len(text), "chars")


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return
    cmd = a[0].lower()
    if cmd == "windows":
        windows()
    elif cmd == "shot":
        shot(a[1], a[2:6] or None)
    elif cmd == "focus":
        focus(a[1])
    elif cmd == "move":
        hwnd, x, y, w, h = map(int, a[1:6])
        u.MoveWindow(hwnd, x, y, w, h, True)
        time.sleep(0.3)
        print("move:", hwnd, "->", (x, y, w, h))
    elif cmd == "click":
        click(a[1], a[2])
    elif cmd == "dblclick":
        click(a[1], a[2], 2)
    elif cmd == "paste":
        paste(a[1])
    elif cmd == "pastewin":
        # MSYS/Git Bash 会把 argv 里的反斜杠转成正斜杠，这里还原成 Windows 路径
        paste(a[1].replace("/", "\\"))
    elif cmd == "type":
        type_text(a[1])
    elif cmd == "key":
        key(a[1])
    elif cmd == "sleep":
        time.sleep(float(a[1]))
        print("slept", a[1])
    else:
        print("unknown command:", cmd)


if __name__ == "__main__":
    main()
