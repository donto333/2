-- 2026.10.17: 오나라 신도군(치소 시신, shixin) 자리에 1단계 중립 도시 '신도' 추가. 익주의 옛 신도(xindu)는 이름만 '광한'으로 바뀐다(id 그대로).
INSERT IGNORE INTO faction_territory_states (cityId, owner, conquestProgress, defense, prosperity, version)
VALUES ('shixin', '중립', 0, 10000, 45, 1);
