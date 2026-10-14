-- 2군·3군 편성(1군은 formationData)
ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `squadData` mediumtext NULL;

-- 주간 레이드: 주차별 유저 누적 피해·도전 기록(월요일 0시 KST 초기화)
CREATE TABLE IF NOT EXISTS raid_weekly_scores (
  `weekKey` varchar(16) NOT NULL,
  `userId` int NOT NULL,
  `displayName` varchar(128) NOT NULL DEFAULT '',
  `totalDamage` bigint NOT NULL DEFAULT 0,
  `bestDamage` bigint NOT NULL DEFAULT 0,
  `attempts` int NOT NULL DEFAULT 0,
  `dayKey` varchar(16) NULL,
  `dayAttempts` int NOT NULL DEFAULT 0,
  `pendingToken` varchar(64) NULL,
  `pendingPower` int NOT NULL DEFAULT 0,
  `rewardClaimed` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`weekKey`, `userId`),
  KEY `raid_week_damage` (`weekKey`, `totalDamage`)
);
