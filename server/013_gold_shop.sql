ALTER TABLE `game_account_states`
  ADD COLUMN IF NOT EXISTS `gold` int unsigned NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `prelaunchGoldDayKey` varchar(16) NULL;
