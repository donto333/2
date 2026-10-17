CREATE TABLE IF NOT EXISTS neutral_ai_battle_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  cityId VARCHAR(64) NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  attackerName VARCHAR(128) NOT NULL,
  attackerKind ENUM('user', 'ai') NOT NULL DEFAULT 'ai',
  defenderName VARCHAR(128) NOT NULL,
  won TINYINT(1) NOT NULL DEFAULT 0,
  damage INT NOT NULL DEFAULT 0,
  note TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY neutral_ai_battle_logs_city_time_idx (cityId, occurredAt)
);
