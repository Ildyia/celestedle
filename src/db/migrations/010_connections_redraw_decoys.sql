-- Nouvelle règle du générateur (pas de « faux groupe parfait » : exactement 4
-- cases d'une même catégorie hors des groupes) : les grilles du jour et à
-- venir encore jamais jouées sont retirées. Les grilles d'entraînement aussi.
DELETE FROM connection_puzzles
WHERE (date >= date('now', '-1 day') OR date LIKE 'practice:%')
  AND NOT EXISTS (SELECT 1 FROM connection_games g WHERE g.date = connection_puzzles.date);
