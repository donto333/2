CREATE TABLE IF NOT EXISTS `game_account_states` (
  `userId` int NOT NULL,
  `honor` int unsigned NOT NULL DEFAULT 2480,
  `silver` int unsigned NOT NULL DEFAULT 12500,
  `manuals` int unsigned NOT NULL DEFAULT 180,
  `wins` int unsigned NOT NULL DEFAULT 7,
  `battleScore` int unsigned NOT NULL DEFAULT 18460,
  `grain` int unsigned NOT NULL DEFAULT 18200,
  `wood` int unsigned NOT NULL DEFAULT 8200,
  `iron` int unsigned NOT NULL DEFAULT 3900,
  `influence` int unsigned NOT NULL DEFAULT 2480,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`)
);
