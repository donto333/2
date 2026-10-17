UPDATE faction_territory_states
SET owner = '중립', conquestProgress = 0, version = version + 1, updatedByUserId = NULL
WHERE cityId NOT IN ('chengdu', 'ye', 'jianye');

UPDATE faction_territory_states
SET owner = CASE cityId
  WHEN 'chengdu' THEN '촉한'
  WHEN 'ye' THEN '위나라'
  WHEN 'jianye' THEN '오나라'
END,
conquestProgress = 0,
version = version + 1,
updatedByUserId = NULL
WHERE cityId IN ('chengdu', 'ye', 'jianye');
