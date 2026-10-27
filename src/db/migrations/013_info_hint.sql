-- Indice « info » : SQLite ne modifie pas un CHECK, on reconstruit la table.
-- La vue game_summaries lit game_hints : supprimée puis recréée à l'identique.
DROP VIEW game_summaries;

CREATE TABLE game_hints_new (
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('opposite', 'secret_info', 'truth_and_lies', 'info')),
  payload    TEXT NOT NULL,                        -- indice figé au moment de l'utilisation
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, type)
);
INSERT INTO game_hints_new SELECT game_id, type, payload, created_at FROM game_hints;
DROP TABLE game_hints;
ALTER TABLE game_hints_new RENAME TO game_hints;

CREATE VIEW game_summaries AS
  SELECT g.*,
         (SELECT COUNT(*) FROM guesses gu WHERE gu.game_id = g.id) + g.wasted_tries AS tries,
         (SELECT COUNT(*) FROM game_hints gh WHERE gh.game_id = g.id) AS hints,
         CASE WHEN g.finished_at IS NULL THEN NULL
              ELSE CAST(ROUND((julianday(g.finished_at) - julianday(g.started_at)) * 86400) AS INTEGER)
         END AS seconds
  FROM games g;
