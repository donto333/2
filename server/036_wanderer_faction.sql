-- 2026.10.17: 네 번째 진영 '재야'(중립 진영 유저). 진영 · 도시 주인(낙양만) · 낙양 주간 승자 · 도시 피해 순위 · 게시판에 '재야'를 더한다.
ALTER TABLE game_account_states MODIFY COLUMN `faction` enum('촉한','위나라','오나라','재야') NOT NULL DEFAULT '촉한';
ALTER TABLE faction_territory_states MODIFY COLUMN `owner` enum('촉한','위나라','오나라','중립','재야') NOT NULL;
ALTER TABLE luoyang_weekly_results MODIFY COLUMN `winnerFaction` enum('촉한','위나라','오나라','재야') NULL;
ALTER TABLE city_damage_rankings MODIFY COLUMN `faction` enum('촉한','위나라','오나라','재야') NOT NULL;
ALTER TABLE game_board_posts MODIFY COLUMN `board` enum('전체','촉한','위나라','오나라','재야') NOT NULL;
ALTER TABLE game_board_posts MODIFY COLUMN `authorFaction` enum('촉한','위나라','오나라','재야') NOT NULL;
