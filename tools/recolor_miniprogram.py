"""一次性主题迁移：把小程序里残留的暖陶土/米白色值换成冷蓝全息色值。

只做精确 6 位 hex 替换，不动功能色（错误红、成功绿、金色点缀、既有冷蓝紫），
不动任何布局或选择器。可重复执行（幂等：目标值不在映射表内）。
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'miniprogram'

# 暖色 -> 冷蓝全息色。键一律大写，不带 #
MAPPING = {
    # 主色（陶土 -> 电光蓝）
    'C4703F': '2F6BEA',
    'A85A2D': '1D4FB8',
    'F6E7DA': 'E8F1FF',
    # 米白 / 陶土浅底 -> 冷白浅蓝
    'F7F2EC': 'F3F8FF',
    'F5EFE8': 'EFF5FE',
    'FBF3EA': 'EAF3FF',
    'F7EFE4': 'F0F6FF',
    'FAF6F1': 'F4F8FE',
    'F3EDE6': 'EBF3FC',
    'FDF9F4': 'F7FAFF',
    'F9F5F0': 'F6F9FF',
    'F2EBE3': 'EDF4FC',
    'F0E9E0': 'EDF3FB',
    'EDE4D9': 'E4EDF9',
    'EDE4DA': 'E4EDF9',
    'F7EBE4': 'F2F6FF',
    'F5E9E4': 'EFF5FF',
    'FBF7F2': 'F5F9FF',
    'FBEDEA': 'FCEFF3',
    'F7E9EB': 'F1ECFD',
    'EFEBE6': 'EEF3FB',
    # 状态色：琥珀待处理 -> 靛蓝；橄榄 -> 青
    'FBF0DC': 'E6F0FF',
    'A9752B': '1D6FD8',
    'EBF0E6': 'E4F5F3',
    'E6F0E6': 'E4F5F3',
    '6E7F5C': '0F8A7E',
    'B5707A': '7C5CE0',
    # 暖灰 / 深棕 -> 冷灰蓝 / 深墨蓝
    'CFC4BA': 'B9C9DE',
    'D5C9BE': 'C4D3E6',
    'BFB4AA': '9DB0CC',
    'B5AAA0': '9DB0CC',
    '9A8E85': '8397B4',
    '5A4C40': '2E4463',
    '4A3A2E': '213A5B',
    '3A2E26': '1A3050',
    '6A5A4C': '3F5573',
    '6B5F55': '445A78',
    '40372F': '1A3050',
    'C3B8AE': 'B9C9DE',
    'C4B8AC': 'B9C9DE',
    'D8CEC3': 'DCE8F8',
    'E0D6CC': 'C4D3E6',
    # 危险按钮：暖砖红 -> 冷红
    'C0574A': 'D2455A',
    # 故意保留：金色点缀（#C99A5E/#B4783C/#E8A33D/#E8B87A/#E8B27A）
    # 与错误红 #A8463A —— 都是语义色，不属于暖陶土主题残留。
}

PATTERN = re.compile(r'#([0-9A-Fa-f]{6})\b')


def main():
    files = [ROOT / 'app.wxss'] + sorted((ROOT / 'pages').glob('*/*.wxss'))
    total = 0
    for path in files:
        src = path.read_text(encoding='utf-8')
        count = [0]

        def repl(m):
            key = m.group(1).upper()
            if key in MAPPING:
                count[0] += 1
                return '#' + MAPPING[key]
            return m.group(0)

        out = PATTERN.sub(repl, src)
        if out != src:
            path.write_text(out, encoding='utf-8')
            print(f'{path.relative_to(ROOT)}: {count[0]} 处')
            total += count[0]
    print(f'合计替换 {total} 处，涉及 {len(files)} 个样式文件')


if __name__ == '__main__':
    main()
