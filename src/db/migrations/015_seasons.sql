-- Saisons du classement : une saison court de start_date jusqu'à la veille
-- de la suivante ; la dernière est en cours. Lancées et nommées par l'admin.
-- La première couvre tout l'historique.
CREATE TABLE seasons (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO seasons (name, start_date)
VALUES ('Season 1', COALESCE((SELECT MIN(date) FROM games), date('now')));
