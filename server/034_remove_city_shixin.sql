-- 2026.10.17: 오나라 신도(shixin) 도시를 없앤다. 033으로 넣은 행이 있으면 지운다(익주 광한 xindu는 그대로).
DELETE FROM faction_territory_states WHERE cityId = 'shixin';
