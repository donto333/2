-- 2026.10.17: 유저 연맹(길드). 연맹 · 연맹원 · 가입 신청/초대 · 활동 기록 · 채팅 · 주간 정산.
-- 자주 바뀌는 세부 값(문장 · 공지 · 기술 · 목표 · 주간 기여, 연맹원 장부 · 받을 보상)은 data(JSON)에 둔다.
CREATE TABLE IF NOT EXISTS game_guilds (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(32) NOT NULL,
  `faction` varchar(16) NOT NULL,
  `level` int NOT NULL DEFAULT 1,
  `data` mediumtext NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `game_guilds_name` (`name`),
  KEY `game_guilds_faction` (`faction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_guild_members (
  `userId` int NOT NULL PRIMARY KEY,
  `guildId` int NULL,
  `data` mediumtext NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `game_guild_members_guild` (`guildId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_guild_requests (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `guildId` int NOT NULL,
  `userId` int NOT NULL,
  `kind` varchar(8) NOT NULL,
  `data` text NOT NULL,
  `createdAt` bigint NOT NULL,
  KEY `game_guild_requests_guild` (`guildId`),
  KEY `game_guild_requests_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_guild_logs (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `guildId` int NOT NULL,
  `at` bigint NOT NULL,
  `text` varchar(255) NOT NULL,
  KEY `game_guild_logs_guild` (`guildId`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_guild_chat (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `guildId` int NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `role` varchar(8) NOT NULL DEFAULT 'member',
  `text` varchar(255) NOT NULL,
  `at` bigint NOT NULL,
  KEY `game_guild_chat_guild` (`guildId`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_guild_weeks (
  `weekKey` varchar(16) NOT NULL PRIMARY KEY,
  `data` mediumtext NOT NULL,
  `settledAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 연맹 게시판: 게시판 이름에 '연맹:<연맹 번호>'를 쓴다
ALTER TABLE game_board_posts MODIFY COLUMN `board` varchar(24) NOT NULL;
