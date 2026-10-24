-- Mode Hard : un essai qui ne colle pas aux indices est refusé (pas de
-- verdict, pas de ligne au tableau) mais consomme quand même un essai
ALTER TABLE games ADD COLUMN wasted_tries INTEGER NOT NULL DEFAULT 0;

DROP VIEW game_summaries;
CREATE VIEW game_summaries AS
  SELECT g.*,
         (SELECT COUNT(*) FROM guesses gu WHERE gu.game_id = g.id) + g.wasted_tries AS tries,
         (SELECT COUNT(*) FROM game_hints gh WHERE gh.game_id = g.id) AS hints,
         CASE WHEN g.finished_at IS NULL THEN NULL
              ELSE CAST(ROUND((julianday(g.finished_at) - julianday(g.started_at)) * 86400) AS INTEGER)
         END AS seconds
  FROM games g;
