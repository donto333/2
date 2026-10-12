#!/usr/bin/env python3
"""천하 UI 색 테마 변환: 차가운 청록(jade/teal) 계열을 따뜻한 칠기·금·주홍 계열로 옮긴다.

밝기(lightness)와 투명도는 그대로 두어 글자 대비가 바뀌지 않게 하고, 색상(hue)과 채도만 바꾼다.
  - 어두운 청록 바탕(L<0.25)  → 따뜻한 갈색 칠기 (hue 22°)
  - 밝은 청록 강조색          → 금빛 (hue 40°)
  - 채도가 낮은 회색          → 살짝 따뜻한 회색
  - 그 밖의 색(등급색·경고색) → 그대로
사용: python3 scripts/theme/warm-remap.py src/styles/main.css
"""
import colorsys, re, sys

PATTERN = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)')

def parse(token):
    if token.startswith('#'):
        h = token[1:]
        if len(h) not in (3, 4, 6, 8): return None
        if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = h[6:8] if len(h) == 8 else None
        return ('hex', r, g, b, a)
    nums = re.findall(r'[\d.]+%?', token)
    if len(nums) < 3 or any('%' in n for n in nums[:3]): return None
    r, g, b = (float(n) for n in nums[:3])
    a = nums[3] if len(nums) > 3 else None
    return ('rgb', r, g, b, a)

def shift(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    deg = h * 360
    if s < 0.12:  # 회색 → 따뜻한 회색
        h, s = 35 / 360, min(0.14, s + 0.06)
    elif 115 <= deg <= 225:  # 청록·녹색 계열
        if l < 0.25:
            h, s, l = 22 / 360, min(0.5, s * 1.05 + 0.08), min(0.3, l * 1.12)
        elif s < 0.35:  # 연한 청록 글자색 → 크림색
            h, s = 40 / 360, min(0.45, s + 0.1)
        else:  # 선명한 청록 강조색 → 금빛
            h, s = 40 / 360, min(0.82, max(0.6, s))
    else:
        return None
    nr, ng, nb = colorsys.hls_to_rgb(h, l, s)
    return round(nr * 255), round(ng * 255), round(nb * 255)

def replace(match):
    token = match.group()
    parsed = parse(token)
    if not parsed: return token
    kind, r, g, b, a = parsed
    out = shift(r, g, b)
    if not out: return token
    r, g, b = out
    if kind == 'hex':
        return '#%02x%02x%02x%s' % (r, g, b, a or '')
    prefix = 'rgba' if token.startswith('rgba') or a is not None else 'rgb'
    return f'{prefix}({r},{g},{b}' + (f',{a})' if a is not None else ')')

if __name__ == '__main__':
    path = sys.argv[1]
    css = open(path, encoding='utf8').read()
    count = len(PATTERN.findall(css))
    out = PATTERN.sub(replace, css)
    open(path, 'w', encoding='utf8').write(out)
    print(f'{path}: {count}개 색 검사')
