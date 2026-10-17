-- 낙양 강화석: 주간 낙양전 승리 진영 유저에게 주 1개 지급, 신화장비는 이것으로만 강화한다.
ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `mythicStones` int NOT NULL DEFAULT 0;
