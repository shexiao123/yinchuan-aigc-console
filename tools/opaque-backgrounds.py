# -*- coding: utf-8 -*-
"""
One-off / reusable guard: turn every translucent *background* in the webapp
and miniprogram stylesheets into an equivalent opaque colour.

Usage:  python tools/opaque-backgrounds.py [--check]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [
    ROOT / "webapp/assets/tech.css",
    ROOT / "webapp/assets/style.css",
    ROOT / "webapp/assets/admin.css",
    ROOT / "webapp/assets/mobile.css",
]
FILES += sorted((ROOT / "miniprogram").rglob("*.wxss"))

# (file marker, old, new) - precise replacements for overlays / decorations
EXACT = [
    ("assets/tech.css",
     "background: linear-gradient(180deg, transparent 62%, rgba(255, 255, 255, .55) 100%);",
     "background: none;"),
    ("assets/tech.css",
     "background: linear-gradient(180deg, transparent 66%, rgba(255, 255, 255, .52) 100%);",
     "background: none;"),
    ("assets/tech.css",
     "background: linear-gradient(180deg, transparent 62%, rgba(255, 255, 255, .50) 100%);",
     "background: none;"),
    ("assets/tech.css",
     "background: rgba(15, 23, 42, .38); backdrop-filter: blur(4px);",
     "background: #A9B8CC; backdrop-filter: none;"),
    ("assets/style.css",
     "background: rgba(44, 38, 34, .5);\n  backdrop-filter: blur(3px);",
     "background: #A9B8CC;\n  backdrop-filter: none;"),
    ("assets/style.css",
     "background: rgba(44, 38, 34, .94); color: #fff; font-size: 13.5px;",
     "background: #2C2622; color: #fff; font-size: 13.5px;"),
    ("assets/style.css",
     "background: rgba(0, 0, 0, 0.88);",
     "background: #101418;"),
    ("assets/style.css",
     "background: linear-gradient(100deg, rgba(24, 18, 13, 0.82) 0%, rgba(24, 18, 13, 0.58) 42%, rgba(24, 18, 13, 0.22) 100%);",
     "background: linear-gradient(100deg, #1B3A63 0%, #2E5B91 100%);"),
    ("assets/style.css",
     "background: rgba(28, 24, 21, 0.42);",
     "background: #5A514A;"),
    ("assets/style.css",
     ".sample-locked:hover .sample-lock { background: rgba(28, 24, 21, 0.58); }",
     ".sample-locked:hover .sample-lock { background: #4A423C; }"),
    ("assets/style.css",
     "background: rgba(28, 24, 21, 0.55);",
     "background: #4A423C;"),
    ("assets/admin.css",
     "background: rgba(44, 38, 34, .5);\n  backdrop-filter: blur(3px);",
     "background: #A9B8CC;\n  backdrop-filter: none;"),
    ("assets/admin.css",
     "background: rgba(44, 38, 34, .94); color: #fff; font-size: 13px;",
     "background: #2C2622; color: #fff; font-size: 13px;"),
    ("assets/admin.css",
     "background: rgba(0,0,0,.4);",
     "background: #A9B8CC;"),
]

RGBA = re.compile(r"rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)")
DECL = re.compile(r"(?<![-a-zA-Z])(background(?:-color)?\s*:\s*)([^;]+)", re.S)
WHITE = (255, 255, 255)
DARK = (22, 35, 58)  # admin sidebar gradient midpoint


def to_hex(rgb, alpha, base):
    return "#%02X%02X%02X" % tuple(
        max(0, min(255, round(float(rgb[i]) * alpha + base[i] * (1 - alpha))))
        for i in range(3)
    )


def convert_value(value, line_base):
    def rgba_sub(m):
        rgb = tuple(float(m.group(i)) for i in (1, 2, 3))
        alpha = float(m.group(4))
        # Dark overlays, and faint white tints on dark cards, keep their dark
        # appearance by compositing over the dark base instead of white.
        is_dark = max(rgb) < 90 or (min(rgb) > 200 and alpha < 0.3)
        base = DARK if (line_base is DARK or is_dark) else WHITE
        return to_hex(rgb, alpha, base)

    value = RGBA.sub(rgba_sub, value)
    # transparent endpoints inside gradients / plain backgrounds become a solid colour
    value = re.sub(r"\btransparent\b", "#%02X%02X%02X" % line_base, value)
    return value


def process(text, is_dark_file):
    """Match whole declarations (they may span several lines)."""
    changed = [0]

    def sub(m):
        before = text[max(0, m.start() - 320):m.start()]
        dark = is_dark_file and bool(re.search(r"\.side(?:bar|-item|-badge)?\b", before))
        base = DARK if dark else WHITE
        new_val = convert_value(m.group(2), base)
        if new_val != m.group(2):
            changed[0] += 1
        return m.group(1) + new_val

    return DECL.sub(sub, text), changed[0]


def main():
    check = "--check" in sys.argv
    total = 0
    for path in FILES:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        original = text
        for marker, old, new in EXACT:
            if marker in str(path) and old in text:
                text = text.replace(old, new)
        text, n = process(text, "admin.css" in str(path))
        total += n
        if text != original:
            print("%-62s %3d declarations" % (str(path.relative_to(ROOT)), n))
            if not check:
                path.write_text(text, encoding="utf-8")
    print("TOTAL converted declarations:", total, "(dry-run)" if check else "(written)")


if __name__ == "__main__":
    main()
