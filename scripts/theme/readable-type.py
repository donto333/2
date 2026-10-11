#!/usr/bin/env python3
"""천하 UI 가독성: 지나치게 작은 글자 크기와 넓은 자간을 읽기 좋은 범위로 올린다.

  7~8px → 11px · 9~10px → 12px · 11px → 13px (12px 이상은 그대로)
  0.8rem 미만 → 0.8rem(12.8px)
  font-size, clamp(...), font 축약형(font:600 9px Sora) 모두 같은 규칙
  자간 0.1em 초과 → 0.1em (작은 영문 대문자 제목이 흩어져 보이지 않게)
여러 번 실행해도 결과가 같다.
사용: python3 scripts/theme/readable-type.py src/styles/main.css
"""
import re, sys

PX = {7: 11, 8: 11, 9: 12, 10: 12, 11: 13}

def px(value):
    v = float(value)
    if v < 7 or v >= 12: return f'{value}px'
    return f'{PX.get(int(v), 13)}px'

def rem(value):
    v = float(value)
    return f'{max(v, 0.8):g}rem' if v < 0.8 else f'{value}rem'

def font_size(match):
    value = re.sub(r'(\d*\.?\d+)px', lambda m: px(m.group(1)), match.group(1))
    value = re.sub(r'(\d*\.?\d+)rem', lambda m: rem(m.group(1)), value)
    return f'font-size:{value}'

def font_shorthand(match):
    return match.group(1) + px(match.group(2))

def letter_spacing(match):
    v = float(match.group(1))
    return f'letter-spacing:{min(v, 0.1):g}em' if v > 0.1 else match.group(0)

if __name__ == '__main__':
    path = sys.argv[1]
    css = open(path, encoding='utf8').read()
    css, n1 = re.subn(r'font-size:\s*([^;}]+)', font_size, css)
    css, n3 = re.subn(r'(font:\s*(?:\d{3}\s+)?)(\d*\.?\d+)px', font_shorthand, css)
    css, n2 = re.subn(r'letter-spacing:\s*(\d*\.?\d+)em', letter_spacing, css)
    open(path, 'w', encoding='utf8').write(css)
    print(f'{path}: font-size {n1}곳, font 축약형 {n3}곳, letter-spacing {n2}곳 검사')
