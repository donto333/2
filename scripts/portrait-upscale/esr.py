# Real-ESRGAN(realesr-general-x4v3, SRVGGNetCompact)을 torch 없이 numpy로 돌린다.
import zipfile, pickle, numpy as np, sys, os, time
from PIL import Image, ImageFilter

def load_pth(path):
    z = zipfile.ZipFile(path)
    prefix = z.namelist()[0].split('/')[0]
    class Storage:
        def __init__(self, key, dtype): self.key, self.dtype = key, dtype
    DT = {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'LongStorage': np.int64}
    def rebuild(storage, offset, size, stride, *a):
        raw = np.frombuffer(z.read(f'{prefix}/data/{storage.key}'), dtype=storage.dtype)
        n = int(np.prod(size)) if size else 1
        arr = raw[offset:offset + n] if all(s >= 0 for s in stride) else raw
        return np.lib.stride_tricks.as_strided(raw[offset:], shape=size, strides=[s * raw.itemsize for s in stride]).copy() if size else raw[offset:offset+1].copy()
    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if name == '_rebuild_tensor_v2': return rebuild
            if mod == 'torch' and name.endswith('Storage'): return name
            if mod == 'collections' and name == 'OrderedDict':
                import collections; return collections.OrderedDict
            if name == '_rebuild_parameter': return lambda data, *a: data
            return super().find_class(mod, name)
        def persistent_load(self, pid):
            _, stype, key, _loc, _n = pid
            return Storage(key, DT.get(stype if isinstance(stype, str) else stype, np.float32))
    return U(z.open(f'{prefix}/data.pkl')).load()

sd = load_pth('general-x4v3.pth')
sd = sd.get('params', sd.get('params_ema', sd))
convs = sorted({int(k.split('.')[1]) for k in sd if k.startswith('body.') and k.endswith('weight') and sd[k].ndim == 4})

def conv3(x, w, b):
    # x: H,W,Cin  w: Cout,Cin,3,3
    H, W, C = x.shape
    p = np.pad(x, ((1, 1), (1, 1), (0, 0)))
    out = np.zeros((H * W, w.shape[0]), np.float32)
    for dy in range(3):
        for dx in range(3):
            out += p[dy:dy + H, dx:dx + W].reshape(-1, C) @ w[:, :, dy, dx].T
    return (out + b).reshape(H, W, -1)

def run(img):
    x = np.asarray(img, np.float32) / 255.0
    h = x
    for i, idx in enumerate(convs):
        h = conv3(h, sd[f'body.{idx}.weight'].astype(np.float32), sd[f'body.{idx}.bias'].astype(np.float32))
        pk = f'body.{idx + 1}.weight'
        if pk in sd and sd[pk].ndim == 1:
            a = sd[pk].astype(np.float32)
            h = np.where(h >= 0, h, h * a)
    H, W, _ = x.shape
    r = 4
    out = h.reshape(H, W, 3, r, r).transpose(0, 3, 1, 4, 2).reshape(H * r, W * r, 3)
    out += np.repeat(np.repeat(x, r, 0), r, 1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8))

if __name__ == '__main__':
    src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
    os.makedirs(dst, exist_ok=True)
    for n in sys.argv[4:]:
        t = time.time()
        im = Image.open(os.path.join(src, n)).convert('RGB')
        up = run(im)
        hgt = round(up.height * width / up.width)
        up = up.resize((width, hgt), Image.LANCZOS)
        # 지나치게 매끈해지지 않게 원본 결(확대본)을 조금 섞고 살짝 또렷하게
        base = im.resize((width, hgt), Image.LANCZOS)
        up = Image.blend(up, base, 0.18).filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=2))
        up.save(os.path.join(dst, n), 'WEBP', quality=82, method=6)
        print(n, up.size, round(time.time() - t, 1), os.path.getsize(os.path.join(dst, n)), flush=True)
