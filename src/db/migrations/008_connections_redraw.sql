-- Nouvelle règle du générateur (pas 4 cases d'un même type ou tag hors des
-- groupes) : les grilles à venir encore jamais jouées sont retirées. Les
-- grilles déjà jouées restent ; l'admin peut les régénérer.
DELETE FROM connection_puzzles
WHERE date >= date('now', '-1 day')
  AND NOT EXISTS (SELECT 1 FROM connection_games g WHERE g.date = connection_puzzles.date);
