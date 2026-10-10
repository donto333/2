ALTER TABLE game_board_posts
  ADD COLUMN passwordSalt CHAR(32) NULL AFTER authorFaction,
  ADD COLUMN passwordHash CHAR(128) NULL AFTER passwordSalt;
