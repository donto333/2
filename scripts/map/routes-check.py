#!/usr/bin/env python3
"""진군로(server/city-routes.json) 점검: 대칭·연결성·선 교차·수도 출구·세력 균형.
사용: python3 scripts/map/routes-check.py
"""
import json, re, itertools, collections, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
routes = json.loads((ROOT / 'server/city-routes.json').read_text(encoding='utf8'))
edges = [tuple(e) for e in routes['edges']]
src = (ROOT / 'src/ui/strategy-ui.ts').read_text(encoding='utf8')
pos = {m[0]: (float(m[1]), float(m[2])) for m in re.findall(r"(\w+): \{ x: ([\d.]+), y: ([\d.]+) \}", src[src.index('CITY_MAP_POSITIONS'):src.index('MAP_REGION_LABELS')])}
names = dict(re.findall(r"\{ id: '(\w+)', name: '([^']+)'", (ROOT / 'src/game/strategy.ts').read_text(encoding='utf8')))
ISOLATED = set(routes.get('isolated', []))
CAPITALS = {'촉한': 'chengdu', '위나라': 'ye', '오나라': 'jianye'}
AI_CAPITAL = 'xiangyang'

problems = []
adj = collections.defaultdict(set)
for a, b in edges:
    if a not in pos or b not in pos: problems.append(f'알 수 없는 도시: {a}-{b}')
    if b in adj[a]: problems.append(f'중복: {a}-{b}')
    adj[a].add(b); adj[b].add(a)
for c in pos:
    if c not in adj and c not in ISOLATED: problems.append(f'연결 없음: {names.get(c, c)}')

# 선 교차 (화면 비율 16:9 반영)
def P(c): x, y = pos[c]; return (x * 16 / 100, y * 9 / 100)
def cross(p1, p2, p3, p4):
    def o(a, b, c): return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
    return (o(p1,p2,p3) * o(p1,p2,p4) < 0) and (o(p3,p4,p1) * o(p3,p4,p2) < 0)
crossings = [(e, f) for e, f in itertools.combinations(edges, 2) if not set(e) & set(f) and cross(P(e[0]), P(e[1]), P(f[0]), P(f[1]))]
for e, f in crossings: problems.append(f'교차: {names[e[0]]}-{names[e[1]]} × {names[f[0]]}-{names[f[1]]}')

# 연결성
seen, stack = set(), ['chengdu']
while stack:
    c = stack.pop()
    if c in seen: continue
    seen.add(c); stack.extend(adj[c])
missing = set(pos) - seen - ISOLATED
if missing: problems.append('닿을 수 없는 도시: ' + ', '.join(names[c] for c in missing))

def bfs(start):
    d = {start: 0}; q = collections.deque([start])
    while q:
        c = q.popleft()
        for n in adj[c]:
            if n not in d: d[n] = d[c] + 1; q.append(n)
    return d
dist = {f: bfs(c) for f, c in CAPITALS.items()}
print('수도 출구:', ', '.join(f'{f} {names[c]} {len(adj[c])}' for f, c in CAPITALS.items()))
print('양양(중립 AI 수도)까지:', ', '.join(f'{f} {dist[f].get(AI_CAPITAL)}' for f in CAPITALS))
share = collections.Counter(); contested = []; zone = collections.defaultdict(list)
for c in pos:
    if c in ISOLATED or c in CAPITALS.values() or c == AI_CAPITAL: continue
    ds = {f: dist[f].get(c, 99) for f in CAPITALS}
    best = min(ds.values()); winners = [f for f, d in ds.items() if d == best]
    if len(winners) == 1: share[winners[0]] += 1; zone[winners[0]].append(f'{names[c]}{best}')
    else: contested.append(names[c])
print('가장 먼저 닿는 도시 수:', dict(share), '| 동률:', len(contested), contested)
if '-v' in sys.argv:
    for f in CAPITALS: print(f'  {f}:', ' '.join(zone[f]))
for f, c in CAPITALS.items():
    ring = sorted(n for n, d in dist[f].items() if d <= 2 and n != c)
    print(f'  {f} 2걸음 안: {len(ring)}곳')
print(f'간선 {len(edges)}개 · 최대 차수 {max(len(v) for v in adj.values())} · 최소 차수 {min(len(adj[c]) for c in adj)}')
print('문제:', len(problems)); [print(' -', p) for p in problems]
sys.exit(1 if problems else 0)
