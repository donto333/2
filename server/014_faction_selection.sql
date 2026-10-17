ALTER TABLE game_account_states
  ADD COLUMN factionChosen TINYINT(1) NOT NULL DEFAULT 0 AFTER faction;
