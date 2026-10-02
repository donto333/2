ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `factionWarScore` int NOT NULL DEFAULT 0;
