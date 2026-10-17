CREATE TABLE IF NOT EXISTS game_board_posts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  board ENUM('전체','촉한','위나라','오나라') NOT NULL,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  authorUserId INT UNSIGNED NOT NULL,
  authorName VARCHAR(64) NOT NULL,
  authorFaction ENUM('촉한','위나라','오나라') NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_game_board_posts_board_created (board, createdAt),
  INDEX idx_game_board_posts_author (authorUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
