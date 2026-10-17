-- 일일·주간 임무 진행(클라이언트가 저장, 보상은 금화가 아닌 일반 재화)
ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `missionData` mediumtext NULL;
