import json, struct, io, numpy as np
from PIL import Image
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def read_glb(p):
    b = open(p,'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20+jl]); off = 20+jl
    bl = struct.unpack_from('<I', b, off)[0]
    return j, b[off+8:off+8+bl]
def acc(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
    start = bv.get('byteOffset',0) + a.get('byteOffset',0)
    stride = bv.get('byteStride', 0)
    if stride and stride != n*dt.itemsize:
        raw = np.frombuffer(bin_, np.uint8, count=stride*a['count'], offset=start).reshape(a['count'], stride)
        return raw[:, :n*dt.itemsize].copy().view(dt).reshape(a['count'], n)
    arr = np.frombuffer(bin_, dt, count=a['count']*n, offset=start)
    return arr.reshape(a['count'], n) if n > 1 else arr
def image(j, bin_, i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    s = bv.get('byteOffset',0)
    return Image.open(io.BytesIO(bin_[s:s+bv['byteLength']]))
def load(p):
    j, b = read_glb(p)
    pr = j['meshes'][0]['primitives'][0]
    P = acc(j,b,pr['attributes']['POSITION']).astype(np.float64)
    N = acc(j,b,pr['attributes']['NORMAL']).astype(np.float64)
    UV = acc(j,b,pr['attributes']['TEXCOORD_0']).astype(np.float64)
    I = acc(j,b,pr['indices']).astype(np.int64).reshape(-1,3)
    t = j['nodes'][0].get('translation'); 
    if t: P = P + np.array(t)
    mat = j['materials'][0]; pbr = mat['pbrMetallicRoughness']
    tex = lambda k: j['textures'][k]['source']
    imgs = {'base': image(j,b,tex(pbr['baseColorTexture']['index'])),
            'mr': image(j,b,tex(pbr['metallicRoughnessTexture']['index'])),
            'normal': image(j,b,tex(mat['normalTexture']['index']))}
    return P, N, UV, I, imgs
