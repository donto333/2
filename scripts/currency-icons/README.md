# 재화 그림 만들기

`gen.py`가 재화 9종(금화·은전·옥패·영향력·식량·목재·철·병서·신화 조각)을 SVG로 그립니다(빛·질감 필터 포함).
브라우저(Chromium)로 256px PNG를 찍은 뒤 여백을 정리해 `public/assets/currency/*.webp`(128px)로 저장했습니다.
게임에서는 `src/ui/icons.ts`의 `icon()`이 재화 이름이면 이 webp를 씁니다.
