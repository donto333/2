ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `faction` enum('촉한','위나라','오나라') NOT NULL DEFAULT '촉한';

CREATE TABLE IF NOT EXISTS faction_territory_states (
  `cityId` varchar(64) NOT NULL,
  `owner` enum('촉한','위나라','오나라','중립') NOT NULL,
  `conquestProgress` int NOT NULL DEFAULT 0,
  `defense` int NOT NULL DEFAULT 50,
  `prosperity` int NOT NULL DEFAULT 50,
  `version` int NOT NULL DEFAULT 1,
  `updatedByUserId` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cityId`),
  KEY `faction_territory_updated_by_idx` (`updatedByUserId`),
  CONSTRAINT `faction_territory_updated_by_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES users (`id`) ON DELETE SET NULL
);
