#!/usr/bin/env python3
"""지도 그림(china-strategic-map.webp, 1152×648)의 픽셀 ↔ 실제 경위도 대응을 구한다.

그림은 남쪽에서 비스듬히 내려다본 회화식 지도라서, 해안선·섬·강 하구처럼 알아볼 수 있는
지점(기준점)을 골라 투영 변환(homography)을 최소제곱으로 맞춘다.
사용: python3 scripts/map/geo-fit.py  → 기준점 오차와 도시 좌표(%) 출력
"""
import json, sys
import numpy as np

# (그림 x, 그림 y) ← (경도, 위도)
CONTROL = [
    ((1000, 125), (122.70, 37.40), '산둥반도 끝 (청산두)'),
    ((950, 78),   (121.20, 38.80), '랴오둥반도 끝 (뤼순)'),
    ((815, 88),   (117.80, 39.00), '보하이만 서안 (톈진)'),
    ((885, 130),  (119.30, 37.15), '라이저우만 남안'),
    ((878, 200),  (119.40, 34.70), '하이저우만 (롄윈강)'),
    ((980, 292),  (121.80, 31.45), '장강 하구'),
    ((1000, 345), (122.00, 29.90), '저우산 곶 (닝보)'),
    ((1015, 458), (121.55, 25.30), '타이완 북단'),
    ((985, 545),  (120.80, 21.90), '타이완 남단'),
    ((560, 622),  (109.80, 19.20), '하이난섬 중심'),
    ((575, 595),  (110.20, 20.40), '레이저우반도 끝'),
    ((712, 548),  (114.20, 22.30), '주장 하구 (홍콩)'),
    ((400, 570),  (106.60, 20.60), '홍강 삼각주 해안'),
    # 내륙: 그림 속 강·분지·호수 (그림이 서쪽 내륙을 크게 눌러 그렸기 때문에 꼭 필요)
    ((395, 310),  (105.50, 30.20), '쓰촨 분지 중심'),
    ((470, 210),  (108.50, 34.40), '웨이수이 분지 (관중)'),
    ((688, 343),  (114.28, 30.58), '한수이·장강 합류 (우한)'),
    ((765, 368),  (116.25, 29.05), '포양호'),
    ((705, 185),  (114.80, 34.90), '황하가 북동으로 꺾이는 곳'),
]

def fit(points):
    A = []
    for (x, y), (lon, lat), _ in points:
        A.append([lon, lat, 1, 0, 0, 0, -x * lon, -x * lat, -x])
        A.append([0, 0, 0, lon, lat, 1, -y * lon, -y * lat, -y])
    _, _, vt = np.linalg.svd(np.array(A, dtype=float))
    return vt[-1].reshape(3, 3) / vt[-1][-1]

def project_h(H, lon, lat):
    v = H @ np.array([lon, lat, 1.0])
    return v[0] / v[2], v[1] / v[2]

class Mapper:
    """투영 변환 + 기준점 잔차를 메우는 thin-plate spline. 기준점에서는 그림 위치와 정확히 일치한다."""
    def __init__(self, points, smoothing=0.0):
        self.H = fit(points)
        src = np.array([project_h(self.H, lon, lat) for _, (lon, lat), _ in points])
        dst = np.array([xy for xy, _, _ in points], dtype=float)
        self.src = src
        n = len(src)
        K = self._k(src, src) + smoothing * np.eye(n)
        P = np.hstack([np.ones((n, 1)), src])
        A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = P; A[n:, :n] = P.T
        b = np.zeros((n + 3, 2)); b[:n] = dst - src
        self.w = np.linalg.solve(A, b)
    @staticmethod
    def _k(a, b):
        r = np.linalg.norm(a[:, None, :] - b[None, :, :], axis=2)
        with np.errstate(divide='ignore', invalid='ignore'):
            k = r ** 2 * np.log(r)
        return np.nan_to_num(k)
    def __call__(self, lon, lat):
        p = np.array([project_h(self.H, lon, lat)])
        n = len(self.src)
        d = self._k(p, self.src) @ self.w[:n] + np.hstack([np.ones((1, 1)), p]) @ self.w[n:]
        return float(p[0, 0] + d[0, 0]), float(p[0, 1] + d[0, 1])

def project(H, lon, lat):
    return project_h(H, lon, lat)

# 삼국시대 치소(군·현 중심) 위치 — 오늘날 경위도 (경도, 위도)
CITIES = {
    'yuzhang': (115.89, 28.68),  # 豫章郡 南昌
    'linhai': (121.13, 28.85),  # 臨海郡 章安 (臨海)
    'qichun': (115.43, 30.23),  # 蘄春郡 蘄春
    'bajun': (106.55, 29.56),  # 巴郡 江州 (重慶)
    'baxi': (105.97, 31.58),  # 巴西郡 閬中
    'shangdang': (113.12, 36.2),  # 上黨郡 (長治)
    'hejian': (116.1, 38.44),  # 河間國 樂成
    'chengdu': (104.07, 30.67),    # 成都
    'xindu': (104.16, 30.82),      # 新都縣 (게임 이름: 광한)
    'fucheng': (104.73, 31.47),    # 涪縣 (綿陽)
    'hanzhong': (107.03, 33.07),   # 南鄭
    'badong': (109.47, 31.02),     # 魚復 / 永安 (奉節)
    'jianning': (103.80, 25.50),   # 味縣 (曲靖)
    'yunnan': (100.55, 25.47),     # 雲南縣 (祥雲)
    'yongchang': (99.17, 25.12),   # 永昌郡 不韋 (바오산)
    'jiaozhi': (106.07, 21.06),    # 龍編 (박닌)
    'nanhai': (113.27, 23.13),     # 番禺 (廣州)
    'shixing': (113.60, 24.81),    # 曲江 (韶關)
    'guiyang': (113.03, 25.78),    # 郴縣
    'lingling': (111.60, 26.42),   # 泉陵 (永州)
    'changsha': (112.98, 28.20),   # 臨湘
    'wuling': (111.69, 29.04),     # 臨沅 (常德)
    'jiangling': (112.19, 30.35),  # 江陵
    'yiling': (111.29, 30.70),     # 夷陵 (宜昌)
    'jiangxia': (114.28, 30.55),   # 夏口 (武漢)
    'xiangyang': (112.14, 32.03),  # 襄陽
    'xinye': (112.36, 32.52),      # 新野
    'wancheng': (112.53, 33.00),   # 宛 (南陽)
    'shangyong': (110.23, 32.23),  # 上庸 (竹山)
    'xuchang': (113.82, 34.03),    # 許 (許昌)
    'luoyang': (112.62, 34.72),    # 漢魏 洛陽城
    'chenliu': (114.68, 34.68),    # 陳留
    'puyang': (115.03, 35.70),     # 濮陽
    'ye': (114.58, 36.33),         # 鄴
    'jinyang': (112.48, 37.72),    # 晉陽
    'pingyuan': (116.43, 37.17),   # 平原
    'bohai': (116.70, 38.04),      # 渤海郡 南皮
    'beihai': (118.84, 36.74),     # 劇縣 (北海國)
    'langya': (118.35, 35.07),     # 開陽 (臨沂)
    'xiapi': (117.96, 34.17),      # 下邳
    'guangling': (119.43, 32.39),  # 廣陵 (揚州)
    'jianye': (118.78, 32.05),     # 建業 (南京)
    'wujun': (120.62, 31.30),      # 吳縣 (蘇州)
    'kuaiji': (120.58, 30.00),     # 山陰 (紹興)
    'jianan': (119.30, 26.08),     # 建安郡 東冶·侯官 (福州) 해안
    'hefei': (117.23, 31.82),      # 合肥
    'shouchun': (116.78, 32.58),   # 壽春
    'lujiang': (117.27, 31.25),    # 舒 (廬江郡)
    'jiujiang': (115.98, 29.71),   # 柴桑 (오늘날 九江)
    'poyang': (116.68, 29.00),     # 鄱陽
    'changan': (108.87, 34.30),    # 長安
    'meixian': (107.76, 34.27),    # 郿縣
    'anding': (107.20, 35.68),     # 臨涇 (安定郡)
    'tianshui': (105.33, 34.73),   # 冀縣 (天水郡)
    'wuwei': (102.64, 37.93),      # 姑臧 (武威)
}

# 주(州) 이름표 위치 (경도, 위도)
REGIONS = {
    'liangzhou': ('양주', '涼州', 102.0, 37.0),
    'yongzhou': ('옹주', '雍州', 107.6, 35.2),
    'bingzhou': ('병주', '幷州', 112.3, 38.4),
    'jizhou': ('기주', '冀州', 115.6, 37.6),
    'qingzhou': ('청주', '青州', 118.0, 37.0),
    'sili': ('사례', '司隷', 111.6, 34.9),
    'yanzhou': ('연주', '兗州', 116.2, 35.6),
    'yuzhou': ('예주', '豫州', 114.9, 33.6),
    'xuzhou': ('서주', '徐州', 118.6, 34.0),
    'yangzhou': ('양주', '揚州', 118.0, 30.4),
    'jingzhou': ('형주', '荊州', 111.8, 29.6),
    'yizhou': ('익주', '益州', 105.0, 29.0),
    'jiaozhou': ('교주', '交州', 110.0, 23.2),
}

if __name__ == '__main__':
    m = Mapper(CONTROL)
    # 하나씩 빼고 맞춰 본 오차(leave-one-out): 기준점이 아닌 곳에서의 정확도 추정
    loo = []
    for i, ((x, y), (lon, lat), name) in enumerate(CONTROL):
        mi = Mapper(CONTROL[:i] + CONTROL[i + 1:])
        px, py = mi(lon, lat)
        loo.append(((px - x) ** 2 + (py - y) ** 2) ** .5)
        print(f'{name:22s} 제외 시 오차 {loo[-1]:5.1f}px', file=sys.stderr)
    print(f'leave-one-out 평균 {np.mean(loo):.1f}px · 중앙값 {np.median(loo):.1f}px', file=sys.stderr)
    def pct(lon, lat):
        x, y = m(lon, lat)
        return round(x / 1152 * 100, 1), round(y / 648 * 100, 1)
    cities = {k: list(pct(lon, lat)) for k, (lon, lat) in CITIES.items()}
    regions = {k: [ko, zh, *pct(lon, lat)] for k, (ko, zh, lon, lat) in REGIONS.items()}
    print(json.dumps({'cities': cities, 'regions': regions}, ensure_ascii=False))
