"""
업로드한 무기 GLB(경량화본) → 게임 규격 무기 GLB.
규격: 손잡이 중심이 원점, 날(머리)이 +Y, 날의 넓은 면이 XY 평면(넓게 퍼진 쪽이 +X).
꼭짓점 색(COLOR_0, 선형)은 원본 색 텍스처에서 뽑는다 → 텍스처 없이 한 재질로 그린다.
"""
import sys, json, struct, numpy as np
sys.path.insert(0, '/home/claude/tools')
from glbload import load
from PIL import Image, ImageFilter

SRC = '/home/claude/work/simp/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/out/'

# head: 머리(날)가 PCA 축의 어느 끝인지(+1/-1). 구간 값은 머리 끝에서 잰 비율이 아니라 "자루 끝(0) → 머리 끝(1)" 비율.
WEAPONS = {
    # 칼: 크기만 고르게 맞춘다. grip = 자루 끝에서 손잡이 중심까지 비율, length = 전체 길이
    'sword-qinggang': dict(src='청강검', type='sword', head=+1, grip=0.058, length=1.4, axis=(0.2, 0.95)),
    'saber-cavalry':  dict(src='기병칼', type='sword', head=-1, grip=0.14, length=1.25, axis=(0.2, 0.75)),
    'fan-baiyu':      dict(src='백우선', type='sword', head=-1, grip=0.17, length=0.62, axis=None),
    # 장병기: 자루 끝 -0.9 ~ 머리 끝 total-0.9. butt = 자루 끝 장식 끝, head = 머리 시작, R = 굵기 배율, A = 머리 길이 배율
    'glaive-qinglong': dict(src='청룡언월도', type='pole', head=+1, butt=3.5/24, headAt=14/24, R=1.3, A=1.3, total=2.6, axis=(4/24, 13.5/24)),
    'halberd-fangtian': dict(src='방천화극', type='pole', head=-1, butt=1/24, headAt=12.5/24, R=1.35, A=1.35, total=2.6, axis=(1.5/24, 12/24)),
    'snake-zhangba':  dict(src='장창사모', type='pole', head=+1, butt=0.0, headAt=None, R=1.3, A=1.3, total=2.6, axis=None, tassel=True),
    'blade-yanyue':   dict(src='언월도', type='pole', head=-1, butt=0.0, headAt=1 - 7.3/24, R=1.05, A=1.7, total=2.3, axis=(1/24, 16/24)),
}

def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def unit(v): return v / np.linalg.norm(v)

def frame(P, cols, cfg):
    """축 정렬: Y = 자루→머리, X = 머리의 넓은 방향. 반환: 원점(자루 중심선 위 한 점), 회전 행렬(행 = 새 X, Y, Z)"""
    c = P.mean(0)
    _, _, vt = np.linalg.svd(P - c, full_matrices=False)
    y = vt[0] * cfg['head']
    t = (P - c) @ y
    lo, hi = t.min(), t.max(); f = (t - lo) / (hi - lo)
    red = (cols[:, 0] > 150) & (cols[:, 1] < 90) & (cols[:, 2] < 90)
    if cfg.get('tassel'):
        # 장창사모: 붉은 술이 몸통 축을 기울이므로, 술을 뺀 양 끝(자루 끝 · 창끝) 단면 중심으로 축을 잡는다
        keep = ~red
        a = P[keep & (f < 0.04)].mean(0); b = P[keep & (f > 0.97)].mean(0)
        y = unit(b - a)
    elif cfg.get('axis'):
        s0, s1 = cfg['axis']
        sel = (f >= s0) & (f <= s1) & ~red
        cc = P[sel].mean(0)
        _, _, v2 = np.linalg.svd(P[sel] - cc, full_matrices=False)
        y = v2[0] * np.sign(v2[0] @ y)
    # 머리 쪽 넓은 방향 → X
    t = (P - c) @ y; f = (t - t.min()) / np.ptp(t)
    radial = (P - c) - np.outer(t, y)
    head = radial[(f > 0.6) & ~red]
    _, _, v3 = np.linalg.svd(head - head.mean(0), full_matrices=False)
    x = unit(v3[0] - (v3[0] @ y) * y)
    z = np.cross(x, y)
    M = np.stack([x, y, z])
    Q = (P - c) @ M.T
    # 넓게 퍼진 쪽(언월도 날 · 화극 큰 날)이 +X
    if abs(Q[:, 0].min()) > Q[:, 0].max(): M[0] *= -1; M[2] *= -1
    return c, M, red

def build(name, cfg):
    P, N, UV, I, imgs = load(SRC + cfg['src'] + '.glb')
    base = imgs['base'].convert('RGB')
    small = base.resize((512, 512), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
    tex = np.asarray(small).astype(np.float64)
    hh, ww, _ = tex.shape
    # 꼭짓점 색: 이중 선형 표본
    u = np.clip(UV[:, 0] * ww - 0.5, 0, ww - 1.001); v = np.clip(UV[:, 1] * hh - 0.5, 0, hh - 1.001)
    u0 = u.astype(int); v0 = v.astype(int); du = (u - u0)[:, None]; dv = (v - v0)[:, None]
    cols = (tex[v0, u0] * (1 - du) * (1 - dv) + tex[v0, u0 + 1] * du * (1 - dv) + tex[v0 + 1, u0] * (1 - du) * dv + tex[v0 + 1, u0 + 1] * du * dv)
    c, M, red = frame(P, cols, cfg)
    Q = (P - c) @ M.T; Nn = N @ M.T
    t = Q[:, 1]; lo, hi = t.min(), t.max(); L = hi - lo
    f = (t - lo) / L
    if cfg['type'] == 'sword':
        # 손잡이 중심을 자루 중심선 위에 둔다(손잡이 구간 단면 중심)
        g = cfg['grip']
        sel = (f > g - 0.03) & (f < g + 0.03) & ~red
        ctr = Q[sel][:, [0, 2]].mean(0) if sel.sum() > 10 else np.zeros(2)
        S = cfg['length'] / L
        out = np.empty_like(Q)
        out[:, 0] = (Q[:, 0] - ctr[0]) * S
        out[:, 2] = (Q[:, 2] - ctr[1]) * S
        out[:, 1] = (f - g) * cfg['length']
        nout = Nn
    else:
        R, A, total = cfg['R'], cfg['A'], cfg['total']
        b = cfg['butt']
        h = cfg['headAt']
        if h is None:
            # 머리 시작: 술 꼭짓점 중 머리 쪽 끝(술은 창날 밑동에 매여 있다)
            h = np.percentile(f[red], 99) if red.any() else 0.55
        # 자루 단면 중심(자루 구간 가운데)
        mid = (f > b + (h - b) * 0.2) & (f < b + (h - b) * 0.8) & ~red
        ctr = Q[mid][:, [0, 2]].mean(0)
        butt_len = b * L * R
        head_len = (1 - h) * L * A
        shaft_len = total - butt_len - head_len
        def axial(ff):
            return np.where(ff < b, ff * L * R,
                   np.where(ff < h, butt_len + (ff - b) / (h - b) * shaft_len,
                            butt_len + shaft_len + (ff - h) * L * A)) - 0.9
        y = axial(f)
        if cfg.get('tassel') and red.any():
            # 술은 늘리지 않는다: 머리와 함께 단단히 옮긴다(매듭 위치 h 기준)
            y = np.where(red, butt_len + shaft_len - 0.9 + (f - h) * L * R, y)
        out = np.empty_like(Q)
        out[:, 0] = (Q[:, 0] - ctr[0]) * R
        out[:, 2] = (Q[:, 2] - ctr[1]) * R
        out[:, 1] = y
        # 축 방향으로 늘인 자루: 노멀은 늘림의 역(축 성분 축소) 후 정규화
        sy = np.where(f < b, R, np.where(f < h, shaft_len / max((h - b) * L, 1e-6), A))
        nout = Nn.copy(); nout[:, 1] = Nn[:, 1] * R / sy
        nout /= np.linalg.norm(nout, axis=1, keepdims=True) + 1e-12
    lin = srgb_to_linear(cols).astype(np.float32)
    # 회전 행렬 det = +1 이므로 감김 방향은 그대로
    assert np.linalg.det(M) > 0
    return out.astype(np.float32), nout.astype(np.float32), lin, I.astype(np.uint32), dict(length=float(out[:, 1].max() - out[:, 1].min()), ymin=float(out[:, 1].min()), ymax=float(out[:, 1].max()))

def write_glb(path, name, P, N, C, I, extras):
    idx = I.astype(np.uint16) if P.shape[0] < 65536 else I.astype(np.uint32)
    blobs = [P.tobytes(), N.tobytes(), C.tobytes(), idx.tobytes()]
    views, off, binb = [], 0, b''
    for k, bl in enumerate(blobs):
        pad = (-len(binb)) % 4; binb += b'\0' * pad
        views.append({'buffer': 0, 'byteOffset': len(binb), 'byteLength': len(bl), 'target': 34963 if k == 3 else 34962})
        binb += bl
    binb += b'\0' * ((-len(binb)) % 4)
    j = {
        'asset': {'version': '2.0', 'generator': 'cheonharo weapon builder'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0, 'extras': extras}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'COLOR_0': 2}, 'indices': 3, 'material': 0}]}],
        'materials': [{'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': extras['metalness'], 'roughnessFactor': extras['roughness']}}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(P), 'type': 'VEC3', 'min': P.min(0).tolist(), 'max': P.max(0).tolist()},
            {'bufferView': 1, 'componentType': 5126, 'count': len(N), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5126, 'count': len(C), 'type': 'VEC3'},
            {'bufferView': 3, 'componentType': 5123 if idx.dtype == np.uint16 else 5125, 'count': idx.size, 'type': 'SCALAR'},
        ],
        'bufferViews': views,
        'buffers': [{'byteLength': len(binb)}],
    }
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(binb)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A)); fh.write(js)
        fh.write(struct.pack('<II', len(binb), 0x004E4942)); fh.write(binb)

if __name__ == '__main__':
    import os
    os.makedirs(OUT, exist_ok=True)
    # 금속감: 원본 금속 · 거칠기 텍스처 평균(무기마다 한 값)
    for name, cfg in WEAPONS.items():
        P, N, C, I, ex = build(name, cfg)
        _, _, UV, _, imgs = load(SRC + cfg['src'] + '.glb')
        mr = np.asarray(imgs['mr'].convert('RGB').resize((256, 256))).astype(float) / 255
        ex['metalness'] = round(float(mr[..., 2].mean()), 2); ex['roughness'] = round(float(mr[..., 1].mean()), 2)
        write_glb(OUT + name + '.glb', name, P, N, C, I, ex)
        print(f"{name:18s} verts {len(P):6d} tris {len(I):6d} y {ex['ymin']:.2f}..{ex['ymax']:.2f} xz ±{np.abs(P[:,0]).max():.3f}/{np.abs(P[:,2]).max():.3f} metal {ex['metalness']} rough {ex['roughness']} size {os.path.getsize(OUT + name + '.glb')//1024}KB")
