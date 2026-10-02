-- Immutable board definition for the first strategy battle season.
-- Scores are client-reported casual results, bounded by the shared runtime contract.
INSERT IGNORE INTO game_lb_boards
(namespace,id,rules_version,direction,min_score,max_score,min_duration_ms,max_duration_ms,`open`)
VALUES
('production','war-score-v1','v1','desc',0,1000000,0,1800000,TRUE);
