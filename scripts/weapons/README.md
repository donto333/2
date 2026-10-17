# 무기 모델 변환

사용자 제공 무기 GLB(Tripo, 약 200만 삼각형 · 4K 텍스처)를 게임용으로 바꾼다 → `public/assets/models/weapons/*.glb`

1. gltfpack(meshoptimizer)으로 줄이기: `gltfpack -i 청강검.glb -o simp/청강검.glb -si 0.004 -vpf -vtf -vnf`
   (백우선 `-si 0.0035 -se 0.05 -sp`, 기병칼 `-si 0.0006 -se 0.05 -sp`)
2. `python3 build_weapons.py <출력 폴더>` — 축 정렬(손잡이 중심 = 원점, 날 = +Y, 넓은 면 = XY),
   게임 크기 맞춤(장병기 자루 끝 -0.9 ~ 머리 끝 1.7, 자루만 늘리고 머리 · 술은 비율 유지),
   색 텍스처 → 꼭짓점 색(COLOR_0, 선형). 금속감 · 거칠기는 노드 extras에 적는다.

| 파일 | 원본 | 쓰는 곳 |
|---|---|---|
| sword-qinggang | 청강검 | 칼을 쓰는 무장(조조 · 주유 · 일반 기마 무장) |
| fan-baiyu | 백우선 | 책사(제갈량 · 사마의 등) |
| glaive-qinglong | 청룡언월도 | 관우 · 관평 · 관흥 |
| halberd-fangtian | 방천화극 | 여포 · 장료 · 전위 |
| snake-zhangba | 장창사모 | 장비 · 장포 |
| blade-yanyue | 언월도 | 허저 · 서황 |
| saber-cavalry | 기병칼 | 기병 병사 |
