# 전용 기수 모델 굽기 (Tripo → 기마 모델)

Tripo에서 받은 T자세 모델(mixamo 뼈대)을 기마 모델(`cavalry.glb`)의 말 탄 기본 자세로 굽고, 기마 뼈 번호로 다시 묶어 `public/assets/models/riders/<id>.glb`로 저장합니다.

1. `bake.js`(브라우저, three.js): 뼈마다 원본 방향 → 기마 기수 방향 회전(몸통은 두 축 맞춤, 팔다리는 최단 회전)으로 정점을 옮기고, 가중치를 같은 이름의 기마 뼈로 옮깁니다. 뼈대 없는 모델은 비슷한 모델(donor)의 가장 가까운 점에서 가중치를 빌립니다.
2. `assemble.py`: 위치 int16 · 법선 int8 · UV uint16 · 뼈 uint8로 양자화(KHR_mesh_quantization)하고 텍스처를 줄여(기본색 1024 · 법선 512 JPEG) GLB로 묶습니다.

`tianming-map.txt`: 2026.10.17 천명 무장 16명 원본 파일 ↔ 무장 id. 셋째 칸이 있으면 그 모델에서 가중치를 빌린다(유비: 뼈대 없음, 조운: 가중치가 전부 엉덩이뼈). 역바인드 뼈대가 Y축으로 돌아간 파일은 bake.js가 자동으로 바로잡는다.
