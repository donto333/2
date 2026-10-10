CREATE TABLE IF NOT EXISTS city_damage_rankings (
  cityId VARCHAR(64) NOT NULL,
  userId INT NOT NULL,
  faction ENUM('촉한','위나라','오나라') NOT NULL,
  displayName VARCHAR(128) NOT NULL,
  totalDamage BIGINT NOT NULL DEFAULT 0,
  battleCount INT NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cityId, userId),
  KEY city_damage_rankings_city_idx (cityId, totalDamage),
  CONSTRAINT city_damage_rankings_user_fk FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
);
