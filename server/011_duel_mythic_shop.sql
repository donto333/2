ALTER TABLE `game_account_states`
  ADD COLUMN IF NOT EXISTS `mythicFragments` int unsigned NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `duelAttemptsToday` int unsigned NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `duelDayKey` varchar(16) NULL;
