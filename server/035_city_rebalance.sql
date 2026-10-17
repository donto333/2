-- 2026.10.17: 도시 단계 재배치(수도 옆 1단계 · 2걸음 2단계 · 그 밖 3단계 · 대도시 4단계 · 변방 2단계)와 새 중립 도시 7곳.
-- 서버는 시작할 때 빠진 도시를 넣고, 공성 진전이 없는 중립 도시의 성벽을 새 최대치로 맞춘다(아래는 수동 배포용 새 도시 행).
INSERT IGNORE INTO faction_territory_states (cityId, owner, conquestProgress, defense, prosperity, version)
VALUES ('yuzhang', '중립', 0, 20000, 62, 1), ('linhai', '중립', 0, 20000, 54, 1), ('qichun', '중립', 0, 20000, 52, 1),
       ('bajun', '중립', 0, 20000, 76, 1), ('baxi', '중립', 0, 20000, 66, 1), ('shangdang', '중립', 0, 10000, 52, 1), ('hejian', '중립', 0, 20000, 54, 1);
