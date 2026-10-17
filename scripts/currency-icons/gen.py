import math, random, os
OUT = os.path.dirname(__file__)
random.seed(7)

COMMON = '''
<filter id="bevel" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>
  <feSpecularLighting in="b" surfaceScale="{scale}" specularConstant="{const}" specularExponent="{exp}" lighting-color="#fff8e8" result="s"><fePointLight x="40" y="-40" z="{z}"/></feSpecularLighting>
  <feComposite in="s" in2="SourceAlpha" operator="in" result="si"/>
  <feDiffuseLighting in="b" surfaceScale="{scale}" diffuseConstant="1" lighting-color="#ffffff" result="d"><feDistantLight azimuth="235" elevation="50"/></feDiffuseLighting>
  <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>
  <feComposite in="lit" in2="si" operator="arithmetic" k1="0" k2="1" k3="{spec}" k4="0" result="out"/>
  <feComposite in="out" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="3" seed="{seed}" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0.33 0.33 0.33 0 {lift}  0.33 0.33 0.33 0 {lift}  0.33 0.33 0.33 0 {lift}  0 0 0 0 1" result="g"/>
  <feBlend in="SourceGraphic" in2="g" mode="multiply" result="m"/>
  <feComposite in="m" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".55"/></filter>
'''

def svg(body, defs='', blur=4, scale=5, const=.8, exp=18, z=260, spec=.6, freq='.9', seed=3, lift=.55):
    d = COMMON.format(blur=blur, scale=scale, const=const, exp=exp, z=z, spec=spec, freq=freq, seed=seed, lift=lift)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs>{d}{defs}</defs><g filter="url(#shadow)">{body}</g></svg>'

icons = {}

# 금화: 놋쇠 엽전(네모 구멍), 테두리·안쪽 테 돋을새김, 녹청 얼룩
icons['gold'] = svg(f'''
<g filter="url(#bevel)"><g filter="url(#grain)">
 <circle cx="128" cy="128" r="112" fill="url(#brass)"/>
 <circle cx="128" cy="128" r="96" fill="url(#brassIn)"/>
 <path d="M128 40a88 88 0 1 1 0 176a88 88 0 1 1 0-176z" fill="none" stroke="#9c6f22" stroke-width="5"/>
 <rect x="94" y="94" width="68" height="68" rx="3" fill="url(#brass)"/>
 <path d="M128 56c8 10 8 18 0 26-8-8-8-16 0-26zM128 174c8 10 8 18 0 26-8-8-8-16 0-26zM56 128c10-8 18-8 26 0-8 8-16 8-26 0zM174 128c10-8 18-8 26 0-8 8-16 8-26 0z" fill="#d9a43a"/>
</g></g>
<rect x="104" y="104" width="48" height="48" rx="2" fill="#1b0f05"/>
<path d="M104 104h48l-6 6h-36v36l-6 6z" fill="#000" opacity=".45"/>
<ellipse cx="96" cy="78" rx="38" ry="16" transform="rotate(-35 96 78)" fill="#fff6d6" opacity=".22"/>
<g opacity=".28" fill="#3f7a5c"><circle cx="186" cy="170" r="10"/><circle cx="176" cy="186" r="6"/><circle cx="70" cy="190" r="7"/></g>
''', defs='''<radialGradient id="brass" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#f3c85a"/><stop offset=".45" stop-color="#c38a1e"/><stop offset=".85" stop-color="#7d4f0c"/><stop offset="1" stop-color="#553306"/></radialGradient>
<radialGradient id="brassIn" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e8b546"/><stop offset=".6" stop-color="#b27a18"/><stop offset="1" stop-color="#7a4c0c"/></radialGradient>''', freq='1.2', lift=.7, spec=.35, exp=24)

# 은전: 말굽은(원보)
icons['silver'] = svg(f'''
<g filter="url(#bevel)"><g filter="url(#grain)">
 <path d="M18 120c18-26 52-30 76-18 6-30 62-30 68 0 24-12 58-8 76 18 6 8 2 14-4 20-20 52-68 72-106 72S42 192 22 140c-6-6-10-12-4-20z" fill="url(#ag)"/>
 <ellipse cx="128" cy="98" rx="34" ry="26" fill="url(#agTop)"/>
 <path d="M40 132c26 22 150 22 176 0" fill="none" stroke="#8d969d" stroke-width="5"/>
</g></g>
<ellipse cx="114" cy="86" rx="16" ry="8" fill="#fff" opacity=".55" transform="rotate(-15 114 86)"/>
<path d="M40 126c14-14 34-18 50-12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>
''', defs='''<linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#d6dbdf"/><stop offset=".7" stop-color="#9aa3aa"/><stop offset="1" stop-color="#5b646b"/></linearGradient>
<radialGradient id="agTop" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#c9cfd4"/><stop offset="1" stop-color="#7c858c"/></radialGradient>''', freq='1.6', lift=.75, spec=.9, exp=26)

# 옥패: 비취 패 + 붉은 매듭 끈 + 술
jade = '''<radialGradient id="jd" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#b8f0d2"/><stop offset=".45" stop-color="#4fae84"/><stop offset=".85" stop-color="#1d6a4b"/><stop offset="1" stop-color="#0f4430"/></radialGradient>
<filter id="jadeTex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="4" seed="11" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .85  0 0 0 0 1  0 0 0 0 .9  0 0 0 1.6 -.75" result="c"/><feComposite in="c" in2="SourceAlpha" operator="in" result="ci"/><feBlend in="SourceGraphic" in2="ci" mode="screen"/></filter>
<linearGradient id="silk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e0f0a"/><stop offset=".5" stop-color="#d23a2a"/><stop offset="1" stop-color="#6e0f0a"/></linearGradient>'''
icons['honor'] = svg(f'''
<path d="M128 8c-14 0-22 10-22 20s8 18 22 18 22-8 22-18-8-20-22-20z" fill="none" stroke="url(#silk)" stroke-width="9"/>
<path d="M128 44v20" stroke="url(#silk)" stroke-width="10"/>
<g filter="url(#bevel)"><g filter="url(#jadeTex)">
 <path d="M84 62h88l22 26v110l-22 26H84l-22-26V88z" fill="url(#jd)"/>
</g></g>
<path d="M90 74h76l16 18v100l-16 18H90l-16-18V92z" fill="none" stroke="#0f4430" stroke-width="3" opacity=".7"/>
<path d="M92 77h72l14 16" fill="none" stroke="#d9ffee" stroke-width="2.5" opacity=".6"/>
<circle cx="128" cy="140" r="30" fill="none" stroke="#0f4430" stroke-width="7" opacity=".75"/>
<circle cx="128" cy="140" r="30" fill="none" stroke="#c9f7df" stroke-width="2" opacity=".5" transform="translate(-1.5 -1.5)"/>
<circle cx="128" cy="140" r="12" fill="#0b3524"/>
<path d="M98 104h60M98 178h60" stroke="#0f4430" stroke-width="4" opacity=".6"/>
<path d="M96 70c10 4 20 16 22 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>
<path d="M128 224v12" stroke="url(#silk)" stroke-width="9"/>
<path d="M118 236h20l4 16h-28z" fill="#b8281c"/><path d="M120 240v12M126 240v12M132 240v12M138 240v12" stroke="#7a130c" stroke-width="2"/>
''', defs=jade, blur=5, scale=4, spec=.7, exp=30)

# 영향력: 인장(수산석 몸체 + 사자 꼭지 + 붉은 인주)
icons['influence'] = svg(f'''
<g filter="url(#bevel)"><g filter="url(#grain)">
 <path d="M96 40c8-20 56-20 64 0 10 4 16 14 12 26l-6 18H90l-6-18c-4-12 2-22 12-26z" fill="url(#stone)"/>
 <path d="M72 84h112v118H72z" fill="url(#stoneBody)"/>
 <path d="M66 200h124v22H66z" fill="url(#cinnabar)"/>
</g></g>
<path d="M104 54c6-8 14-10 24-10s18 2 24 10" fill="none" stroke="#6b4a24" stroke-width="5" stroke-linecap="round"/>
<circle cx="114" cy="62" r="5" fill="#4a3216"/><circle cx="142" cy="62" r="5" fill="#4a3216"/>
<path d="M80 92v100" stroke="#fff4dc" stroke-width="5" opacity=".35"/>
<path d="M150 110c10 20 6 40 14 70" fill="none" stroke="#8a5f2c" stroke-width="3" opacity=".5"/>
<path d="M66 222h124" stroke="#5a0e08" stroke-width="4"/>
''', defs='''<linearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2d9a6"/><stop offset=".6" stop-color="#c79a5a"/><stop offset="1" stop-color="#8a5f2c"/></linearGradient>
<linearGradient id="stoneBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9cd96"/><stop offset=".45" stop-color="#d1a865"/><stop offset="1" stop-color="#8f6331"/></linearGradient>
<linearGradient id="cinnabar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2513c"/><stop offset=".6" stop-color="#b52a1c"/><stop offset="1" stop-color="#7a160d"/></linearGradient>''', freq='.55', lift=.7)

# 식량: 이삭 다발 + 짚끈
kern = []
for side in range(-3, 4):
    ang = side * 9
    for k in range(9):
        t = k / 8
        x = 128 + side * 10 + math.sin(math.radians(ang)) * (120 - t * 100) * 0.55
        y = 24 + t * 96
        r = 7.5 - t * 1.5
        kern.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r*0.7:.1f}" ry="{r*1.25:.1f}" transform="rotate({ang + (k%2*2-1)*14} {x:.1f} {y:.1f})" fill="url(#kernel)"/>')
stems = ''.join(f'<path d="M{128 + s*10 + math.sin(math.radians(s*9))*66:.1f} 120 L{128 + s*6:.1f} 236" stroke="url(#straw)" stroke-width="7" stroke-linecap="round"/>' for s in range(-3, 4))
icons['grain'] = svg(f'''
<g filter="url(#bevel)"><g filter="url(#grain)">{stems}{''.join(kern)}
<path d="M92 168c24 10 48 10 72 0v18c-24 10-48 10-72 0z" fill="url(#twine)"/></g></g>
''', defs='''<radialGradient id="kernel" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#e2b64a"/><stop offset="1" stop-color="#9a6a1c"/></radialGradient>
<linearGradient id="straw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b48a3a"/><stop offset=".5" stop-color="#e8c878"/><stop offset="1" stop-color="#9c7428"/></linearGradient>
<linearGradient id="twine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7a56a"/><stop offset="1" stop-color="#7d5426"/></linearGradient>''', blur=2.5, scale=3, freq='1.4', lift=.7)

# 목재: 쌓은 통나무(나이테 단면 + 나무껍질)
def log(cx, cy, rx, ry, length):
    rings = ''.join(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx*f:.1f}" ry="{ry*f:.1f}" fill="none" stroke="#8a5a2a" stroke-width="{1.6 if i%2 else 1}" opacity="{.5+.1*(i%3)}"/>' for i, f in enumerate([.85, .7, .56, .43, .3, .18]))
    return f'''<path d="M{cx} {cy-ry}h{length}a{rx*0.55:.1f} {ry} 0 0 1 0 {2*ry}h-{length}z" fill="url(#bark)" filter="url(#barkTex)"/>
<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#endgrain)"/>{rings}<circle cx="{cx}" cy="{cy}" r="3" fill="#6b3e17"/>
<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="#5a3412" stroke-width="5"/>'''
icons['wood'] = svg(f'''<g filter="url(#bevel)">{log(70, 168, 40, 44, 150)}{log(96, 92, 38, 42, 132)}</g>''', defs='''
<linearGradient id="bark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c6a3a"/><stop offset=".45" stop-color="#6e4420"/><stop offset="1" stop-color="#3f230c"/></linearGradient>
<radialGradient id="endgrain" cx="45%" cy="45%" r="60%"><stop offset="0" stop-color="#f4cf92"/><stop offset=".7" stop-color="#d9a462"/><stop offset="1" stop-color="#b07a3e"/></radialGradient>
<filter id="barkTex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".02 .35" numOctaves="3" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values="0.4 0.4 0.4 0 .35  0.4 0.4 0.4 0 .3  0.4 0.4 0.4 0 .28  0 0 0 0 1" result="g"/><feBlend in="SourceGraphic" in2="g" mode="multiply" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>''', blur=3, scale=4, spec=.35)

# 철: 덩이쇠 두 장(거친 단조 표면 + 녹)
def bar(x, y, w, h, top):
    return f'''<path d="M{x} {y+top}l{top} -{top}h{w-2*top}l{top} {top}v{h}h-{w}z" fill="url(#steelTop)"/>
<path d="M{x} {y+top}h{w}v{h}h-{w}z" fill="url(#steelSide)"/>'''
icons['iron'] = svg(f'''
<g filter="url(#bevel)"><g filter="url(#rough)">{bar(40, 140, 176, 44, 22)}{bar(62, 84, 132, 40, 20)}</g></g>
<g opacity=".35" fill="#8a3d16"><ellipse cx="70" cy="196" rx="12" ry="5"/><ellipse cx="180" cy="170" rx="9" ry="4"/><ellipse cx="150" cy="120" rx="8" ry="3"/></g>
<path d="M84 86h88" stroke="#e6edf2" stroke-width="3" opacity=".5"/>
''', defs='''<linearGradient id="steelTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7dee4"/><stop offset="1" stop-color="#7d8994"/></linearGradient>
<linearGradient id="steelSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c7883"/><stop offset="1" stop-color="#2f3840"/></linearGradient>
<filter id="rough" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="4" seed="9" result="n"/><feColorMatrix in="n" type="matrix" values="0.5 0.5 0.5 0 .25  0.5 0.5 0.5 0 .25  0.5 0.5 0.5 0 .25  0 0 0 0 1" result="g"/><feBlend in="SourceGraphic" in2="g" mode="multiply" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in"/></filter>''', blur=2, scale=3, spec=.5, exp=30)

# 병서: 죽간(대나무 조각을 끈으로 엮어 펼침)
slips = ''
for i in range(9):
    x = 40 + i * 20
    y0 = 52 + abs(i - 4) * 3
    slips += f'<rect x="{x}" y="{y0}" width="17" height="{150 - abs(i-4)*2}" rx="3" fill="url(#bamboo)"/>'
    slips += f'<path d="M{x+2} {y0+50}h13M{x+2} {y0+108}h13" stroke="#8a6a2c" stroke-width="2"/>'
    slips += ''.join(f'<path d="M{x+5} {y0+14+j*16}h{6 + (i*j)%4}" stroke="#2a1a0c" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>' for j in range(7) if (i+j)%5)
icons['manuals'] = svg(f'''
<g filter="url(#bevel)"><g filter="url(#grain)">{slips}</g></g>
<path d="M34 86c60 8 128 8 190 0M34 172c60 8 128 8 190 0" fill="none" stroke="#7a2a18" stroke-width="5"/>
<path d="M224 86c10 6 12 16 4 26M224 172c10 6 12 16 4 26" fill="none" stroke="#7a2a18" stroke-width="5" stroke-linecap="round"/>
''', defs='''<linearGradient id="bamboo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a88446"/><stop offset=".35" stop-color="#f0d699"/><stop offset=".75" stop-color="#d2ae66"/><stop offset="1" stop-color="#8f6a30"/></linearGradient>''', blur=1.5, scale=2.5, freq='.6 .05', lift=.72, spec=.4)

# 신화장비 조각: 자수정 결정 무더기
crys = '''
<path d="M128 18l30 70-30 150-30-150z" fill="url(#am1)"/><path d="M128 18l30 70-30 150z" fill="#4b2384" opacity=".55"/>
<path d="M78 92l22 44-18 96-24-90z" fill="url(#am2)"/><path d="M78 92l22 44-18 96z" fill="#3b1a6a" opacity=".5"/>
<path d="M182 102l24 40-26 88-14-88z" fill="url(#am2)"/><path d="M182 102l24 40-26 88z" fill="#3b1a6a" opacity=".5"/>
<path d="M128 18l-30 70h60z" fill="#e6d2ff" opacity=".55"/>
<path d="M118 60l6-30" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>'''
icons['mythic'] = svg(f'''<circle cx="128" cy="140" r="96" fill="url(#glow)"/><g filter="url(#bevel)">{crys}</g>''', defs='''
<linearGradient id="am1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9d4ff"/><stop offset=".45" stop-color="#a26ce8"/><stop offset="1" stop-color="#4b2384"/></linearGradient>
<linearGradient id="am2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9bdff"/><stop offset=".5" stop-color="#8b54d0"/><stop offset="1" stop-color="#3b1a6a"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#b98cff" stop-opacity=".45"/><stop offset="1" stop-color="#b98cff" stop-opacity="0"/></radialGradient>''', blur=2, scale=3, spec=.8, exp=34)

for name, content in icons.items():
    open(os.path.join(OUT, f'{name}.svg'), 'w').write(content)
print('ok', len(icons))
