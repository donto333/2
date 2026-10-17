-- 2026.10.17: 회계와 남해 사이 해안 도시 건안(jianan) 추가. 서버는 시작할 때 빠진 도시를 스스로 넣지만, 수동 배포용으로 같은 내용을 둔다.
INSERT IGNORE INTO faction_territory_states (cityId, owner, conquestProgress, defense, prosperity, version)
VALUES ('jianan', '중립', 0, 10000, 44, 1);
