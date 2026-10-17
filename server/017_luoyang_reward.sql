ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `luoyangBoxes` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `lastLuoyangReward` int NULL;
