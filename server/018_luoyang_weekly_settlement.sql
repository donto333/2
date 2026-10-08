ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `luoyangRewardWeekKey` varchar(16) NULL;

CREATE TABLE IF NOT EXISTS luoyang_weekly_results (
  `weekKey` varchar(16) NOT NULL,
  `winnerFaction` enum('촉한','위나라','오나라') NULL,
  `settledAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`weekKey`)
);
