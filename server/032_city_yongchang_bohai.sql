-- 2026.10.17: 운남 옆 영창(yongchang, 1단계) · 평원 위 발해(bohai, 2단계) 추가. 서버는 시작할 때 빠진 도시를 스스로 넣지만, 수동 배포용으로 같은 내용을 둔다.
INSERT IGNORE INTO faction_territory_states (cityId, owner, conquestProgress, defense, prosperity, version)
VALUES ('yongchang', '중립', 0, 10000, 40, 1), ('bohai', '중립', 0, 20000, 58, 1);
