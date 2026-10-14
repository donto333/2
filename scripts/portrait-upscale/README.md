# 무장 사진 해상도 높이기

`esr.py`는 Real-ESRGAN(realesr-general-x4v3, BSD-3)을 torch 없이 numpy로 돌려 사진을 4배로 키운 뒤 지정 너비로 줄입니다.
원본 결이 너무 매끈해지지 않게 원본 확대본을 18% 섞고 살짝 또렷하게 합니다.

가중치: https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth (같은 폴더에 두고 실행)

    python3 esr.py <원본 폴더> <출력 폴더> 768 <파일 이름들...>

2026-10-14: public/assets/generals-realistic-webp 70장을 256×382 → 768×1146으로 바꿨습니다.
