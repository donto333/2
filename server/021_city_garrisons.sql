-- 아군 도시 수비대(진영 공용)와 최근 중립 습격 결과를 서버가 기억한다.
-- garrisonsData: {"list":[{"id","userId","power","averageLevel","label"}],"defeated":0}
-- lastRaidData : {"at","attackerCityId","attackerLevel","raidPower","attackerWon","damage","defenderLabel","captured"}
ALTER TABLE faction_territory_states
  ADD COLUMN IF NOT EXISTS `garrisonsData` mediumtext NULL,
  ADD COLUMN IF NOT EXISTS `lastRaidData` text NULL;
