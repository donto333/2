# 구운 기수 메시(JSON, base64 배열) + 원본 GLB 텍스처 → 양자화 GLB(KHR_mesh_quantization)
import sys, json, base64, struct, io
import numpy as np
from PIL import Image
src_glb, baked_json, out_path = sys.argv[1:4]
tex_base = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
tex_norm = int(sys.argv[5]) if len(sys.argv) > 5 else 512

d = json.load(open(baked_json))
P = np.frombuffer(base64.b64decode(d['P']), np.float32).reshape(-1, 3)
N = np.frombuffer(base64.b64decode(d['N']), np.float32).reshape(-1, 3)
U = np.frombuffer(base64.b64decode(d['U']), np.float32).reshape(-1, 2)
J = np.frombuffer(base64.b64decode(d['J']), np.uint16).reshape(-1, 4)
W = np.frombuffer(base64.b64decode(d['W']), np.float32).reshape(-1, 4)
I = np.frombuffer(base64.b64decode(d['I']), np.uint32)
n = len(P)

# 원본 텍스처
b = open(src_glb, 'rb').read(); l = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + l]); binstart = 20 + l + 8
def image(idx):
    im = g['images'][idx]; bv = g['bufferViews'][im['bufferView']]; o = binstart + bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(b[o:o + bv['byteLength']]))
mat = g['materials'][0]
def tex_image(entry):
    return image(g['textures'][entry['index']]['source'])
def jpeg(im, size, q):
    im = im.convert('RGB').resize((size, size), Image.LANCZOS); buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q, optimize=True); return buf.getvalue()
base_jpg = jpeg(tex_image(mat['pbrMetallicRoughness']['baseColorTexture']), tex_base, 84)
norm_jpg = jpeg(tex_image(mat['normalTexture']), tex_norm, 82) if tex_norm and 'normalTexture' in mat else None

# 양자화
lo, hi = P.min(0), P.max(0); ext = np.maximum(hi - lo, 1e-6)
center = (lo + hi) / 2; half = ext / 2
Pq = np.round((P - center) / half * 32767).astype(np.int16)
Pq4 = np.zeros((n, 4), np.int16); Pq4[:, :3] = Pq
Nn = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
Nq4 = np.zeros((n, 4), np.int8); Nq4[:, :3] = np.round(Nn * 127).astype(np.int8)
Uq = np.round(np.clip(U, 0, 1) * 65535).astype(np.uint16)
Jq = J.astype(np.uint8)
Wq = np.round(W * 255).astype(np.int32)
# 합이 255가 되도록 첫 칸에서 맞춘다
Wq[:, 0] += 255 - Wq.sum(1); Wq = np.clip(Wq, 0, 255).astype(np.uint8)
Iq = I.astype(np.uint16) if n < 65536 else I

chunks, views, accessors = [], [], []
def add(data, target=None, stride=None):
    off = sum(len(c) for c in chunks); pad = (-off) % 4
    if pad: chunks.append(b'\0' * pad); off += pad
    chunks.append(data); v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    if stride: v['byteStride'] = stride
    views.append(v); return len(views) - 1
def acc(view, ctype, count, typ, normalized=False, mn=None, mx=None):
    a = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
    if normalized: a['normalized'] = True
    if mn is not None: a['min'] = mn; a['max'] = mx
    accessors.append(a); return len(accessors) - 1
ARR, ELEM = 34962, 34963
attrs = {
  'POSITION': acc(add(Pq4.tobytes(), ARR, 8), 5122, n, 'VEC3', True, [-1, -1, -1], [1, 1, 1]),
  'NORMAL': acc(add(Nq4.tobytes(), ARR, 4), 5120, n, 'VEC3', True),
  'TEXCOORD_0': acc(add(Uq.tobytes(), ARR), 5123, n, 'VEC2', True),
  'JOINTS_0': acc(add(Jq.tobytes(), ARR), 5121, n, 'VEC4'),
  'WEIGHTS_0': acc(add(Wq.tobytes(), ARR), 5121, n, 'VEC4', True),
}
ind = acc(add(Iq.tobytes(), ELEM), 5123 if Iq.dtype == np.uint16 else 5125, len(Iq), 'SCALAR')
images = [{'bufferView': add(base_jpg), 'mimeType': 'image/jpeg'}]
textures = [{'source': 0, 'sampler': 0}]
material = {'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.25, 'roughnessFactor': 0.7}, 'doubleSided': True}
if norm_jpg:
    images.append({'bufferView': add(norm_jpg), 'mimeType': 'image/jpeg'}); textures.append({'source': 1, 'sampler': 0}); material['normalTexture'] = {'index': 1}
binary = b''.join(chunks); binary += b'\0' * ((-len(binary)) % 4)
gltf = {
  'asset': {'version': '2.0', 'generator': 'cheonharo-rider-bake (Tripo source)'},
  'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
  'scene': 0, 'scenes': [{'nodes': [0]}],
  'nodes': [{'mesh': 0, 'translation': center.tolist(), 'scale': half.tolist()}],
  'meshes': [{'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}],
  'materials': [material], 'textures': textures, 'images': images, 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
  'buffers': [{'byteLength': len(binary)}], 'bufferViews': views, 'accessors': accessors,
}
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binary), 0x004E4942) + binary
open(out_path, 'wb').write(out)
print(out_path, n, 'verts', len(out) // 1024, 'KB')
