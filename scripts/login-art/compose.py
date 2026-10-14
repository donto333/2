# 로그인 화면 대표 그림: 다섯 무장 초상을 가로로 이어 붙이고 경계를 부드럽게 섞는다(가운데 여포가 가장 크게).
# python3 scripts/login-art/compose.py  →  public/assets/login/keyart.webp
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
SRC = 'public/assets/generals-realistic-webp/'
W, H = 1440, 560
order = [('zhuge-liang', 1.0), ('guan-yu', 1.04), ('lu-bu', 1.1), ('cao-cao', 1.04), ('sun-quan', 1.0)]
# 바탕: 흐리게 한 황혼의 관문(초상이 닿지 않는 위쪽 빈틈을 채운다)
gate = Image.open('public/assets/battlefield/huanghun-gate.webp').convert('RGB')
gate = gate.crop((0, 0, gate.width, int(gate.width * H / W))).resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(6))
base_w = 0.03
canvas = np.asarray(gate, np.float32) / 255 * base_w
weight = np.full((H, W, 1), base_w, np.float32)
slot = W / len(order)
for i, (name, zoom) in enumerate(order):
    im = Image.open(SRC + name + '.webp').convert('RGB')
    # 머리~가슴: 위쪽 62%를 잘라 배너 높이에 맞춘다
    crop = im.crop((0, int(im.height * 0.03), im.width, int(im.height * 0.66)))
    h = int(H * zoom)
    w = int(crop.width * h / crop.height)
    crop = crop.resize((w, h), Image.LANCZOS)
    arr = np.asarray(crop, np.float32) / 255
    cx = int(slot * (i + 0.5))
    x0 = cx - w // 2
    y0 = H - h  # 아래 맞춤
    # 가로 가장자리로 갈수록 옅어지는 가중치(옆 초상과 섞인다)
    xs = np.linspace(-1, 1, w)
    m = np.clip(1 - np.abs(xs) ** 2.2, 0, 1) ** 1.4
    ys = np.clip(np.arange(h) / (h * 0.08), 0, 1)[:, None]  # 위 가장자리도 부드럽게
    m = (m[None, :] * ys * (1.6 if name == 'lu-bu' else 1.0))[..., None]
    xa, xb = max(0, x0), min(W, x0 + w)
    ya, yb = max(0, y0), min(H, y0 + h)
    sub = arr[ya - y0:yb - y0, xa - x0:xb - x0]
    mw = m[ya - y0:yb - y0, xa - x0:xb - x0]
    canvas[ya:yb, xa:xb] += sub * mw
    weight[ya:yb, xa:xb] += mw
img = canvas / np.maximum(weight, 1e-4)
# 색감: 따뜻하게 살짝, 가장자리 어둡게, 아래는 패널 색으로 녹아든다
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vig = 1 - 0.55 * ((xx / W - 0.5) * 2) ** 2
img *= vig[..., None]
warm = np.array([1.05, 0.98, 0.88], np.float32)
img = np.clip(img * warm, 0, 1)
panel = np.array([52, 30, 17], np.float32) / 255
fade = np.clip((yy / H - 0.55) / 0.45, 0, 1) ** 1.6
img = img * (1 - fade[..., None]) + panel * fade[..., None]
top = np.clip(1 - yy / (H * 0.25), 0, 1) ** 2 * 0.35
img = img * (1 - top[..., None]) + np.array([0.1, 0.06, 0.03]) * top[..., None]
out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
out.save('public/assets/login/keyart.webp', quality=86, method=6)
# 화면 전체 배경: 황혼의 관문(선명하게, 크기만 줄여 가볍게)
bg = Image.open('public/assets/battlefield/huanghun-gate.webp').convert('RGB')
bg.save('public/assets/login/gate-backdrop.webp', quality=80, method=6)
print('ok', out.size)
