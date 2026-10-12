-- 서버 지급 원장: 금화·신화 조각 지급(일일 금화, 시나리오 최초 클리어, 세력전 승리, 유저 대련)을 서버만 기록한다.
ALTER TABLE game_account_states
  ADD COLUMN IF NOT EXISTS `grantLedger` mediumtext NULL;
