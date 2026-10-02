ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `incomeCollectedAt` varchar(32) NULL,
  ADD COLUMN IF NOT EXISTS `conquestAt` varchar(32) NULL;
